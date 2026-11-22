/*
 * Placement simulator: puts every machine of a production plan on a grid, checks footprints,
 * and routes belts and pipes between ports.
 *
 * The model is a simplification of the game: belts and pipes run on separate layers and may
 * cross their own kind at a right angle (a bridge), several links can share one port through
 * splitters and mergers, and raw inputs / final outputs are 1x1 depot markers.
 *
 * No dependencies; works in browsers (window.FactoryLayout) and Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FactoryLayout = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Screen directions, clockwise: up, right, down, left (y grows downwards).
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const EPS = 1e-6;
  const FORMAT = "zmd-layout";
  const STEP_COST = 10;
  const TURN_COST = 4;
  const CROSS_COST = 30;
  const JUNCTION_COST = 6;
  // Search effort: states expanded per retry and per layout, so a huge plan cannot freeze the page.
  const RETRY_STATES = 150000;
  const TOTAL_STATES = 6000000;
  const FREE = 0;
  const STRAIGHT_H = 1;
  const STRAIGHT_V = 2;
  const FULL = 3;

  function dirIndex(dir) {
    const index = DIRS.findIndex((d) => d[0] === dir[0] && d[1] === dir[1]);
    return index < 0 ? 2 : index;
  }

  // Machines without port data get belt inputs on top, belt outputs at the bottom and pipes on the sides.
  function defaultPorts(machine) {
    const [w, h] = machine.size || [1, 1];
    const ports = [];
    const spread = (count, length, make) => {
      const start = Math.max(0, Math.floor((length - count) / 2));
      for (let i = 0; i < count; i++) ports.push(make((start + i) % length));
    };
    spread(machine.input_ports || 0, w, (x) => ({ type: "belt", io: "in", x, y: 0, d: 2 }));
    spread(machine.output_ports || 0, w, (x) => ({ type: "belt", io: "out", x, y: h - 1, d: 2 }));
    spread(machine.pipe_input_ports || 0, h, (y) => ({ type: "pipe", io: "in", x: 0, y, d: 1 }));
    spread(machine.pipe_output_ports || 0, h, (y) => ({ type: "pipe", io: "out", x: w - 1, y, d: 1 }));
    return ports;
  }

  function machinePorts(machine) {
    if (!Array.isArray(machine.ports)) return defaultPorts(machine);
    return machine.ports.map((port) => ({ type: port.type, io: port.io, x: port.x, y: port.y, d: dirIndex(port.dir) }));
  }

  function sizeOf(building, rot = building.rot) {
    return rot % 2 ? { w: building.h0, h: building.w0 } : { w: building.w0, h: building.h0 };
  }

  // Ports in grid coordinates. (ox, oy) is the cell just outside the footprint where a belt attaches.
  function worldPorts(building) {
    const { w0, h0, rot } = building;
    return building.ports.map((port, index) => {
      let x = port.x;
      let y = port.y;
      if (rot === 1) [x, y] = [h0 - 1 - port.y, port.x];
      else if (rot === 2) [x, y] = [w0 - 1 - port.x, h0 - 1 - port.y];
      else if (rot === 3) [x, y] = [port.y, w0 - 1 - port.x];
      const d = (port.d + rot) % 4;
      const sign = port.io === "in" ? -1 : 1;
      x += building.x;
      y += building.y;
      return {
        id: `${building.id}:${index}`,
        type: port.type,
        io: port.io,
        x,
        y,
        d,
        ox: x + sign * DIRS[d][0],
        oy: y + sign * DIRS[d][1]
      };
    });
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function rectOf(building, x = building.x, y = building.y, rot = building.rot) {
    const { w, h } = sizeOf(building, rot);
    return { x, y, w, h };
  }

  // True when `building` would overlap another one at the given position. `ignore` is a set of ids.
  function collides(plan, building, x, y, rot, ignore) {
    const rect = rectOf(building, x, y, rot);
    for (const other of plan.buildings) {
      if (other === building || other.x === null || (ignore && ignore.has(other.id))) continue;
      if (rectsOverlap(rect, rectOf(other))) return true;
    }
    return false;
  }

  function overlapping(plan) {
    const ids = new Set();
    const placed = plan.buildings.filter((b) => b.x !== null);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (rectsOverlap(rectOf(placed[i]), rectOf(placed[j]))) {
          ids.add(placed[i].id);
          ids.add(placed[j].id);
        }
      }
    }
    return ids;
  }

  // Test for a spot where `building` overlaps nothing and no port, its own or another machine's, is walled in.
  function clearance(plan, building) {
    const others = plan.buildings.filter((other) => other !== building && other.x !== null);
    const fronts = new Set();
    for (const other of others) {
      if (other.kind === "machine") worldPorts(other).forEach((port) => fronts.add(`${port.ox},${port.oy}`));
    }
    const rects = others.map((other) => rectOf(other));
    const own = building.kind === "machine" ? worldPorts({ ...building, x: 0, y: 0 }).map((port) => [port.ox, port.oy]) : [];
    const size = sizeOf(building);
    return (x, y) => {
      if (collides(plan, building, x, y, building.rot)) return false;
      for (let yy = y; yy < y + size.h; yy++) {
        for (let xx = x; xx < x + size.w; xx++) if (fronts.has(`${xx},${yy}`)) return false;
      }
      return !own.some(([dx, dy]) => rects.some((rect) => rectsOverlap(rect, { x: x + dx, y: y + dy, w: 1, h: 1 })));
    };
  }

  // Closest spot to (x, y) that is free and keeps every port reachable; failing that, one that is merely free.
  function nearestFree(plan, building, x, y, radius = 40) {
    const tests = [clearance(plan, building), (cx, cy) => !collides(plan, building, cx, cy, building.rot)];
    for (const fits of tests) {
      if (fits(x, y)) return [x, y];
      for (let r = 1; r <= radius; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (fits(x + dx, y + dy)) return [x + dx, y + dy];
          }
        }
      }
    }
    return [x, y];
  }

  // ---- plan ---------------------------------------------------------------

  function layerRuns(nodes) {
    const producers = {};
    nodes.forEach((node) => node.outputs.forEach((io) => (producers[io.item] = producers[io.item] || []).push(node)));
    nodes.forEach((node) => {
      node.preds = new Set();
      node.succs = new Set();
    });
    for (const node of nodes) {
      for (const io of node.inputs) {
        for (const from of producers[io.item] || []) {
          if (from === node) continue;
          from.succs.add(node);
          node.preds.add(from);
        }
      }
    }
    // Drop the edges that close a cycle so the rest can be layered.
    const state = new Map();
    const order = [];
    const visit = (node) => {
      state.set(node, 1);
      for (const next of [...node.succs]) {
        if (state.get(next) === 1) {
          node.succs.delete(next);
          next.preds.delete(node);
        } else if (!state.has(next)) {
          visit(next);
        }
      }
      state.set(node, 2);
      order.push(node);
    };
    nodes.forEach((node) => state.has(node) || visit(node));
    order.reverse();
    for (const node of order) {
      node.layer = 0;
      for (const pred of node.preds) node.layer = Math.max(node.layer, pred.layer + 1);
    }
    // Pull producers down next to their first consumer.
    for (let i = order.length - 1; i >= 0; i--) {
      const node = order[i];
      if (node.succs.size) node.layer = Math.min(...[...node.succs].map((next) => next.layer)) - 1;
    }
    const layers = [];
    order.forEach((node) => (layers[node.layer] = layers[node.layer] || []).push(node));
    const filled = layers.filter(Boolean);
    filled.forEach((layer, index) => layer.forEach((node, pos) => Object.assign(node, { layer: index, pos })));
    // Order each layer by the average position of its neighbours to keep links short.
    for (let sweep = 0; sweep < 4; sweep++) {
      const down = sweep % 2 === 0;
      const list = down ? filled : filled.slice().reverse();
      for (const layer of list) {
        for (const node of layer) {
          const near = [...(down ? node.preds : node.succs)];
          node.bary = near.length ? near.reduce((sum, other) => sum + other.pos, 0) / near.length : node.pos;
        }
        layer.sort((a, b) => a.bary - b.bary);
        layer.forEach((node, pos) => (node.pos = pos));
      }
    }
    return filled;
  }

  /*
   * runs: [{ recipeId, itemId, machineId, machineCount, inputs: [{ item, rate }], outputs: [...] }]
   * Returns { buildings, links } with machines unplaced (x === null).
   */
  function buildPlan({ runs, itemMap = {}, machineMap = {}, logistics = {} }) {
    const beltCap = logistics.belt_per_sec || 0.5;
    const pipeCap = logistics.pipe_per_sec || 2;
    const isFluid = (id) => ["liquid", "gas"].includes((itemMap[id] || {}).phase);
    const usedKeys = new Set();
    const nodes = [];
    for (const run of runs || []) {
      const machine = machineMap[run.machineId];
      const count = Math.round(run.machineCount || 0);
      if (!machine || machine.virtual || count <= 0) continue;
      let key = run.recipeId || `${run.itemId}@${run.machineId}`;
      while (usedKeys.has(key)) key += "'";
      usedKeys.add(key);
      const clean = (ios) => (ios || []).filter((io) => io.rate > EPS).map((io) => ({ item: io.item, rate: io.rate }));
      nodes.push({ key, run, machine, count, inputs: clean(run.inputs), outputs: clean(run.outputs) });
    }
    const layers = layerRuns(nodes);

    const buildings = [];
    const supply = {};
    const demand = {};
    let uid = 0;
    for (const layer of layers) {
      for (const node of layer) {
        const [w0, h0] = node.machine.size || [1, 1];
        const ports = machinePorts(node.machine);
        for (let i = 0; i < node.count; i++) {
          const building = {
            id: `b${uid++}`,
            key: `${node.key}#${i + 1}`,
            kind: "machine",
            machineId: node.run.machineId,
            recipeId: node.run.recipeId || "",
            itemId: node.run.itemId,
            index: i + 1,
            total: node.count,
            layer: node.layer,
            w0,
            h0,
            ports,
            x: null,
            y: null,
            rot: 0
          };
          buildings.push(building);
          for (const io of node.outputs) (supply[io.item] = supply[io.item] || []).push({ building, rate: io.rate / node.count });
          for (const io of node.inputs) (demand[io.item] = demand[io.item] || []).push({ building, rate: io.rate / node.count });
        }
      }
    }

    const links = [];
    const pseudoCount = {};
    const addLink = (from, to, itemId, rate) => {
      const fluid = isFluid(itemId);
      const cap = fluid ? pipeCap : beltCap;
      const lanes = Math.max(1, Math.ceil(rate / cap - 1e-4));
      for (let lane = 0; lane < lanes; lane++) {
        let [a, b] = [from, to];
        if (!a || !b) {
          const kind = a ? "sink" : "source";
          const owner = a || b;
          const base = `${kind}:${itemId}:${owner.key}`;
          pseudoCount[base] = (pseudoCount[base] || 0) + 1;
          const pseudo = {
            id: `b${uid++}`,
            key: `${base}:${pseudoCount[base]}`,
            kind,
            itemId,
            owner: owner.id,
            w0: 1,
            h0: 1,
            ports: [],
            x: null,
            y: null,
            rot: 0
          };
          buildings.push(pseudo);
          if (a) b = pseudo;
          else a = pseudo;
        }
        links.push({ id: `l${links.length}`, from: a.id, to: b.id, itemId, rate: rate / lanes, type: fluid ? "pipe" : "belt" });
      }
    };
    for (const itemId of new Set([...Object.keys(supply), ...Object.keys(demand)])) {
      const out = (supply[itemId] || []).map((entry) => ({ ...entry }));
      const need = (demand[itemId] || []).map((entry) => ({ ...entry }));
      let i = 0;
      let j = 0;
      while (i < out.length && j < need.length) {
        const rate = Math.min(out[i].rate, need[j].rate);
        if (rate > EPS) addLink(out[i].building, need[j].building, itemId, rate);
        out[i].rate -= rate;
        need[j].rate -= rate;
        if (out[i].rate <= EPS) i++;
        if (need[j] && need[j].rate <= EPS) j++;
      }
      for (; i < out.length; i++) if (out[i].rate > EPS) addLink(out[i].building, null, itemId, out[i].rate);
      for (; j < need.length; j++) if (need[j].rate > EPS) addLink(null, need[j].building, itemId, need[j].rate);
    }
    return { buildings, links, caps: { belt: beltCap, pipe: pipeCap } };
  }

  function indexBuildings(plan) {
    const map = {};
    for (const building of plan.buildings) map[building.id] = building;
    return map;
  }

  // ---- ports --------------------------------------------------------------

  // Order-preserving match of sorted targets to sorted port positions with the least total distance.
  function matchInOrder(targets, positions) {
    const n = targets.length;
    const m = positions.length;
    const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
    cost[0].fill(0);
    for (let i = 1; i <= n; i++) {
      for (let j = i; j <= m; j++) {
        cost[i][j] = Math.min(cost[i][j - 1], cost[i - 1][j - 1] + Math.abs(targets[i - 1] - positions[j - 1]));
      }
    }
    const picked = new Array(n);
    for (let i = n, j = m; i > 0; j--) {
      if (cost[i][j] !== cost[i][j - 1]) picked[--i] = j - 1;
    }
    return picked;
  }

  /*
   * Splits more links than ports over the ports. Links stay in order, so neighbours share a port.
   * An even split is kept when no port is overloaded: it shares the outer ports first, which have room to branch.
   * Otherwise the busiest port carries as little as possible, regrouping freely if only that avoids an overload.
   */
  function sharePorts(rates, ports, cap) {
    const n = rates.length;
    const limit = cap * (1 + 1e-4);
    const even = rates.map((_, index) => Math.floor((index * ports) / n));
    const evenLoad = new Array(ports).fill(0);
    even.forEach((port, index) => (evenLoad[port] += rates[index]));
    if (Math.max(...evenLoad) <= limit) return even;
    const sum = [0];
    for (const rate of rates) sum.push(sum[sum.length - 1] + rate);
    const best = Array.from({ length: ports + 1 }, () => new Float64Array(n + 1).fill(Infinity));
    const cut = Array.from({ length: ports + 1 }, () => new Int32Array(n + 1));
    best[0][0] = 0;
    for (let k = 1; k <= ports; k++) {
      for (let i = k; i <= n; i++) {
        for (let j = k - 1; j < i; j++) {
          const worst = Math.max(best[k - 1][j], sum[i] - sum[j]);
          if (worst < best[k][i]) {
            best[k][i] = worst;
            cut[k][i] = j;
          }
        }
      }
    }
    const picked = new Array(n);
    for (let k = ports, i = n; k > 0; k--) {
      const j = cut[k][i];
      for (let at = j; at < i; at++) picked[at] = k - 1;
      i = j;
    }
    if (best[ports][n] <= limit) return picked;
    const load = new Array(ports).fill(0);
    const free = new Array(n);
    const order = rates.map((_, index) => index).sort((a, b) => rates[b] - rates[a]);
    for (const index of order) {
      const port = load.indexOf(Math.min(...load));
      free[index] = port;
      load[port] += rates[index];
    }
    return Math.max(...load) < best[ports][n] - EPS ? free : picked;
  }

  /*
   * Gives every link a port on both machines (link.fromPort / link.toPort; null for depot markers).
   * Links that outnumber the ports share them, which the router turns into splitters / mergers.
   */
  function assignPorts(plan) {
    const byId = indexBuildings(plan);
    const groups = new Map();
    for (const link of plan.links) {
      link.fromPort = null;
      link.toPort = null;
      link.noPort = false;
      for (const [side, io] of [["from", "out"], ["to", "in"]]) {
        const building = byId[link[side]];
        if (building.kind !== "machine") continue;
        const key = `${building.id}|${io}|${link.type}`;
        if (!groups.has(key)) groups.set(key, { building, io, type: link.type, side, links: [] });
        groups.get(key).links.push(link);
      }
    }
    const overloaded = [];
    for (const group of groups.values()) {
      const ports = worldPorts(group.building).filter((port) => port.io === group.io && port.type === group.type);
      const field = group.side === "from" ? "fromPort" : "toPort";
      if (!ports.length) {
        group.links.forEach((link) => (link.noPort = true));
        continue;
      }
      const alongX = ports[0].d % 2 === 0;
      const coord = (port) => (alongX ? port.x : port.y);
      ports.sort((a, b) => coord(a) - coord(b));
      const target = (link) => {
        const other = byId[group.side === "from" ? link.to : link.from];
        if (other.x === null) return null;
        const size = sizeOf(other);
        return alongX ? other.x + (size.w - 1) / 2 : other.y + (size.h - 1) / 2;
      };
      const aimed = group.links.map((link) => ({ link, at: target(link) }));
      const known = aimed.filter((entry) => entry.at !== null).sort((a, b) => a.at - b.at);
      const loose = aimed.filter((entry) => entry.at === null);
      if (aimed.length <= ports.length) {
        const picked = matchInOrder(known.map((entry) => entry.at), ports.map(coord));
        const taken = new Set(picked);
        known.forEach((entry, i) => (entry.link[field] = ports[picked[i]]));
        const free = ports.filter((_, index) => !taken.has(index));
        loose.forEach((entry, i) => (entry.link[field] = free[i]));
      } else {
        const all = known.concat(loose);
        const picked = sharePorts(all.map((entry) => entry.link.rate), ports.length, plan.caps[group.type]);
        all.forEach((entry, i) => (entry.link[field] = ports[picked[i]]));
      }
      const load = new Map();
      for (const link of group.links) load.set(link[field], (load.get(link[field]) || 0) + link.rate);
      for (const [port, rate] of load) {
        if (rate > plan.caps[group.type] * (1 + 1e-4)) overloaded.push({ port, rate, building: group.building.id });
      }
    }
    return overloaded;
  }

  // ---- automatic arrangement ----------------------------------------------

  function placeMarkers(plan, ownerId, only) {
    const byId = indexBuildings(plan);
    const mine = (building) =>
      building.kind !== "machine" && (!ownerId || building.owner === ownerId) && (!only || only.has(building.id));
    for (const building of plan.buildings) if (mine(building)) building.x = building.y = null;
    assignPorts(plan);
    for (const link of plan.links) {
      const source = byId[link.from].kind !== "machine";
      const marker = byId[source ? link.from : link.to];
      if (marker.kind === "machine" || !mine(marker)) continue;
      const owner = byId[marker.owner];
      const port = source ? link.toPort : link.fromPort;
      let x = owner.x - 2;
      let y = owner.y - 2;
      if (port) {
        const sign = source ? -2 : 2;
        x = port.x + sign * DIRS[port.d][0];
        y = port.y + sign * DIRS[port.d][1];
      }
      [marker.x, marker.y] = nearestFree(plan, marker, x, y);
    }
  }

  function autoArrange(plan) {
    const byId = indexBuildings(plan);
    const machines = plan.buildings.filter((building) => building.kind === "machine");
    for (const building of plan.buildings) {
      building.x = building.y = null;
      building.rot = 0;
    }
    if (!machines.length) return plan;
    const sidePorts = (building) => building.ports.some((port) => port.d % 2 === 1);
    const gapAfter = (a, b) => (sidePorts(a) || sidePorts(b) ? 5 : 3);

    const area = machines.reduce((sum, building) => sum + (building.w0 + 4) * (building.h0 + 6), 0);
    const maxWidth = Math.min(180, Math.max(34, Math.round(Math.sqrt(area * 1.8))));
    const rows = [];
    let lastLayer = null;
    for (const building of machines) {
      let row = rows[rows.length - 1];
      const extra = row && row.items.length ? gapAfter(row.items[row.items.length - 1], building) : 0;
      if (!row || building.layer !== lastLayer || row.width + extra + building.w0 > maxWidth) {
        row = { items: [], width: 0, height: 0 };
        rows.push(row);
      }
      lastLayer = building.layer;
      building.row = rows.length - 1;
      building.rowX = row.items.length ? row.width + gapAfter(row.items[row.items.length - 1], building) : 0;
      row.items.push(building);
      row.width = building.rowX + building.w0;
      row.height = Math.max(row.height, building.h0);
    }

    // A channel between two rows is as tall as the number of links that have to pass through it.
    const traffic = new Array(rows.length + 1).fill(0);
    const ownerOf = (id) => (byId[id].kind === "machine" ? byId[id] : byId[byId[id].owner]);
    for (const link of plan.links) {
      const from = ownerOf(link.from).row;
      const to = ownerOf(link.to).row;
      // Belts leave at the bottom of a row and enter at the top of one.
      const first = Math.min(from + 1, to);
      const last = Math.max(from + 1, to);
      for (let r = first; r <= last; r++) traffic[r] += 1;
    }
    const totalWidth = Math.max(...rows.map((row) => row.width));
    let y = 0;
    rows.forEach((row, index) => {
      y += 5 + Math.min(14, Math.ceil(traffic[index] / 2));
      const offset = Math.floor((totalWidth - row.width) / 2);
      for (const building of row.items) {
        building.x = offset + building.rowX;
        building.y = y + row.height - building.h0;
      }
      y += row.height;
    });
    for (const building of machines) {
      delete building.row;
      delete building.rowX;
    }
    placeMarkers(plan);
    return plan;
  }

  // ---- routing ------------------------------------------------------------

  class Heap {
    constructor() {
      this.keys = [];
      this.values = [];
    }
    get size() {
      return this.keys.length;
    }
    push(key, value) {
      const { keys, values } = this;
      let i = keys.length;
      keys.push(key);
      values.push(value);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (keys[parent] <= key) break;
        keys[i] = keys[parent];
        values[i] = values[parent];
        i = parent;
      }
      keys[i] = key;
      values[i] = value;
    }
    pop() {
      const { keys, values } = this;
      const top = values[0];
      const key = keys.pop();
      const value = values.pop();
      const n = keys.length;
      if (n) {
        let i = 0;
        for (;;) {
          let child = 2 * i + 1;
          if (child >= n) break;
          if (child + 1 < n && keys[child + 1] < keys[child]) child++;
          if (keys[child] >= key) break;
          keys[i] = keys[child];
          values[i] = values[child];
          i = child;
        }
        keys[i] = key;
        values[i] = value;
      }
      return top;
    }
  }

  /*
   * Routes every link. Returns { routes, junctions, stats, overloaded } and never moves a building.
   * routes[i] = { linkId, ok, type, points: [[x, y], ...] } with points running from port to port.
   */
  function route(plan) {
    const byId = indexBuildings(plan);
    const overloaded = assignPorts(plan);
    const placed = plan.buildings.filter((building) => building.x !== null);
    const stats = {
      machines: plan.buildings.filter((building) => building.kind === "machine").length,
      width: 0,
      height: 0,
      belt: 0,
      pipe: 0,
      crossings: 0,
      junctions: 0,
      unrouted: 0,
      overloaded: overloaded.length,
      links: plan.links.length,
      partial: false
    };
    if (!placed.length) return { routes: [], junctions: [], stats, overloaded, bounds: { x: 0, y: 0, w: 0, h: 0 } };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const building of placed) {
      const rect = rectOf(building);
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.w);
      maxY = Math.max(maxY, rect.y + rect.h);
    }
    stats.width = maxX - minX;
    stats.height = maxY - minY;
    const MARGIN = 5;
    const x0 = minX - MARGIN;
    const y0 = minY - MARGIN;
    const W = maxX - minX + 2 * MARGIN;
    const H = maxY - minY + 2 * MARGIN;
    const cellOf = (x, y) => (x < x0 || y < y0 || x >= x0 + W || y >= y0 + H ? -1 : (y - y0) * W + (x - x0));
    const pointOf = (cell) => [x0 + (cell % W), y0 + Math.floor(cell / W)];
    const step = [-W, 1, W, -1];
    const size = W * H;

    const blocked = new Uint8Array(size);
    for (const building of placed) {
      const rect = rectOf(building);
      for (let yy = rect.y; yy < rect.y + rect.h; yy++) {
        for (let xx = rect.x; xx < rect.x + rect.w; xx++) blocked[cellOf(xx, yy)] = 1;
      }
    }
    const layer = () => ({
      occ: new Uint8Array(size),
      crossing: new Uint8Array(size),
      reserved: new Int32Array(size),
      lane: new Int32Array(size), // approach lane of a port: others may only cross it at a right angle
      laneAxis: new Uint8Array(size),
      noSplit: new Uint8Array(size),
      noMerge: new Uint8Array(size),
      junction: new Uint8Array(size), // 1 splitter, 2 merger
      owner: new Int32Array(size).fill(-1), // route index that laid the cell
      position: new Int32Array(size) // index of the cell along that route
    });
    const layers = { belt: layer(), pipe: layer() };

    // The cells in front of a port belong to that port.
    const portNumbers = new Map();
    const portNumber = (port) => {
      if (!portNumbers.has(port.id)) portNumbers.set(port.id, portNumbers.size + 1);
      return portNumbers.get(port.id);
    };
    // The second cell keeps a neighbouring belt from turning right in front of the port.
    for (const depth of [1, 2]) {
      for (const link of plan.links) {
        for (const port of [link.fromPort, link.toPort]) {
          if (!port) continue;
          const sign = (port.io === "in" ? -1 : 1) * depth;
          const cell = cellOf(port.x + sign * DIRS[port.d][0], port.y + sign * DIRS[port.d][1]);
          const reserved = layers[link.type].reserved;
          if (cell >= 0 && !blocked[cell] && !reserved[cell]) reserved[cell] = portNumber(port);
        }
      }
    }
    for (const link of plan.links) {
      for (const port of [link.fromPort, link.toPort]) {
        if (!port) continue;
        const grid = layers[link.type];
        const sign = port.io === "in" ? -1 : 1;
        const at = (depth) => cellOf(port.x + sign * depth * DIRS[port.d][0], port.y + sign * depth * DIRS[port.d][1]);
        let free = 0;
        while (free < 12 && at(free + 1) >= 0 && !blocked[at(free + 1)]) free += 1;
        for (let depth = 3; depth <= Math.min(7, Math.floor(free / 2)); depth++) {
          const cell = at(depth);
          if (grid.reserved[cell] || grid.lane[cell]) continue;
          grid.lane[cell] = portNumber(port);
          grid.laneAxis[cell] = port.d % 2;
        }
      }
    }

    const center = (building) => {
      const rect = rectOf(building);
      return [rect.x + (rect.w - 1) / 2, rect.y + (rect.h - 1) / 2];
    };
    const order = plan.links.map((link, index) => {
      const a = link.fromPort ? [link.fromPort.ox, link.fromPort.oy] : center(byId[link.from]);
      const b = link.toPort ? [link.toPort.ox, link.toPort.oy] : center(byId[link.to]);
      return { link, index, length: Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) };
    });
    order.sort((a, b) => a.length - b.length || a.index - b.index);

    const dist = new Int32Array(size * 4);
    const stamp = new Int32Array(size * 4);
    const prev = new Int32Array(size * 4);
    let round = 0;
    const trees = { from: new Map(), to: new Map() }; // port number -> cells already carrying its flow
    const routes = new Array(plan.links.length);
    const junctions = [];

    let expanded = 0;
    const search = (grid, starts, goals, own, window, limit) => {
      round += 1;
      let left = limit;
      const heap = new Heap();
      const goalCells = [...goals.keys()];
      const useHeuristic = goalCells.length <= 8;
      const goalPoints = useHeuristic ? goalCells.map(pointOf) : [];
      const estimate = (cell) => {
        if (!useHeuristic) return 0;
        const [x, y] = pointOf(cell);
        let best = Infinity;
        for (const [gx, gy] of goalPoints) best = Math.min(best, Math.abs(gx - x) + Math.abs(gy - y));
        return best * STEP_COST;
      };
      const inWindow = (cell) => {
        if (!window) return true;
        const x = cell % W;
        const y = (cell - x) / W;
        return x >= window[0] && x <= window[2] && y >= window[1] && y <= window[3];
      };
      const allowed = (cell) => !blocked[cell] && (!grid.reserved[cell] || own.has(grid.reserved[cell]));
      const visit = (state, cost, from) => {
        if (stamp[state] === round && dist[state] <= cost) return;
        stamp[state] = round;
        dist[state] = cost;
        prev[state] = from;
        heap.push((cost + estimate(state >> 2)) * 4194304 + state, state);
      };
      for (const start of starts) {
        if (start.cell < 0 || !allowed(start.cell)) continue;
        // A branch may leave a splitter straight across a neighbouring belt, or a port flanked by belts could not share.
        const occ = grid.occ[start.cell];
        const crossable = (occ === STRAIGHT_H && start.d % 2 === 0) || (occ === STRAIGHT_V && start.d % 2 === 1);
        if (occ !== FREE && !crossable) continue;
        if (grid.lane[start.cell] && !own.has(grid.lane[start.cell]) && start.d % 2 === grid.laneAxis[start.cell]) continue;
        visit(start.cell * 4 + start.d, start.cost + (occ !== FREE ? CROSS_COST : 0), -1 - start.index);
      }
      while (heap.size) {
        const state = heap.pop();
        expanded += 1;
        if (--left < 0) return null;
        const cell = state >> 2;
        const d = state & 3;
        const cost = dist[state];
        const foreign = (at) => grid.lane[at] && !own.has(grid.lane[at]);
        const through = grid.occ[cell] !== FREE || foreign(cell);
        if (grid.occ[cell] === FREE && goals.has(cell)) {
          const exits = goals.get(cell).filter((goal) => goal.d !== (d + 2) % 4);
          if (exits.length) return { state, goal: exits.find((goal) => goal.d === d) || exits[0] };
        }
        for (let nd = 0; nd < 4; nd++) {
          if (nd === (d + 2) % 4 || (through && nd !== d)) continue;
          const x = cell % W;
          if ((nd === 1 && x === W - 1) || (nd === 3 && x === 0)) continue;
          const next = cell + step[nd];
          if (next < 0 || next >= size || !allowed(next) || !inWindow(next)) continue;
          if (foreign(next) && nd % 2 === grid.laneAxis[next]) continue;
          let extra = STEP_COST + (nd === d ? 0 : TURN_COST);
          const occ = grid.occ[next];
          if (occ !== FREE) {
            const crossable = (occ === STRAIGHT_H && nd % 2 === 0) || (occ === STRAIGHT_V && nd % 2 === 1);
            if (!crossable) continue;
            extra += CROSS_COST;
          }
          visit(next * 4 + nd, cost + extra, state);
        }
      }
      return null;
    };

    for (const { link, index } of order) {
      const grid = layers[link.type];
      const from = byId[link.from];
      const to = byId[link.to];
      const result = { linkId: link.id, ok: false, type: link.type, points: [], reason: "" };
      routes[index] = result;
      if (link.noPort) {
        result.reason = "no_port";
        continue;
      }
      if (from.x === null || to.x === null) continue;
      const own = new Set();
      const starts = [];
      const startInfo = [];
      const addStart = (cell, d, cost, anchor, junction) => {
        starts.push({ cell, d, cost, index: startInfo.length });
        startInfo.push({ anchor, junction });
      };
      if (link.fromPort) {
        const number = portNumber(link.fromPort);
        own.add(number);
        const tree = trees.from.get(number);
        if (tree && tree.length) {
          for (const cell of tree) {
            if (grid.crossing[cell] || grid.noSplit[cell] || grid.junction[cell] === 2) continue;
            for (let d = 0; d < 4; d++) {
              const x = cell % W;
              if ((d === 1 && x === W - 1) || (d === 3 && x === 0)) continue;
              const next = cell + step[d];
              if (next >= 0 && next < size) addStart(next, d, JUNCTION_COST, pointOf(cell), cell);
            }
          }
        } else {
          addStart(cellOf(link.fromPort.ox, link.fromPort.oy), link.fromPort.d, 0, [link.fromPort.x, link.fromPort.y], -1);
        }
      } else {
        for (let d = 0; d < 4; d++) addStart(cellOf(from.x + DIRS[d][0], from.y + DIRS[d][1]), d, 0, [from.x, from.y], -1);
      }
      const goals = new Map();
      const addGoal = (cell, d, anchor, junction) => {
        if (cell < 0) return;
        if (!goals.has(cell)) goals.set(cell, []);
        goals.get(cell).push({ d, anchor, junction });
      };
      if (link.toPort) {
        const number = portNumber(link.toPort);
        own.add(number);
        const tree = trees.to.get(number);
        if (tree && tree.length) {
          for (const cell of tree) {
            if (grid.crossing[cell] || grid.noMerge[cell] || grid.junction[cell] === 1) continue;
            const [x, y] = pointOf(cell);
            for (let d = 0; d < 4; d++) addGoal(cellOf(x - DIRS[d][0], y - DIRS[d][1]), d, [x, y], cell);
          }
        } else {
          addGoal(cellOf(link.toPort.ox, link.toPort.oy), link.toPort.d, [link.toPort.x, link.toPort.y], -1);
        }
      } else {
        for (let d = 0; d < 4; d++) addGoal(cellOf(to.x - DIRS[d][0], to.y - DIRS[d][1]), d, [to.x, to.y], -1);
      }

      // Search near the two ends first; fall back to the whole grid.
      let window = [Infinity, Infinity, -Infinity, -Infinity];
      const grow = (cell) => {
        if (cell < 0) return;
        const x = cell % W;
        const y = (cell - x) / W;
        window = [Math.min(window[0], x), Math.min(window[1], y), Math.max(window[2], x), Math.max(window[3], y)];
      };
      starts.forEach((start) => grow(start.cell));
      goals.forEach((_, cell) => grow(cell));
      if (expanded > TOTAL_STATES) {
        result.reason = "budget";
        stats.partial = true;
        continue;
      }
      const near = [window[0] - 8, window[1] - 8, window[2] + 8, window[3] + 8];
      const found = search(grid, starts, goals, own, near, Infinity) || search(grid, starts, goals, own, null, RETRY_STATES);
      if (!found) {
        result.reason = "blocked";
        continue;
      }

      const cells = [];
      let state = found.state;
      while (state >= 0) {
        cells.push(state);
        state = prev[state];
      }
      const start = startInfo[-1 - state];
      cells.reverse();
      const path = cells.map((entry) => entry >> 2);
      for (let i = 0; i < cells.length; i++) {
        const cell = path[i];
        const dIn = cells[i] & 3;
        const dOut = i + 1 < cells.length ? cells[i + 1] & 3 : found.goal.d;
        if (grid.occ[cell] !== FREE) {
          grid.occ[cell] = FULL;
          grid.crossing[cell] = 1;
          stats.crossings += 1;
          continue;
        }
        grid.occ[cell] = dIn !== dOut ? FULL : dIn % 2 ? STRAIGHT_H : STRAIGHT_V;
        grid.owner[cell] = index;
        grid.position[cell] = i;
        stats[link.type] += 1;
      }
      const laid = path.filter((cell) => grid.owner[cell] === index);
      // A splitter must not sit after a merger on the same belt (and the reverse), or flows would mix.
      const mark = (cell, kind) => {
        grid.junction[cell] = kind;
        grid.occ[cell] = FULL;
        const [x, y] = pointOf(cell);
        junctions.push({ x, y, type: link.type, kind: kind === 1 ? "split" : "merge" });
        stats.junctions += 1;
        const host = routes[grid.owner[cell]];
        const at = grid.position[cell];
        for (const other of host.cells) {
          if (grid.owner[other] !== grid.owner[cell]) continue;
          if (kind === 1 && grid.position[other] < at) grid.noMerge[other] = 1;
          if (kind === 2 && grid.position[other] > at) grid.noSplit[other] = 1;
        }
      };
      result.cells = path;
      if (start.junction >= 0) mark(start.junction, 1);
      if (found.goal.junction >= 0) mark(found.goal.junction, 2);
      if (link.fromPort) {
        const number = portNumber(link.fromPort);
        trees.from.set(number, (trees.from.get(number) || []).concat(laid));
      }
      if (link.toPort) {
        const number = portNumber(link.toPort);
        trees.to.set(number, (trees.to.get(number) || []).concat(laid));
      }
      result.ok = true;
      result.points = [start.anchor, ...path.map(pointOf), found.goal.anchor];
    }
    for (const result of routes) {
      delete result.cells;
      if (!result.ok) stats.unrouted += 1;
    }
    return { routes, junctions, stats, overloaded, bounds: { x: minX, y: minY, w: stats.width, h: stats.height } };
  }

  // ---- editing ------------------------------------------------------------

  // A machine and the depot markers attached to it move together.
  function groupOf(plan, building) {
    if (building.kind !== "machine") return [building];
    return [building, ...plan.buildings.filter((other) => other.owner === building.id)];
  }

  function move(plan, building, dx, dy) {
    const group = groupOf(plan, building);
    const ignore = new Set(group.map((member) => member.id));
    if (group.some((member) => collides(plan, member, member.x + dx, member.y + dy, member.rot, ignore))) return false;
    for (const member of group) {
      member.x += dx;
      member.y += dy;
    }
    return true;
  }

  // Quarter turn around the centre. Returns false (and changes nothing) when the new footprint is taken.
  function rotate(plan, building, turns = 1) {
    if (building.kind !== "machine") return false;
    const rot = (((building.rot + turns) % 4) + 4) % 4;
    const before = sizeOf(building);
    const after = sizeOf(building, rot);
    const x = building.x + Math.round((before.w - after.w) / 2);
    const y = building.y + Math.round((before.h - after.h) / 2);
    const ignore = new Set(groupOf(plan, building).map((member) => member.id));
    if (collides(plan, building, x, y, rot, ignore)) return false;
    Object.assign(building, { x, y, rot });
    placeMarkers(plan, building.id);
    return true;
  }

  // ---- saving -------------------------------------------------------------

  function serialize(plan) {
    return {
      format: FORMAT,
      version: 1,
      buildings: plan.buildings
        .filter((building) => building.x !== null)
        .map((building) => ({ key: building.key, x: building.x, y: building.y, rot: building.rot }))
    };
  }

  /*
   * Puts the buildings of `plan` where `saved` has them. Buildings the save does not know keep
   * their position and are nudged to the nearest free cells if something now overlaps them.
   */
  function applySaved(plan, saved) {
    if (!saved || saved.format !== FORMAT || !Array.isArray(saved.buildings)) return null;
    const stored = new Map();
    for (const entry of saved.buildings) {
      if (!entry || typeof entry.key !== "string" || !Number.isFinite(entry.x) || !Number.isFinite(entry.y)) continue;
      stored.set(entry.key, entry);
    }
    const loose = [];
    let matched = 0;
    for (const building of plan.buildings) {
      const entry = stored.get(building.key);
      if (!entry) {
        loose.push(building);
        continue;
      }
      building.x = Math.round(entry.x);
      building.y = Math.round(entry.y);
      building.rot = building.kind === "machine" ? ((Math.round(entry.rot || 0) % 4) + 4) % 4 : 0;
      matched += 1;
    }
    // Machines the file does not know keep their spot; markers it does not know go next to their machine.
    const markers = new Set();
    for (const building of loose) {
      if (building.kind === "machine") continue;
      markers.add(building.id);
      building.x = building.y = null;
    }
    for (const building of loose) {
      if (building.kind === "machine" && building.x !== null) {
        [building.x, building.y] = nearestFree(plan, building, building.x, building.y);
      }
    }
    if (markers.size) placeMarkers(plan, null, markers);
    return { matched, total: plan.buildings.length, unknown: stored.size - matched };
  }

  return {
    DIRS,
    machinePorts,
    sizeOf,
    rectOf,
    worldPorts,
    collides,
    overlapping,
    buildPlan,
    assignPorts,
    autoArrange,
    placeMarkers,
    route,
    groupOf,
    move,
    rotate,
    serialize,
    applySaved
  };
});
