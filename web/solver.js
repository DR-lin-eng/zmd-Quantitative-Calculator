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
  const MAX_ALLOCATIONS = 32;

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

  /** One lexicographic solve. `caps[k]` bounds target k; `allocation` pins machine-limited recipes. */
  function solveOnce(model, caps, allocation) {
    const { recipes, itemMap, supplies, machineLimits, targets, objective } = model;
    const itemIds = model.itemIds;
    const nR = recipes.length;
    const supplyIds = model.supplyIds;
    const nS = supplyIds.length;
    const nT = targets.length;
    const numVars = nR + nS + nT;
    const colSupply = (i) => nR + i;
    const colTarget = (k) => nR + nS + k;
    const limited = Object.keys(machineLimits);
    const maxRows = itemIds.length + nS + nT * 2 + limited.length + nR + 4;
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
      recipes.forEach((recipe, r) => {
        if (recipe.machine === machineId) coefs.push([r, 1]);
      });
      if (coefs.length) lp.addRow(coefs, machineLimits[machineId]);
    }
    if (allocation) {
      for (const [r, count] of allocation) lp.addRow([[r, 1]], count);
    }

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

  /** All ways to hand out `total` machines to `count` recipes. */
  function compositions(total, count) {
    if (count === 1) return [[total]];
    const out = [];
    for (let first = total; first >= 0; first--) {
      for (const rest of compositions(total - first, count - 1)) out.push([first].concat(rest));
    }
    return out;
  }

  /** Machine limits are integers per recipe: split each limited machine's count among recipes. */
  function enforceIntegerLimits(model, caps, relaxed) {
    const { recipes, machineLimits } = model;
    const groups = [];
    for (const machineId of Object.keys(machineLimits)) {
      const limit = machineLimits[machineId];
      const all = [];
      recipes.forEach((recipe, r) => {
        if (recipe.machine === machineId) all.push(r);
      });
      const active = all.filter((r) => relaxed.x[r] > 1e-5);
      const needed = active.reduce((sum, r) => sum + Math.ceil(relaxed.x[r] - 1e-6), 0);
      if (needed <= limit) continue;
      let options;
      const combos = active.length <= 6 && limit <= 12 ? compositions(limit, active.length) : null;
      if (combos && combos.length <= MAX_ALLOCATIONS) {
        options = combos;
      } else {
        // largest-remainder rounding of the relaxed solution
        const counts = active.map((r) => Math.floor(relaxed.x[r] + 1e-6));
        let left = limit - counts.reduce((a, b) => a + b, 0);
        const order = active
          .map((r, i) => [relaxed.x[r] - counts[i], i])
          .sort((a, b) => b[0] - a[0]);
        for (const [, i] of order) {
          if (left <= 0) break;
          counts[i] += 1;
          left -= 1;
        }
        options = [counts];
      }
      groups.push({ all, active, options });
    }
    if (!groups.length) return { result: relaxed, exact: true };

    let plans = [[]];
    let exact = true;
    for (const group of groups) {
      const next = [];
      for (const plan of plans) {
        for (const option of group.options) {
          if (next.length >= MAX_ALLOCATIONS) {
            exact = false;
            break;
          }
          const pins = group.all.map((r) => {
            const index = group.active.indexOf(r);
            return [r, index >= 0 ? option[index] : 0];
          });
          next.push(plan.concat(pins));
        }
      }
      if (group.options.length === 1) exact = false;
      plans = next;
    }
    let best = null;
    for (const plan of plans) {
      const candidate = solveOnce(model, caps, plan);
      if (candidate.unbounded !== undefined) continue;
      if (betterThan(candidate, best)) best = candidate;
    }
    return { result: best || relaxed, exact };
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
      const rate = Number.isFinite(target.rate) && target.rate > 0 ? target.rate : null;
      targets.push({ itemId: target.itemId, rate, maximize: !!target.maximize || rate === null });
    }

    const itemSet = new Set();
    for (const recipe of recipes) {
      for (const io of recipe.inputs) itemSet.add(io.item);
      for (const io of recipe.outputs) itemSet.add(io.item);
    }
    for (const target of targets) itemSet.add(target.itemId);
    const itemIds = Array.from(itemSet);

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
      itemIds,
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
    if (!result || result.unbounded !== undefined) {
      return { outputs: [], runs: [], rawUsage: {}, surplus: [], warnings, recipes: [] };
    }

    const limited = enforceIntegerLimits(model, caps, result);
    result = limited.result;
    if (!limited.exact) warnings.push({ code: "limit_rounded" });

    const x = result.x;
    const clean = (value) => (Math.abs(value) < 1e-7 ? 0 : value);
    const outputs = targets.map((target, k) => {
      const rate = clean(x[result.colTarget(k)]);
      if (!target.maximize && rate < target.rate * (1 - 1e-6)) {
        warnings.push({ code: "target_short", itemId: target.itemId, rate, wanted: target.rate });
      }
      if (rate <= 0) warnings.push({ code: "target_zero", itemId: target.itemId });
      return { itemId: target.itemId, rate };
    });

    const runs = [];
    recipes.forEach((recipe, r) => {
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
        inputs: recipe.inputs.map((io) => ({ item: io.item, rate: io.qty * cycles })),
        outputs: recipe.outputs.map((io) => ({ item: io.item, rate: io.qty * cycles }))
      });
    });

    const rawUsage = {};
    model.supplyIds.forEach((id, i) => {
      const used = clean(x[result.colSupply(i)]);
      if (used > 0) rawUsage[id] = used;
    });

    const surplus = [];
    for (const id of itemIds) {
      const rate = clean(x[result.surplusCol[id]]);
      if (rate <= 0) continue;
      const fluid = isFluid(itemMap[id]);
      surplus.push({ itemId: id, rate, fluid });
      if (fluid) warnings.push({ code: "fluid_surplus", itemId: id, rate });
    }

    return { outputs, runs, rawUsage, surplus, warnings, machineMap };
  }

  return { solve, cycleRate, collectRecipes, Tableau };
});
