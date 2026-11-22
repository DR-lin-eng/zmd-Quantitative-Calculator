/*
 * Global-optimum production planner (linear programming).
 *
 * Every recipe is a variable (number of machines running it). Item balances, raw supply and
 * machine limits are linear constraints, so one solve finds the best mix of recipes, including
 * byproduct reuse, recycling loops and alternative routes. Targets are optimised in priority
 * order (lexicographic), then the cheapest plan that keeps those outputs is selected.
 *
 * No dependencies; works in browsers (window.FactorySolver) and Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FactorySolver = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EPS = 1e-9;
  const BIG = 1e6;
  const STAGE_SLACK = 1e-7;
  const MAX_LIMIT_SOLVES = 400;

  /** Primal simplex on a dense tableau. All rows are "<=" and must hold at the current point. */
  class Tableau {
    constructor(numVars, maxRows) {
      this.numVars = numVars;
      this.width = numVars + maxRows + 1;
      this.rhs = this.width - 1;
      this.rows = [];
      this.basis = [];
      this.z = new Float64Array(this.width);
    }

    addRow(coefs, rhs) {
      const row = new Float64Array(this.width);
      for (const [col, value] of coefs) row[col] += value;
      row[this.rhs] = rhs;
      for (let i = 0; i < this.rows.length; i++) {
        const factor = row[this.basis[i]];
        if (Math.abs(factor) < 1e-13) continue;
        const other = this.rows[i];
        for (let j = 0; j < this.width; j++) row[j] -= factor * other[j];
        row[this.basis[i]] = 0;
      }
      const slack = this.numVars + this.rows.length;
      row[slack] = 1;
      if (row[this.rhs] < 0) row[this.rhs] = 0;
      this.rows.push(row);
      this.basis.push(slack);
      return slack;
    }

    /** Maximise sum(c[col] * x[col]); `objective` is a Map col -> coefficient. */
    maximize(objective) {
      const z = this.z;
      z.fill(0);
      for (const [col, value] of objective) z[col] = -value;
      for (let i = 0; i < this.rows.length; i++) {
        const factor = z[this.basis[i]];
        if (factor === 0) continue;
        const row = this.rows[i];
        for (let j = 0; j < this.width; j++) z[j] -= factor * row[j];
        z[this.basis[i]] = 0;
      }
      const cols = this.rhs;
      let stalled = 0;
      for (let iter = 0; iter < 20000; iter++) {
        // Dantzig rule, falling back to Bland's rule when degenerate pivots pile up.
        let enter = -1;
        let best = -1e-9;
        for (let j = 0; j < cols; j++) {
          if (z[j] < best) {
            enter = j;
            if (stalled > 30) break;
            best = z[j];
          }
        }
        if (enter < 0) return "optimal";
        let leave = -1;
        let ratio = Infinity;
        for (let i = 0; i < this.rows.length; i++) {
          const a = this.rows[i][enter];
          if (a <= 1e-9) continue;
          const r = this.rows[i][cols] / a;
          if (r < ratio - 1e-12 || (r < ratio + 1e-12 && leave >= 0 && this.basis[i] < this.basis[leave])) {
            ratio = r;
            leave = i;
          }
        }
        if (leave < 0) return "unbounded";
        stalled = ratio < 1e-12 ? stalled + 1 : 0;
        this.pivot(leave, enter);
      }
      return "iteration_limit";
    }

    pivot(leave, enter) {
      const row = this.rows[leave];
      const inv = 1 / row[enter];
      for (let j = 0; j < this.width; j++) row[j] *= inv;
      row[enter] = 1;
      const eliminate = (target) => {
        const factor = target[enter];
        if (factor === 0) return;
        for (let j = 0; j < this.width; j++) target[j] -= factor * row[j];
        target[enter] = 0;
      };
      for (let i = 0; i < this.rows.length; i++) {
        if (i !== leave) {
          eliminate(this.rows[i]);
          if (this.rows[i][this.rhs] < 0) this.rows[i][this.rhs] = 0;
        }
      }
      eliminate(this.z);
      this.basis[leave] = enter;
    }

    values() {
      const x = new Float64Array(this.rhs);
      for (let i = 0; i < this.rows.length; i++) x[this.basis[i]] = this.rows[i][this.rhs];
      return x;
    }
  }

  function isFluid(item) {
    return !!item && (item.phase === "liquid" || item.phase === "gas");
  }

  /**
   * Cycles per second one machine can sustain: the recipe speed, capped by what its belt and
   * pipe ports can carry (a port class with no port data is not capped).
   */
  function cycleRate(recipe, machine, itemMap, logistics) {
    const belt = (logistics && logistics.belt_per_sec) || 0.5;
    const pipe = (logistics && logistics.pipe_per_sec) || 2;
    let rate = 1 / (recipe.time_sec || 1);
    if (!machine) return rate;
    const load = { inSolid: 0, inFluid: 0, outSolid: 0, outFluid: 0 };
    for (const input of recipe.inputs || []) {
      load[isFluid(itemMap[input.item]) ? "inFluid" : "inSolid"] += input.qty;
    }
    for (const output of recipe.outputs || []) {
      load[isFluid(itemMap[output.item]) ? "outFluid" : "outSolid"] += output.qty;
    }
    const caps = [
      [load.inSolid, (machine.input_ports || 0) * belt],
      [load.outSolid, (machine.output_ports || 0) * belt],
      [load.inFluid, (machine.pipe_input_ports || 0) * pipe],
      [load.outFluid, (machine.pipe_output_ports || 0) * pipe]
    ];
    for (const [qty, cap] of caps) {
      if (qty > 0 && cap > 0) rate = Math.min(rate, cap / qty);
    }
    return rate;
  }

  /** Flatten config into a recipe list with explicit outputs. */
  function collectRecipes(config) {
    const itemMap = {};
    for (const item of config.items) itemMap[item.id] = item;
    const machineMap = {};
    for (const machine of config.machines) machineMap[machine.id] = machine;
    const recipes = [];
    const seen = new Set();
    const push = (recipe) => {
      let id = recipe.id;
      while (seen.has(id)) id += "'";
      seen.add(id);
      recipe.id = id;
      recipe.machineDef = machineMap[recipe.machine] || null;
      recipe.cycles = cycleRate(recipe, recipe.machineDef, itemMap, config.logistics);
      recipes.push(recipe);
    };
    for (const item of config.items) {
      (item.recipes || []).forEach((r, index) => {
        push({
          id: r.id || `${item.id}#${index}`,
          itemId: item.id,
          env: r.env || "",
          machine: r.machine,
          time_sec: r.time_sec || 1,
          inputs: r.inputs || [],
          outputs: [{ item: item.id, qty: r.output_qty || 1 }].concat(r.byproducts || []),
          disposal: false
        });
      });
    }
    (config.disposal || []).forEach((r, index) => {
      push({
        id: r.id || `disposal#${index}`,
        itemId: r.inputs && r.inputs[0] ? r.inputs[0].item : "",
        machine: r.machine,
        time_sec: r.time_sec || 1,
        inputs: r.inputs || [],
        outputs: [],
        disposal: true
      });
    });
    return { recipes, itemMap, machineMap };
  }

  function objectiveWeights(mode, recipe) {
    const machine = recipe.machineDef || {};
    const power = machine.power || 0;
    const area = machine.kit_size || 1;
    if (machine.virtual) return 1e-6;
    if (mode === "power") return power + 0.01 + 1e-4 * area;
    if (mode === "raw") return 1e-3 + 1e-6 * power;
    return 1 + 1e-4 * power + 1e-6 * area;
  }

  /**
   * One lexicographic solve. `caps[k]` bounds target k. `bounds` holds whole-machine bounds per
   * recipe index: `hi` caps a recipe's machines, `lo` reserves that many even if it runs fewer.
   */
  function solveOnce(model, caps, bounds) {
    const { recipes, itemMap, supplies, machineLimits, targets, objective } = model;
    const itemIds = model.itemIds;
    const nR = recipes.length;
    const supplyIds = model.supplyIds;
    const nS = supplyIds.length;
    const nT = targets.length;
    const lo = (bounds && bounds.lo) || new Map();
    const hi = (bounds && bounds.hi) || new Map();
    // A recipe with reserved machines gets a column for the machines it uses beyond them.
    const colExtra = new Map();
    for (const r of lo.keys()) colExtra.set(r, nR + nS + nT + colExtra.size);
    const numVars = nR + nS + nT + colExtra.size;
    const colSupply = (i) => nR + i;
    const colTarget = (k) => nR + nS + k;
    const limited = Object.keys(machineLimits);
    const maxRows = itemIds.length + nS + nT * 2 + limited.length + lo.size + hi.size + 4;
    const lp = new Tableau(numVars, maxRows);

    const balance = {};
    for (const id of itemIds) balance[id] = [];
    recipes.forEach((recipe, r) => {
      for (const input of recipe.inputs) balance[input.item].push([r, input.qty * recipe.cycles]);
      for (const output of recipe.outputs) balance[output.item].push([r, -output.qty * recipe.cycles]);
    });
    supplyIds.forEach((id, i) => balance[id].push([colSupply(i), -1]));
    targets.forEach((target, k) => balance[target.itemId].push([colTarget(k), 1]));

    const surplusCol = {};
    for (const id of itemIds) surplusCol[id] = lp.addRow(balance[id], 0);
    supplyIds.forEach((id, i) => {
      if (Number.isFinite(supplies[id])) lp.addRow([[colSupply(i), 1]], supplies[id]);
    });
    targets.forEach((target, k) => lp.addRow([[colTarget(k), 1]], caps[k]));
    for (const machineId of limited) {
      const coefs = [];
      let free = machineLimits[machineId];
      recipes.forEach((recipe, r) => {
        if (recipe.machine !== machineId) return;
        coefs.push([colExtra.has(r) ? colExtra.get(r) : r, 1]);
        free -= lo.get(r) || 0;
      });
      if (coefs.length) lp.addRow(coefs, free);
    }
    for (const [r, reserved] of lo) lp.addRow([[r, 1], [colExtra.get(r), -1]], reserved);
    for (const [r, cap] of hi) lp.addRow([[r, 1]], cap);

    const stageValues = [];
    for (let k = 0; k < nT; k++) {
      const status = lp.maximize(new Map([[colTarget(k), 1]]));
      const value = lp.values()[colTarget(k)];
      if (status === "unbounded" || value >= BIG * 0.5) return { unbounded: k };
      stageValues.push(value);
      lp.addRow([[colTarget(k), -1]], -value * (1 - STAGE_SLACK));
    }

    const cost = new Map();
    recipes.forEach((recipe, r) => cost.set(r, -objectiveWeights(objective, recipe)));
    supplyIds.forEach((id, i) => cost.set(colSupply(i), objective === "raw" ? -1 : -1e-6));
    for (const id of itemIds) cost.set(surplusCol[id], isFluid(itemMap[id]) ? -1e3 : -1e-6);
    lp.maximize(cost);
    const x = lp.values();

    let totalCost = 0;
    for (const [col, value] of cost) totalCost -= value * x[col];
    return { x, stageValues, totalCost, surplusCol, colSupply, colTarget };
  }

  function betterThan(a, b) {
    if (!b) return true;
    for (let k = 0; k < a.stageValues.length; k++) {
      const scale = Math.max(1e-9, Math.abs(a.stageValues[k]), Math.abs(b.stageValues[k]));
      const diff = (a.stageValues[k] - b.stageValues[k]) / scale;
      if (diff > 1e-6) return true;
      if (diff < -1e-6) return false;
    }
    return a.totalCost < b.totalCost - 1e-9;
  }

  /** Limited machine types whose per-recipe whole-machine counts add up past the limit. */
  function overusedMachines(model, byMachine, x) {
    return Object.keys(byMachine).filter((id) => {
      let needed = 0;
      for (const r of byMachine[id]) {
        if (x[r] > 1e-5) needed += Math.ceil(x[r] - 1e-6);
      }
      return needed > model.machineLimits[id];
    });
  }

  /** Whether the machines reserved by `lo` still fit every limit. */
  function reservationsFit(model, byMachine, lo) {
    return Object.keys(byMachine).every((id) => {
      let reserved = 0;
      for (const r of byMachine[id]) reserved += lo.get(r) || 0;
      return reserved <= model.machineLimits[id];
    });
  }

  /**
   * Machine limits count whole machines per recipe, which the relaxed solve ignores. Branch and
   * bound on the machine count of one partly loaded recipe at a time: either it gets fewer whole
   * machines (`hi`) or it reserves the next whole machine (`lo`). Exact unless the solve budget
   * runs out, in which case the best whole-machine plan found so far is returned.
   */
  function enforceIntegerLimits(model, caps, relaxed) {
    const { recipes, machineLimits } = model;
    const byMachine = {};
    recipes.forEach((recipe, r) => {
      if (machineLimits[recipe.machine] === undefined) return;
      (byMachine[recipe.machine] = byMachine[recipe.machine] || []).push(r);
    });
    const fits = (result) => !overusedMachines(model, byMachine, result.x).length;
    if (fits(relaxed)) return { result: relaxed, exact: true };

    let solves = 0;
    const solveNode = (lo, hi) => {
      if (!reservationsFit(model, byMachine, lo)) return null;
      solves += 1;
      const result = solveOnce(model, caps, { lo, hi });
      return result.unbounded === undefined ? { lo, hi, result } : null;
    };

    // Starting plan that always fits: round the relaxed counts, largest remainders first.
    const rounded = new Map();
    for (const id of Object.keys(byMachine)) {
      const list = byMachine[id];
      let left = machineLimits[id];
      for (const r of list) {
        rounded.set(r, Math.floor(relaxed.x[r] + 1e-6));
        left -= rounded.get(r);
      }
      const order = list.slice().sort((a, b) => relaxed.x[b] - rounded.get(b) - (relaxed.x[a] - rounded.get(a)));
      for (const r of order) {
        if (left <= 0 || relaxed.x[r] - rounded.get(r) <= 1e-6) break;
        rounded.set(r, rounded.get(r) + 1);
        left -= 1;
      }
    }
    const start = solveNode(new Map(), rounded);
    let best = start && fits(start.result) ? start.result : null;

    let exact = true;
    const stack = [{ lo: new Map(), hi: new Map(), result: relaxed }];
    while (stack.length) {
      const node = stack.pop();
      if (best && !betterThan(node.result, best)) continue;
      const over = overusedMachines(model, byMachine, node.result.x);
      if (!over.length) {
        best = node.result;
        continue;
      }
      if (solves >= MAX_LIMIT_SOLVES) {
        exact = false;
        break;
      }
      // Branch on the partly loaded recipe closest to a whole machine.
      let pick = -1;
      let pickCount = 0;
      let pickGap = Infinity;
      for (const id of over) {
        for (const r of byMachine[id]) {
          const value = node.result.x[r];
          if (value <= 1e-5) continue;
          const count = Math.ceil(value - 1e-6);
          const gap = count - value;
          if (gap <= 1e-6 || count <= (node.lo.get(r) || 0)) continue;
          if (gap < pickGap) {
            pick = r;
            pickCount = count;
            pickGap = gap;
          }
        }
      }
      if (pick < 0) {
        exact = false;
        continue;
      }
      const down = solveNode(node.lo, new Map(node.hi).set(pick, pickCount - 1));
      const up = solveNode(new Map(node.lo).set(pick, pickCount), node.hi);
      const children = [down, up].filter((child) => child && (!best || betterThan(child.result, best)));
      // Depth first, most promising child first.
      children.sort((a, b) => (betterThan(a.result, b.result) ? 1 : -1));
      stack.push(...children);
    }
    return { result: best || relaxed, exact: exact && !!best };
  }

  /** Solve one fixed choice of gas environments. Returns null when a chosen environment cannot be fed. */
  function solveScenario(config, allRecipes, itemMap, userTargets, activeEnvs) {
    const warnings = [];
    const envIds = new Set(activeEnvs.map((env) => env.id));
    const recipes = allRecipes.filter((recipe) => !recipe.envCharged || envIds.has(recipe.env));
    // Each diffuser is a hidden top-priority target that drains its gas at the minimum feed rate.
    const hidden = activeEnvs.map((env) => ({ itemId: env.gas, rate: env.rate_per_sec, maximize: false }));
    const targets = hidden.concat(userTargets);

    const itemSet = new Set();
    for (const recipe of recipes) {
      for (const io of recipe.inputs) itemSet.add(io.item);
      for (const io of recipe.outputs) itemSet.add(io.item);
    }
    for (const target of targets) itemSet.add(target.itemId);

    const supplies = {};
    for (const [id, value] of Object.entries(config.supplies || {})) {
      if (itemSet.has(id) && (value === Infinity || value > 0)) supplies[id] = value;
    }
    const machineLimits = {};
    for (const [id, value] of Object.entries(config.machineLimits || {})) {
      if (Number.isFinite(value) && value >= 0) machineLimits[id] = Math.floor(value);
    }

    const model = {
      recipes,
      itemMap,
      itemIds: Array.from(itemSet),
      supplies,
      supplyIds: Object.keys(supplies),
      machineLimits,
      targets,
      objective: config.objective || "machines"
    };

    const caps = targets.map((target) => (target.maximize ? BIG : target.rate));
    let result = null;
    for (let attempt = 0; attempt <= targets.length; attempt++) {
      result = solveOnce(model, caps, null);
      if (result.unbounded === undefined) break;
      // Nothing limits this target: fall back to one machine of its fastest recipe.
      const k = result.unbounded;
      const own = recipes.filter((r) => !r.disposal && r.itemId === targets[k].itemId);
      const fallback = own.reduce((max, r) => Math.max(max, r.outputs[0].qty * r.cycles), 0) || 1;
      caps[k] = fallback;
      warnings.push({ code: "unbounded", itemId: targets[k].itemId, rate: fallback });
    }
    if (!result || result.unbounded !== undefined) return null;

    const limited = enforceIntegerLimits(model, caps, result);
    result = limited.result;
    if (!limited.exact) warnings.push({ code: "limit_rounded" });

    for (let k = 0; k < hidden.length; k++) {
      if (result.stageValues[k] < hidden[k].rate * (1 - 1e-6)) return null;
    }
    return {
      model,
      warnings,
      activeEnvs,
      hiddenCount: hidden.length,
      x: result.x,
      colSupply: result.colSupply,
      colTarget: result.colTarget,
      surplusCol: result.surplusCol,
      stageValues: result.stageValues.slice(hidden.length),
      totalCost: result.totalCost
    };
  }

  function solve(config) {
    const warnings = [];
    const { recipes, itemMap, machineMap } = collectRecipes(config);

    const targets = [];
    for (const target of config.targets || []) {
      if (!target.itemId) continue;
      if (!itemMap[target.itemId]) {
        warnings.push({ code: "unknown_item", itemId: target.itemId });
        continue;
      }
      // A fixed rate of 0 means "make none"; only a missing rate falls back to maximising.
      const rate = Number.isFinite(target.rate) && target.rate >= 0 ? target.rate : null;
      targets.push({ itemId: target.itemId, rate, maximize: !!target.maximize || rate === null });
    }

    // Recipes tied to a gas environment need a diffuser, which burns gas at a fixed rate no matter
    // how many machines it covers. That fixed charge is not linear, so every on/off combination of
    // the environments is solved and the best one kept.
    const disabled = new Set(config.disabledEnvs || []);
    const envById = {};
    for (const env of config.environments || []) envById[env.id] = env;
    for (const recipe of recipes) recipe.envCharged = !!(recipe.env && envById[recipe.env]);
    const usedEnvIds = new Set(recipes.filter((r) => r.envCharged).map((r) => r.env));
    const candidates = Object.values(envById)
      .filter((env) => usedEnvIds.has(env.id) && !disabled.has(env.id))
      .slice(0, 4);

    let best = null;
    for (let mask = 0; mask < 1 << candidates.length; mask++) {
      const active = candidates.filter((_, index) => mask & (1 << index));
      const scenario = solveScenario(config, recipes, itemMap, targets, active);
      if (!scenario) continue;
      // An environment that ends up unused only wastes gas; the subset without it covers that case.
      const idle = active.some((env) => !scenario.model.recipes.some((r, i) => r.env === env.id && scenario.x[i] > 1e-5));
      if (idle) continue;
      if (betterThan(scenario, best)) best = scenario;
    }
    if (!best) {
      return { outputs: [], runs: [], rawUsage: {}, surplus: [], environments: [], warnings, machineMap };
    }
    warnings.push(...best.warnings);

    const x = best.x;
    const model = best.model;
    const clean = (value) => (Math.abs(value) < 1e-7 ? 0 : value);
    const outputs = targets.map((target, k) => {
      const rate = clean(x[best.colTarget(k + best.hiddenCount)]);
      if (!target.maximize && rate < target.rate * (1 - 1e-6)) {
        warnings.push({ code: "target_short", itemId: target.itemId, rate, wanted: target.rate });
      }
      if (rate <= 0 && (target.maximize || target.rate > 0)) warnings.push({ code: "target_zero", itemId: target.itemId });
      return { itemId: target.itemId, rate };
    });

    const runs = [];
    model.recipes.forEach((recipe, r) => {
      const machines = x[r];
      if (machines <= 1e-5) return;
      const cycles = machines * recipe.cycles;
      const primary = recipe.outputs[0];
      runs.push({
        recipeId: recipe.id,
        itemId: recipe.itemId,
        machineId: recipe.machine,
        machines,
        machineCount: Math.max(1, Math.ceil(machines - 1e-6)),
        rate: (primary ? primary.qty : recipe.inputs[0].qty) * cycles,
        perMachineRate: (primary ? primary.qty : recipe.inputs[0].qty) * recipe.cycles,
        portLimited: recipe.cycles < 1 / recipe.time_sec - EPS,
        disposal: recipe.disposal,
        env: recipe.envCharged ? recipe.env : "",
        inputs: recipe.inputs.map((io) => ({ item: io.item, rate: io.qty * cycles })),
        outputs: recipe.outputs.map((io) => ({ item: io.item, rate: io.qty * cycles }))
      });
    });

    const environments = best.activeEnvs.map((env) => {
      const covered = runs.filter((run) => run.env === env.id).reduce((sum, run) => sum + run.machineCount, 0);
      runs.push({
        recipeId: `env:${env.id}`,
        itemId: env.gas,
        machineId: env.machine,
        machines: 1,
        machineCount: 1,
        rate: env.rate_per_sec,
        perMachineRate: env.rate_per_sec,
        portLimited: false,
        disposal: false,
        environment: env.id,
        env: "",
        inputs: [{ item: env.gas, rate: env.rate_per_sec }],
        outputs: []
      });
      warnings.push({ code: "env_used", envId: env.id, itemId: env.gas, rate: env.rate_per_sec, machines: covered });
      return { id: env.id, gas: env.gas, rate: env.rate_per_sec, machines: covered };
    });

    const rawUsage = {};
    model.supplyIds.forEach((id, i) => {
      const used = clean(x[best.colSupply(i)]);
      if (used > 0) rawUsage[id] = used;
    });

    const surplus = [];
    for (const id of model.itemIds) {
      const rate = clean(x[best.surplusCol[id]]);
      if (rate <= 0) continue;
      const fluid = isFluid(itemMap[id]);
      surplus.push({ itemId: id, rate, fluid });
      if (fluid) warnings.push({ code: "fluid_surplus", itemId: id, rate });
    }

    return { outputs, runs, rawUsage, surplus, environments, warnings, machineMap };
  }

  return { solve, cycleRate, collectRecipes, Tableau };
});
