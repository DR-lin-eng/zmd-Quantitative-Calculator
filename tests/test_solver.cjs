// Run with: node --test tests/test_solver.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const solver = require("../web/solver.js");

const config = path.join(__dirname, "..", "config");
const itemsData = JSON.parse(fs.readFileSync(path.join(config, "items.json"), "utf8"));
const machines = JSON.parse(fs.readFileSync(path.join(config, "machines.json"), "utf8")).machines;

function solve(targets, suppliesPerMin = {}, machineLimits = {}, objective = "machines", extra = {}) {
  const supplies = {};
  for (const item of itemsData.items) {
    if (!item.map_only || item.startup_only) continue;
    const perMin = suppliesPerMin[item.id];
    supplies[item.id] = perMin === undefined ? Infinity : perMin / 60;
  }
  return solver.solve({
    items: itemsData.items,
    disposal: itemsData.disposal,
    machines,
    logistics: itemsData.logistics,
    environments: itemsData.environments,
    supplies,
    machineLimits,
    targets,
    objective,
    ...extra
  });
}

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) <= 1e-4 * Math.max(1, Math.abs(expected)), `${message}: ${actual} != ${expected}`);

/** Every item must be produced at least as fast as it is consumed. */
function assertBalanced(result, suppliesPerMin) {
  const net = {};
  for (const run of result.runs) {
    for (const io of run.outputs) net[io.item] = (net[io.item] || 0) + io.rate;
    for (const io of run.inputs) net[io.item] = (net[io.item] || 0) - io.rate;
  }
  for (const [id, used] of Object.entries(result.rawUsage)) {
    net[id] = (net[id] || 0) + used;
    if (suppliesPerMin[id] !== undefined) assert.ok(used * 60 <= suppliesPerMin[id] + 1e-4, `supply exceeded: ${id}`);
  }
  for (const output of result.outputs) net[output.itemId] = (net[output.itemId] || 0) - output.rate;
  for (const [id, value] of Object.entries(net)) assert.ok(value > -1e-4, `deficit of ${id}: ${value}`);
}

test("config references are consistent", () => {
  const itemIds = new Set(itemsData.items.map((item) => item.id));
  const machineIds = new Set(machines.map((machine) => machine.id));
  const recipes = itemsData.items.flatMap((item) => item.recipes).concat(itemsData.disposal);
  assert.ok(recipes.length > 200);
  for (const recipe of recipes) {
    assert.ok(machineIds.has(recipe.machine), `unknown machine ${recipe.machine}`);
    for (const io of (recipe.inputs || []).concat(recipe.byproducts || [])) {
      assert.ok(itemIds.has(io.item), `unknown item ${io.item}`);
    }
  }
});

test("simple chain uses all of the limiting raw", () => {
  const result = solve([{ itemId: "iron_cmpt", maximize: true }], { iron_ore: 60 });
  close(result.outputs[0].rate * 60, 60, "iron_cmpt per minute");
  assert.deepStrictEqual(result.runs.map((run) => [run.machineId, run.machineCount]).sort(), [["cmpt_mc_1", 2], ["furnance_1", 2]]);
  assertBalanced(result, { iron_ore: 60 });
});

test("seed loops are self-sustaining and unbounded targets fall back to one machine", () => {
  const result = solve([{ itemId: "bottled_food_3", maximize: true }]);
  close(result.outputs[0].rate * 60, 6, "bottled_food_3 per minute");
  assert.ok(result.warnings.some((warning) => warning.code === "unbounded"));
  assertBalanced(result, {});
});

test("fixed rate target with byproducts leaves no fluid surplus", () => {
  const result = solve([{ itemId: "copper_enr2_cmpt", rate: 6 / 60 }]);
  close(result.outputs[0].rate * 60, 6, "copper_enr2_cmpt per minute");
  assert.ok(!result.surplus.some((entry) => entry.fluid), "sewage must be treated");
  assertBalanced(result, {});
});

test("priorities are lexicographic and machine limits hold after rounding", () => {
  const supplies = { copper_ore: 120, iron_ore: 60, originium_ore: 120, quartz_sand: 60, liquid_water: 600, liquid_acid: 240, gas_inert: 60, gas_xiranite: 60 };
  const first = solve([{ itemId: "proc_battery_5", maximize: true }], supplies, { xiranite_oven_1: 1 });
  const both = solve([{ itemId: "proc_battery_5", maximize: true }, { itemId: "tundra_coupon", maximize: true }], supplies, { xiranite_oven_1: 1 });
  close(both.outputs[0].rate, first.outputs[0].rate, "first priority keeps its optimum");
  assert.ok(both.outputs[1].rate > 0);
  for (const result of [first, both]) {
    const ovens = result.runs.filter((run) => run.machineId === "xiranite_oven_1").reduce((sum, run) => sum + run.machineCount, 0);
    assert.ok(ovens <= 1);
    assertBalanced(result, supplies);
  }
});

test("mixing recipes beats any single coupon route", () => {
  const supplies = { originium_ore: 120, quartz_sand: 60, iron_ore: 60 };
  for (const id of ["copper_ore", "liquid_water", "liquid_acid", "gas_inert", "gas_xiranite"]) supplies[id] = 0.0001;
  const mixed = solve([{ itemId: "tundra_coupon", maximize: true }], supplies).outputs[0].rate;
  const coupon = itemsData.items.find((item) => item.id === "tundra_coupon");
  for (const recipe of coupon.recipes) {
    const single = solver.solve({
      items: itemsData.items.map((item) => (item.id === "tundra_coupon" ? { ...item, recipes: [recipe] } : item)),
      disposal: itemsData.disposal,
      machines,
      logistics: itemsData.logistics,
      environments: itemsData.environments,
      supplies: Object.fromEntries(Object.entries(supplies).map(([id, value]) => [id, value / 60])),
      targets: [{ itemId: "tundra_coupon", maximize: true }]
    }).outputs[0].rate;
    assert.ok(mixed >= single - 1e-6, `${recipe.id}: ${single} > ${mixed}`);
  }
});

test("gas environments charge one diffuser and are skipped when the gas is missing", () => {
  const target = [{ itemId: "xiranite_powder", rate: 30 / 60 }];
  // Without xiranite gas the choice is carbon + stable environment, or twice the enriched carbon.
  const noXiraniteGas = { gas_xiranite: 1e-6 };
  const withGas = solve(target, noXiraniteGas);
  assert.deepStrictEqual(withGas.environments.map((env) => env.id), ["gas_inert"]);
  close(withGas.rawUsage.gas_inert * 60, 6, "diffuser feed per minute");
  assert.ok(withGas.runs.some((run) => run.environment === "gas_inert" && run.machineId === "vaporizer_1"));
  assertBalanced(withGas, noXiraniteGas);

  const withoutGas = [
    solve(target, { ...noXiraniteGas, gas_inert: 3 }),
    solve(target, noXiraniteGas, {}, "machines", { disabledEnvs: ["gas_inert"] })
  ];
  for (const result of withoutGas) {
    assert.deepStrictEqual(result.environments, []);
    assert.ok(!result.runs.some((run) => run.env), "no environment recipe without a diffuser");
    close(result.outputs[0].rate * 60, 30, "still produced by the non-environment recipe");
  }
});

test("a fixed rate of zero makes nothing and leaves the raw for later targets", () => {
  const supplies = { iron_ore: 60 };
  const result = solve(
    [
      { itemId: "iron_cmpt", rate: 0 },
      { itemId: "iron_nugget", maximize: true }
    ],
    supplies
  );
  close(result.outputs[0].rate, 0, "zero target");
  close(result.outputs[1].rate * 60, 60, "later target gets all the ore");
  assert.ok(!result.warnings.some((warning) => warning.itemId === "iron_cmpt"));
});

function toyModel(recipes, machines) {
  const ids = new Set();
  for (const recipe of recipes) {
    ids.add(recipe.out);
    Object.keys(recipe.in).forEach((id) => ids.add(id));
  }
  const items = Array.from(ids, (id) => ({
    id,
    recipes: recipes
      .filter((recipe) => recipe.out === id)
      .map((recipe) => ({
        id: recipe.id,
        machine: recipe.machine,
        time_sec: 1,
        output_qty: recipe.qty || 1,
        inputs: Object.entries(recipe.in).map(([item, qty]) => ({ item, qty }))
      }))
  }));
  const ports = { input_ports: 9, output_ports: 9 };
  return { items, machines: machines.map((id) => ({ id, ...ports })), logistics: { belt_per_sec: 100 } };
}

function wholeMachines(result, machineId) {
  return result.runs.filter((run) => run.machineId === machineId).reduce((sum, run) => sum + run.machineCount, 0);
}

test("a recipe idle in the relaxed plan is still tried when a machine limit forces rounding", () => {
  // Relaxed: half a machine each of a and b (1.0/s). With one whole machine, c alone gives 0.9/s.
  const model = toyModel(
    [
      { id: "a", out: "t", machine: "m", in: { r1: 1 } },
      { id: "b", out: "t", machine: "m", in: { r2: 1 } },
      { id: "c", out: "t", machine: "m", qty: 0.9, in: { r3: 0.9 } }
    ],
    ["m"]
  );
  const result = solver.solve({
    ...model,
    supplies: { r1: 0.5, r2: 0.5, r3: Infinity },
    machineLimits: { m: 1 },
    targets: [{ itemId: "t", maximize: true }]
  });
  close(result.outputs[0].rate, 0.9, "uses recipe c");
  assert.ok(wholeMachines(result, "m") <= 1);
});

test("re-solving for one machine limit does not break another", () => {
  // t needs x and y. Splitting m as 1 + 1 looks best (1.5/s) but leaves n running two recipes at
  // half load, which is two machines against a limit of one.
  const model = toyModel(
    [
      { id: "t", out: "t", machine: "free", in: { x: 1, y: 1 } },
      { id: "x-m", out: "x", machine: "m", in: { r: 1 } },
      { id: "y-m", out: "y", machine: "m", in: { r: 1 } },
      { id: "x-n", out: "x", machine: "n", in: { r: 1 } },
      { id: "y-n", out: "y", machine: "n", in: { r: 1 } }
    ],
    ["free", "m", "n"]
  );
  for (const objective of ["machines", "power", "raw"]) {
    const result = solver.solve({
      ...model,
      supplies: { r: Infinity },
      machineLimits: { free: 50, m: 2, n: 1 },
      targets: [{ itemId: "t", maximize: true }],
      objective
    });
    assert.ok(wholeMachines(result, "m") <= 2, `m within limit (${objective})`);
    assert.ok(wholeMachines(result, "n") <= 1, `n within limit (${objective})`);
    close(result.outputs[0].rate, 1, `best whole-machine plan (${objective})`);
  }
});
