// Run with: node --test tests/test_layout.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const solver = require("../web/solver.js");
const layout = require("../web/layout.js");

const config = path.join(__dirname, "..", "config");
const itemsData = JSON.parse(fs.readFileSync(path.join(config, "items.json"), "utf8"));
const machines = JSON.parse(fs.readFileSync(path.join(config, "machines.json"), "utf8")).machines;
const itemMap = Object.fromEntries(itemsData.items.map((item) => [item.id, item]));
const machineMap = Object.fromEntries(machines.map((machine) => [machine.id, machine]));

function planFor(itemId, perMinute) {
  const supplies = {};
  for (const item of itemsData.items) {
    if (item.map_only && !item.startup_only) supplies[item.id] = Infinity;
  }
  const solved = solver.solve({
    items: itemsData.items,
    disposal: itemsData.disposal,
    machines,
    logistics: itemsData.logistics,
    environments: itemsData.environments,
    supplies,
    machineLimits: {},
    targets: [{ itemId, rate: perMinute / 60 }]
  });
  const plan = layout.buildPlan({ runs: solved.runs, itemMap, machineMap, logistics: itemsData.logistics });
  layout.autoArrange(plan);
  return { plan, solved };
}

const machinesOf = (plan) => plan.buildings.filter((b) => b.kind === "machine");

test("config ports sit on the footprint edge and face outwards", () => {
  let checked = 0;
  for (const machine of machines) {
    if (!machine.ports) continue;
    const [w, h] = machine.size;
    for (const port of machine.ports) {
      assert.ok(port.x >= 0 && port.x < w && port.y >= 0 && port.y < h, `${machine.id} port inside footprint`);
      const sign = port.io === "in" ? -1 : 1;
      const ox = port.x + sign * port.dir[0];
      const oy = port.y + sign * port.dir[1];
      assert.ok(ox < 0 || ox >= w || oy < 0 || oy >= h, `${machine.id} port opens to the outside`);
      checked += 1;
    }
    const count = (io, type) => machine.ports.filter((port) => port.io === io && port.type === type).length;
    assert.strictEqual(count("in", "belt"), machine.input_ports, `${machine.id} belt inputs`);
    assert.strictEqual(count("out", "belt"), machine.output_ports, `${machine.id} belt outputs`);
    assert.strictEqual(count("in", "pipe"), machine.pipe_input_ports, `${machine.id} pipe inputs`);
    assert.strictEqual(count("out", "pipe"), machine.pipe_output_ports, `${machine.id} pipe outputs`);
  }
  assert.ok(checked > 100);
});

test("one building per whole machine, none overlapping after auto arrange", () => {
  const { plan, solved } = planFor("proc_battery_5", 6);
  const expected = solved.runs
    .filter((run) => !machineMap[run.machineId].virtual)
    .reduce((sum, run) => sum + Math.ceil(run.machineCount - 1e-6), 0);
  assert.strictEqual(machinesOf(plan).length, expected);
  assert.strictEqual(layout.overlapping(plan).size, 0);
  for (const building of machinesOf(plan)) {
    const [w, h] = machineMap[building.machineId].size;
    assert.deepStrictEqual(layout.sizeOf(building), { w, h });
  }
});

test("fluids travel in pipes, solids on belts, and every link gets routed", () => {
  for (const [itemId, perMinute] of [["proc_battery_5", 6], ["proc_battery_4", 6], ["proc_battery_4", 30]]) {
    const { plan } = planFor(itemId, perMinute);
    const result = layout.route(plan);
    for (const link of plan.links) {
      const phase = itemMap[link.itemId].phase;
      assert.strictEqual(link.type, phase === "liquid" || phase === "gas" ? "pipe" : "belt", link.itemId);
    }
    assert.strictEqual(result.stats.unrouted, 0, `${itemId} ${perMinute}/min`);
    assert.strictEqual(result.routes.length, plan.links.length);
  }
});

test("routes run from port (or splitter) to port (or merger) and never enter a building", () => {
  const { plan } = planFor("proc_battery_5", 6);
  const result = layout.route(plan);
  const rects = plan.buildings.map((b) => layout.rectOf(b));
  const inside = (x, y) => rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  result.routes.forEach((entry, index) => {
    const link = plan.links[index];
    const points = entry.points;
    const byId = Object.fromEntries(plan.buildings.map((b) => [b.id, b]));
    const at = (point, port, kind, marker) =>
      (point[0] === (port || marker).x && point[1] === (port || marker).y) ||
      result.junctions.some((j) => j.kind === kind && j.type === entry.type && j.x === point[0] && j.y === point[1]);
    assert.ok(at(points[0], link.fromPort, "split", byId[link.from]), `link ${link.id} starts at its output port or a splitter`);
    assert.ok(at(points[points.length - 1], link.toPort, "merge", byId[link.to]), `link ${link.id} ends at its input port or a merger`);
    for (let i = 1; i < points.length; i++) {
      const step = Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1]);
      assert.strictEqual(step, 1, "routes move one cell at a time");
    }
    for (const [x, y] of points.slice(1, -1)) assert.ok(!inside(x, y), `link ${link.id} crosses a building`);
    assert.ok(result.junctions.length > 0, "the plan shares at least one port through a splitter or merger");
  });
});

test("moving onto another building is refused", () => {
  const { plan } = planFor("proc_battery_4", 6);
  const [first, second] = machinesOf(plan);
  const before = [first.x, first.y];
  assert.strictEqual(layout.move(plan, first, second.x - first.x, second.y - first.y), false);
  assert.deepStrictEqual([first.x, first.y], before);
  assert.strictEqual(layout.move(plan, first, -200, 0), true);
  assert.strictEqual(first.x, before[0] - 200);
  assert.strictEqual(layout.overlapping(plan).size, 0);
});

test("rotation swaps the footprint, turns the ports and respects collisions", () => {
  const { plan } = planFor("proc_battery_5", 6);
  const building = machinesOf(plan).find((b) => {
    const [w, h] = machineMap[b.machineId].size;
    return w !== h;
  });
  assert.ok(building, "plan has a non-square machine");
  assert.ok(layout.move(plan, building, -300, 0));
  const { w, h } = layout.sizeOf(building);
  const ports = layout.worldPorts(building);
  assert.strictEqual(layout.rotate(plan, building, 1), true);
  assert.deepStrictEqual(layout.sizeOf(building), { w: h, h: w });
  const rect = layout.rectOf(building);
  layout.worldPorts(building).forEach((port, index) => {
    assert.strictEqual(port.d, (ports[index].d + 1) % 4);
    assert.ok(port.x >= rect.x && port.x < rect.x + rect.w && port.y >= rect.y && port.y < rect.y + rect.h);
    assert.ok(port.ox < rect.x || port.ox >= rect.x + rect.w || port.oy < rect.y || port.oy >= rect.y + rect.h);
  });
  assert.strictEqual(layout.overlapping(plan).size, 0);
  for (let i = 0; i < 3; i++) assert.ok(layout.rotate(plan, building, 1));
  assert.deepStrictEqual(layout.sizeOf(building), { w, h });

  // An obstacle on a cell that only the turned footprint covers.
  const turned = layout.sizeOf(building, 1);
  const tx = building.x + Math.round((w - turned.w) / 2);
  const ty = building.y + Math.round((h - turned.h) / 2);
  const cell = [];
  for (let x = tx; x < tx + turned.w; x++) {
    for (let y = ty; y < ty + turned.h; y++) {
      if (x < building.x || x >= building.x + w || y < building.y || y >= building.y + h) cell.push([x, y]);
    }
  }
  assert.ok(cell.length > 0);
  plan.buildings.push({ id: "wall", key: "wall", kind: "sink", x: cell[0][0], y: cell[0][1], rot: 0, w0: 1, h0: 1, ports: [], owner: "" });
  const snapshot = [building.x, building.y, building.rot];
  assert.strictEqual(layout.rotate(plan, building, 1), false);
  assert.deepStrictEqual([building.x, building.y, building.rot], snapshot);
});

test("a saved layout is restored by building key", () => {
  const { plan } = planFor("proc_battery_4", 6);
  const building = machinesOf(plan)[0];
  assert.ok(layout.move(plan, building, -150, 7));
  assert.ok(layout.rotate(plan, building, 1));
  const saved = JSON.parse(JSON.stringify(layout.serialize(plan)));
  assert.strictEqual(saved.format, "zmd-layout");
  assert.strictEqual(saved.buildings.length, plan.buildings.length);

  const fresh = planFor("proc_battery_4", 6).plan;
  const outcome = layout.applySaved(fresh, saved);
  assert.strictEqual(outcome.matched, fresh.buildings.length);
  assert.deepStrictEqual(layout.serialize(fresh), saved);
  assert.strictEqual(layout.route(fresh).stats.unrouted, 0);
});

test("a layout saved for another plan keeps what matches and never overlaps the rest", () => {
  const saved = layout.serialize(planFor("proc_battery_4", 6).plan);
  const bigger = planFor("proc_battery_4", 12).plan;
  const outcome = layout.applySaved(bigger, saved);
  assert.ok(outcome.matched > 0 && outcome.matched < outcome.total);
  assert.strictEqual(layout.overlapping(bigger).size, 0);

  assert.strictEqual(layout.applySaved(bigger, { format: "something-else", buildings: [] }), null);
  assert.strictEqual(layout.applySaved(bigger, null), null);
});

test("links sharing ports are grouped by rate so no port is overloaded needlessly", () => {
  for (const [itemId, perMinute] of [["proc_battery_2", 15], ["proc_battery_3", 15], ["proc_battery_5", 30]]) {
    const { plan } = planFor(itemId, perMinute);
    const overloaded = layout.assignPorts(plan);
    assert.strictEqual(overloaded.length, 0, `${itemId} ${perMinute}/min`);
    const shared = new Map();
    for (const link of plan.links) {
      for (const port of [link.fromPort, link.toPort]) if (port) shared.set(port.id, (shared.get(port.id) || 0) + 1);
    }
    assert.ok([...shared.values()].some((count) => count > 1), "the plan has ports shared by several links");
  }
});

test("blocked links are reported instead of dropped", () => {
  const { plan } = planFor("proc_battery_4", 6);
  const link = plan.links.find((entry) => entry.fromPort && entry.toPort);
  const target = plan.buildings.find((b) => b.id === link.to);
  // A 1x1 obstacle on the cell in front of the destination port.
  const { ox, oy } = link.toPort;
  plan.buildings.push({ id: "wall", key: "wall", kind: "sink", itemId: link.itemId, x: ox, y: oy, rot: 0, w0: 1, h0: 1, ports: [], owner: target.id });
  const result = layout.route(plan);
  const entry = result.routes.find((r) => r.linkId === link.id);
  assert.strictEqual(entry.ok, false);
  assert.ok(entry.reason);
  assert.ok(result.stats.unrouted >= 1);
});

test("large plans stay within the routing budget", () => {
  const { plan } = planFor("proc_battery_5", 120);
  const started = Date.now();
  const result = layout.route(plan);
  assert.ok(Date.now() - started < 5000, "routing finishes quickly");
  assert.strictEqual(result.routes.length, plan.links.length);
  assert.strictEqual(layout.overlapping(plan).size, 0);
});
