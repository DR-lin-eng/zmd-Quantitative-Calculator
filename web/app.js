// Verify Vue is loaded
if (typeof Vue === 'undefined') {
  throw new Error('Vue is not loaded. Please check your internet connection.');
}

const { createApp, reactive, computed, onMounted, onBeforeUnmount, toRefs, ref } = Vue;

const BELT_CAPACITY = 0.5;
const EPS = 1e-9;
const DIAGRAM_ZOOM_MIN = 0.02;
const DIAGRAM_ZOOM_MAX = 3;
const DIAGRAM_ZOOM_STEP = 0.1;

const i18n = {
  zh: {
    title: "终末地基建量化计算器",
    subtitle: "以最少机器与最短工序，最大化原材料利用",
    tagline: "Infrastructure Planner",
    settings: "基础设置",
    basePower: "基础功耗",
    generator: "发电机",
    generatorFuel: "燃料",
    supplies: "地图原料供给",
    targets: "目标产品",
    priority: "按顺序优先",
    perSecond: "单位: /分钟",
    maximize: "最大化",
    addTarget: "添加目标",
    calculate: "计算",
    calcHint: "修改输入后点击计算",
    summary: "总览",
    totalPower: "总用电",
    generators: "发电机数量",
    powerPerGen: "单机功率",
    fuelRate: "燃料消耗",
    output: "产出",
    rawUsage: "原料使用",
    machines: "机器汇总",
    machineRuns: "机器明细",
    diagram: "生产流程图",
    diagramSummary: "概览",
    diagramFullscreen: "全屏",
    diagramExitFullscreen: "退出全屏",
    diagramZoomIn: "放大",
    diagramZoomOut: "缩小",
    diagramZoomReset: "重置视图",
    diagramArea1: "生产区域1",
    diagramArea2: "生产区域2",
    diagramRaw: "原材料",
    diagramFinal: "最终产品",
    diagramTotalCapacity: "总产能",
    diagramTotalSupply: "总供给",
    diagramTotalOutput: "最终产出",
    diagramBottleneck: "瓶颈",
    diagramNoBottleneck: "无",
    warnings: "提示",
    showIcons: "显示图标",
    noResults: "暂无结果",
    kitSize: "套件大小",
    kitCount: "套件数量",
    machineCount: "机器数量",
    outputRate: "产出速度",
    beltOutputUtil: "出口带宽利用",
    beltInputUtil: "入口带宽利用"
  },
  en: {
    title: "Infrastructure Production Calculator",
    subtitle: "Max output with minimal machines and shortest chains",
    tagline: "Infrastructure Planner",
    settings: "Settings",
    basePower: "Base Power",
    generator: "Generator",
    generatorFuel: "Fuel",
    supplies: "Map-only Supply",
    targets: "Target Products",
    priority: "Priority order",
    perSecond: "per minute",
    maximize: "Maximize",
    addTarget: "Add Target",
    calculate: "Calculate",
    calcHint: "Click calculate after edits",
    summary: "Summary",
    totalPower: "Total Power",
    generators: "Generators Needed",
    powerPerGen: "Power per Generator",
    fuelRate: "Fuel Rate",
    output: "Outputs",
    rawUsage: "Raw Usage",
    machines: "Machine Totals",
    machineRuns: "Machine Details",
    diagram: "Process Map",
    diagramSummary: "Summary",
    diagramFullscreen: "Fullscreen",
    diagramExitFullscreen: "Exit Fullscreen",
    diagramZoomIn: "Zoom In",
    diagramZoomOut: "Zoom Out",
    diagramZoomReset: "Reset View",
    diagramArea1: "Area 1",
    diagramArea2: "Area 2",
    diagramRaw: "Raw Materials",
    diagramFinal: "Final Products",
    diagramTotalCapacity: "Total Capacity",
    diagramTotalSupply: "Total Supply",
    diagramTotalOutput: "Final Output",
    diagramBottleneck: "Bottleneck",
    diagramNoBottleneck: "None",
    warnings: "Warnings",
    showIcons: "Show Icons",
    noResults: "No results yet",
    kitSize: "Kit Size",
    kitCount: "Kit Count",
    machineCount: "Machines",
    outputRate: "Output Rate",
    beltOutputUtil: "Output Belt Util",
    beltInputUtil: "Input Belt Util"
  }
};

const app = createApp({
  setup() {
    const state = reactive({
      lang: "zh",
      showIcons: true,
      basePower: 0,
      items: [],
      machines: [],
      generators: [],
      supplies: [],
      targets: [],
      selectedGeneratorId: "",
      selectedFuelId: "",
      results: null,
      warnings: [],
      diagramFullscreen: false,
      diagramOrientation: "vertical",
      diagramZoom: 1
    });

    let targetUid = 1;
    let nodeUid = 1;

    const diagramRef = ref(null);
    const diagramDrag = {
      active: false,
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      scrollTop: 0,
      pointerId: null
    };
    const diagramPointers = new Map();
    const diagramPinch = {
      active: false,
      startDist: 0,
      startZoom: 1
    };
    const diagramTransform = reactive({
      x: 0,
      y: 0
    });

    const itemsById = computed(() => {
      const map = {};
      for (const item of state.items) {
        map[item.id] = item;
      }
      return map;
    });

    const machinesById = computed(() => {
      const map = {};
      for (const machine of state.machines) {
        map[machine.id] = machine;
      }
      return map;
    });

    const generatorsById = computed(() => {
      const map = {};
      for (const gen of state.generators) {
        map[gen.id] = gen;
      }
      return map;
    });

    const mapOnlyItems = computed(() => state.items.filter((item) => item.map_only));
    const supplyItems = computed(() => state.items.filter((item) => item.map_only && !item.startup_only));
    const craftableItems = computed(() => state.items.filter((item) => !item.map_only));

    const generatorFuelOptions = computed(() => {
      const gen = generatorsById.value[state.selectedGeneratorId];
      if (!gen || !gen.fuel_power) return [];
      return Object.keys(gen.fuel_power);
    });

    const diagramZoomLabel = computed(() => Math.round(state.diagramZoom * 100));

    function t(key) {
      return (i18n[state.lang] && i18n[state.lang][key]) || key;
    }

    function displayItemName(itemId) {
      const item = itemsById.value[itemId];
      if (!item) return itemId || "";
      if (state.lang === "zh") {
        return item.name_zh || item.name || item.id;
      }
      return item.name || item.name_zh || item.id;
    }

    function displayMachineName(machineId) {
      const machine = machinesById.value[machineId];
      if (!machine) return machineId || "";
      if (state.lang === "zh") {
        return machine.name_zh || machine.name || machine.id;
      }
      return machine.name || machine.name_zh || machine.id;
    }

    function displayGeneratorName(generatorId) {
      const gen = generatorsById.value[generatorId];
      if (!gen) return generatorId || "";
      if (state.lang === "zh") {
        return gen.name_zh || gen.name || gen.id;
      }
      return gen.name || gen.name_zh || gen.id;
    }

    function formatNumber(value, digits = 2) {
      if (!Number.isFinite(value)) return "0";
      return value.toFixed(digits);
    }

    function formatRatePerMinute(value, digits = 2) {
      if (!Number.isFinite(value)) return "0";
      return (value * 60).toFixed(digits);
    }

    function computeNodeUtilization(node, machineMap) {
      if (!node || !node.machineId || !node.machineCount) {
        return {
          outputUtil: 0,
          inputUtil: 0,
          beltLimited: false,
          outputPorts: 0,
          inputPorts: 0,
          perPortOutput: 0
        };
      }
      const machine = machineMap[node.machineId];
      const outputPorts = machine && machine.output_ports ? machine.output_ports : 1;
      const inputPorts = machine && machine.input_ports ? machine.input_ports : (node.inputSpecs || []).length;
      const perMachineOutput = node.machineCount > 0 ? node.rate / node.machineCount : 0;
      const perPortOutput = outputPorts > 0 ? perMachineOutput / outputPorts : perMachineOutput;
      const outputUtil = perPortOutput / BELT_CAPACITY;

      let maxInputUtil = 0;
      for (const input of node.inputSpecs || []) {
        const inputRate = node.rate * input.qtyPerOutput;
        const perMachine = node.machineCount > 0 ? inputRate / node.machineCount : 0;
        const util = perMachine / BELT_CAPACITY;
        maxInputUtil = Math.max(maxInputUtil, util);
      }

      const recipe = node.recipe;
      const outputQty = recipe ? recipe.output_qty || 1 : 0;
      const timeSec = recipe ? recipe.time_sec || 1 : 1;
      const outputRate = outputQty > 0 && timeSec > 0 ? outputQty / timeSec : 0;
      const beltLimited = perMachineOutput < outputRate - EPS;

      return {
        outputUtil,
        inputUtil: maxInputUtil,
        beltLimited,
        outputPorts,
        inputPorts,
        perPortOutput
      };
    }

    function isNodeBottleneck(util) {
      if (!util) return false;
      return util.outputUtil > 1 + EPS || util.inputUtil > 1 + EPS || util.beltLimited;
    }

    function indexNodes(roots) {
      const nodeIndex = {};
      const parentIndex = {};
      const nodeDepth = {};
      let maxDepth = 0;

      function visit(node, depth, parentId) {
        if (!node || !node.id) return;
        nodeIndex[node.id] = node;
        nodeDepth[node.id] = depth;
        maxDepth = Math.max(maxDepth, depth);
        if (parentId) {
          if (!parentIndex[node.id]) parentIndex[node.id] = [];
          parentIndex[node.id].push(parentId);
        }
        for (const child of node.children || []) {
          visit(child, depth + 1, node.id);
        }
      }

      for (const root of roots || []) {
        visit(root, 0, "");
      }

      return { nodeIndex, parentIndex, nodeDepth, maxDepth };
    }

    function buildNodeUtilIndex(nodeIndex, machineMap) {
      const utilIndex = {};
      for (const id of Object.keys(nodeIndex)) {
        utilIndex[id] = computeNodeUtilization(nodeIndex[id], machineMap);
      }
      return utilIndex;
    }

    function buildAreaPlan(roots, nodeIndex, parentIndex, nodeDepth, itemMap, utilIndex) {
      if (!roots || roots.length === 0) return null;

      let maxNonRawDepth = 0;
      for (const id of Object.keys(nodeIndex)) {
        const node = nodeIndex[id];
        const item = itemMap[node.itemId] || {};
        if (!item.map_only) {
          maxNonRawDepth = Math.max(maxNonRawDepth, nodeDepth[id] || 0);
        }
      }

      const splitDepth = Math.max(1, Math.floor(maxNonRawDepth / 2));
      const groupById = {};
      const area1Ids = [];
      const area2Ids = [];
      let rawTotalRate = 0;

      for (const id of Object.keys(nodeIndex)) {
        const node = nodeIndex[id];
        const item = itemMap[node.itemId] || {};
        let group = "area2";
        if (item.map_only) {
          group = "raw";
        } else if ((nodeDepth[id] || 0) <= splitDepth) {
          group = "area2";
        } else {
          group = "area1";
        }
        groupById[id] = group;
        if (group === "raw") {
          rawTotalRate += node.rate || 0;
        } else if (group === "area1") {
          area1Ids.push(id);
        } else {
          area2Ids.push(id);
        }
      }

      const area1RootIds = [];
      let area1OutputRate = 0;
      for (const id of area1Ids) {
        const parents = parentIndex[id] || [];
        const hasParentInArea1 = parents.some((parentId) => groupById[parentId] === "area1");
        if (!hasParentInArea1) {
          area1RootIds.push(id);
          area1OutputRate += nodeIndex[id].rate || 0;
        }
      }

      const area2RootIds = [];
      let area2OutputRate = 0;
      let finalTotalRate = 0;
      for (const root of roots) {
        finalTotalRate += root.rate || 0;
        if (groupById[root.id] === "area2") {
          area2RootIds.push(root.id);
          area2OutputRate += root.rate || 0;
        }
      }

      const area1Bottlenecks = area1Ids.filter((id) => isNodeBottleneck(utilIndex[id])).length;
      const area2Bottlenecks = area2Ids.filter((id) => isNodeBottleneck(utilIndex[id])).length;

      return {
        splitDepth,
        groupById,
        area1Ids,
        area2Ids,
        area1RootIds,
        area2RootIds,
        rawTotalRate,
        finalTotalRate,
        area1OutputRate,
        area2OutputRate,
        area1Bottlenecks,
        area2Bottlenecks
      };
    }

    function makeBoundaryNode(sourceNode, itemMap, boundaryCounter) {
      const id = `b${boundaryCounter.value++}`;
      return {
        id,
        itemId: sourceNode.itemId,
        rate: sourceNode.rate,
        machineId: null,
        machineCount: 0,
        inputSpecs: [],
        seedLoops: [],
        recipe: null,
        children: [],
        isBoundary: true
      };
    }

    function cloneAreaNode(node, areaId, areaPlan, itemMap, boundaryCounter) {
      if (!node) return null;
      const clone = {
        id: node.id,
        itemId: node.itemId,
        rate: node.rate,
        machineId: node.machineId,
        machineCount: node.machineCount,
        inputSpecs: node.inputSpecs || [],
        seedLoops: node.seedLoops || [],
        recipe: node.recipe,
        children: []
      };
      for (const child of node.children || []) {
        const childGroup = areaPlan.groupById[child.id];
        if (childGroup === areaId) {
          const childClone = cloneAreaNode(child, areaId, areaPlan, itemMap, boundaryCounter);
          if (childClone) clone.children.push(childClone);
        } else {
          clone.children.push(makeBoundaryNode(child, itemMap, boundaryCounter));
        }
      }
      return clone;
    }

    function buildOverviewGraph(roots, itemMap, machineMap, orientation = "vertical", areaPlan) {
      if (!areaPlan) return null;
      const NODE_W = 220;
      const NODE_H = 88;
      const H_GAP = 120;
      const V_GAP = 96;
      const MARGIN = 40;
      const horizontal = orientation === "horizontal";

      const area1BottleneckText = areaPlan.area1Bottlenecks > 0
        ? `${t("diagramBottleneck")}: ${areaPlan.area1Bottlenecks}`
        : `${t("diagramBottleneck")}: ${t("diagramNoBottleneck")}`;
      const area2BottleneckText = areaPlan.area2Bottlenecks > 0
        ? `${t("diagramBottleneck")}: ${areaPlan.area2Bottlenecks}`
        : `${t("diagramBottleneck")}: ${t("diagramNoBottleneck")}`;

      const nodes = [
        {
          id: "overview-raw",
          kind: "overview",
          title: t("diagramRaw"),
          subLines: [`${t("diagramTotalSupply")}: ${formatRatePerMinute(areaPlan.rawTotalRate)} /min`],
          icon: ""
        },
        {
          id: "overview-area1",
          kind: "area",
          areaId: "area1",
          title: t("diagramArea1"),
          subLines: [
            `${t("diagramTotalCapacity")}: ${formatRatePerMinute(areaPlan.area1OutputRate)} /min`,
            area1BottleneckText
          ],
          icon: "",
          alert: areaPlan.area1Bottlenecks > 0
        },
        {
          id: "overview-area2",
          kind: "area",
          areaId: "area2",
          title: t("diagramArea2"),
          subLines: [
            `${t("diagramTotalCapacity")}: ${formatRatePerMinute(areaPlan.area2OutputRate)} /min`,
            area2BottleneckText
          ],
          icon: "",
          alert: areaPlan.area2Bottlenecks > 0
        },
        {
          id: "overview-final",
          kind: "overview",
          title: t("diagramFinal"),
          subLines: [`${t("diagramTotalOutput")}: ${formatRatePerMinute(areaPlan.finalTotalRate)} /min`],
          icon: ""
        }
      ];

      if (horizontal) {
        for (let i = 0; i < nodes.length; i += 1) {
          nodes[i].x = i * (NODE_W + H_GAP);
          nodes[i].y = 0;
        }
      } else {
        for (let i = 0; i < nodes.length; i += 1) {
          nodes[i].x = 0;
          nodes[i].y = i * (NODE_H + V_GAP);
        }
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of nodes) {
        minX = Math.min(minX, node.x - NODE_W / 2);
        minY = Math.min(minY, node.y - NODE_H / 2);
        maxX = Math.max(maxX, node.x + NODE_W / 2);
        maxY = Math.max(maxY, node.y + NODE_H / 2);
      }

      const width = Math.max(1, maxX - minX + MARGIN * 2);
      const height = Math.max(1, maxY - minY + MARGIN * 2);

      for (const node of nodes) {
        node.x = node.x - minX + MARGIN;
        node.y = node.y - minY + MARGIN;
      }

      const links = [];
      for (let i = 0; i < nodes.length - 1; i += 1) {
        const from = nodes[i];
        const to = nodes[i + 1];
        if (horizontal) {
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y;
          const x2 = to.x - NODE_W / 2;
          const y2 = to.y;
          const midX = (x1 + x2) / 2;
          links.push({ path: `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}` });
        } else {
          const x1 = from.x;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y - NODE_H / 2;
          const midY = (y1 + y2) / 2;
          links.push({ path: `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}` });
        }
      }

      return {
        width,
        height,
        nodeSize: { width: NODE_W, height: NODE_H },
        nodes,
        links
      };
    }

    function buildAreaGraph(roots, itemMap, machineMap, orientation = "vertical", areaPlan, nodeIndex, areaId) {
      if (!areaPlan || !nodeIndex || !areaId) return null;
      const rootIds = areaId === "area1" ? areaPlan.area1RootIds : areaPlan.area2RootIds;
      if (!rootIds || rootIds.length === 0) return null;
      const boundaryCounter = { value: 1 };
      const areaRoots = [];
      for (const rootId of rootIds) {
        const source = nodeIndex[rootId];
        if (!source) continue;
        const clone = cloneAreaNode(source, areaId, areaPlan, itemMap, boundaryCounter);
        if (clone) areaRoots.push(clone);
      }
      if (areaRoots.length === 0) return null;
      const graph = buildPreciseGraph(areaRoots, itemMap, machineMap, orientation);
      if (graph && Array.isArray(graph.nodes)) {
        for (const node of graph.nodes) {
          node.clickable = !node.isBoundary && !node.isLoop;
        }
      }
      return graph;
    }

    function toggleLang() {
      state.lang = state.lang === "zh" ? "en" : "zh";
      updateDiagramGraph();
    }

    function setDiagramFullscreen(nextValue) {
      state.diagramFullscreen = Boolean(nextValue);
      if (typeof document !== "undefined") {
        document.body.classList.toggle("diagram-fullscreen", state.diagramFullscreen);
      }
      if (!state.diagramFullscreen) {
        stopDiagramDrag();
      }
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resetDiagramView();
          });
        });
      }
    }

    function toggleDiagramFullscreen() {
      setDiagramFullscreen(!state.diagramFullscreen);
    }

    function updateDiagramGraph(options = {}) {
      if (!state.results || !state.results.roots) return;
      const graph = buildGraph(
        state.results.roots,
        itemsById.value,
        machinesById.value,
        state.diagramOrientation,
        {
          areaPlan: state.results.areaPlan
        }
      );
      state.results.graph = graph;
      if (options.resetView) {
        resetDiagramView();
      }
    }

    function setDiagramOrientation(orientation) {
      if (state.diagramOrientation === orientation) return;
      state.diagramOrientation = orientation;
      updateDiagramGraph({ resetView: true });
    }

    function clampDiagramZoom(value) {
      return Math.min(DIAGRAM_ZOOM_MAX, Math.max(DIAGRAM_ZOOM_MIN, value));
    }

    function applyDiagramZoom(value, anchor) {
      const container = diagramRef.value;
      const nextZoom = clampDiagramZoom(value);
      if (!container) {
        state.diagramZoom = nextZoom;
        return;
      }
      const prevZoom = state.diagramZoom;
      if (Math.abs(prevZoom - nextZoom) < 0.0001) return;

      const rect = container.getBoundingClientRect();
      const anchorX = anchor && Number.isFinite(anchor.x) ? anchor.x : rect.width / 2;
      const anchorY = anchor && Number.isFinite(anchor.y) ? anchor.y : rect.height / 2;

      const worldX = (anchorX - diagramTransform.x) / prevZoom;
      const worldY = (anchorY - diagramTransform.y) / prevZoom;

      state.diagramZoom = nextZoom;

      diagramTransform.x = anchorX - worldX * nextZoom;
      diagramTransform.y = anchorY - worldY * nextZoom;
    }

    function zoomDiagramBy(delta, anchor) {
      applyDiagramZoom(state.diagramZoom + delta, anchor);
    }

    function zoomIn() {
      zoomDiagramBy(DIAGRAM_ZOOM_STEP);
    }

    function zoomOut() {
      zoomDiagramBy(-DIAGRAM_ZOOM_STEP);
    }

    function resetDiagramView() {
      const container = diagramRef.value;
      if (container && state.results && state.results.graph) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const graphWidth = state.results.graph.width;
        const graphHeight = state.results.graph.height;
        let nextZoom = 1;
        if (graphWidth > 0 && graphHeight > 0 && containerWidth > 0 && containerHeight > 0) {
          const fitScale = Math.min(containerWidth / graphWidth, containerHeight / graphHeight);
          if (fitScale < 1) {
            nextZoom = clampDiagramZoom(fitScale * 0.95);
          }
        }
        state.diagramZoom = nextZoom;
        diagramTransform.x = (containerWidth - graphWidth * nextZoom) / 2;
        diagramTransform.y = (containerHeight - graphHeight * nextZoom) / 2;
      } else {
        state.diagramZoom = 1;
        diagramTransform.x = 0;
        diagramTransform.y = 0;
      }
      if (container) {
        requestAnimationFrame(() => {
          container.scrollLeft = 0;
          container.scrollTop = 0;
        });
      }
    }

    function onDiagramWheel(event) {
      if (!state.results || !state.results.graph) return;
      const container = diagramRef.value;
      if (!container) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const zoomFactor = Math.exp(-event.deltaY * 0.002);
      applyDiagramZoom(state.diagramZoom * zoomFactor, anchor);
    }

    function stopDiagramDrag(pointerId) {
      if (!diagramDrag.active) return;
      const container = diagramRef.value;
      if (container) {
        container.classList.remove("dragging");
        if (container.releasePointerCapture && diagramDrag.pointerId !== null) {
          container.releasePointerCapture(diagramDrag.pointerId);
        } else if (container.releasePointerCapture && pointerId !== undefined) {
          container.releasePointerCapture(pointerId);
        }
      }
      diagramDrag.active = false;
      diagramDrag.pointerId = null;
    }

    function onDiagramPointerDown(event) {
      const container = diagramRef.value;
      if (!container) return;
      if (event.target.closest('button, .btn, .icon-btn, .seg-btn')) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      diagramPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (container.setPointerCapture) {
        container.setPointerCapture(event.pointerId);
      }

      if (diagramPointers.size >= 2) {
        const pointers = Array.from(diagramPointers.values());
        const p1 = pointers[0];
        const p2 = pointers[1];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.hypot(dx, dy);
        diagramPinch.active = true;
        diagramPinch.startDist = dist || 1;
        diagramPinch.startZoom = state.diagramZoom;
        diagramDrag.active = false;
        diagramDrag.pointerId = null;
        container.classList.remove("dragging");
        event.preventDefault();
        return;
      }

      diagramDrag.active = true;
      diagramDrag.pointerId = event.pointerId;
      diagramDrag.startX = event.clientX;
      diagramDrag.startY = event.clientY;
      diagramDrag.scrollLeft = diagramTransform.x;
      diagramDrag.scrollTop = diagramTransform.y;
      container.classList.add("dragging");
      if (container.setPointerCapture) {
        container.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    }

    function onDiagramPointerMove(event) {
      const container = diagramRef.value;
      if (!container) return;
      if (diagramPointers.has(event.pointerId)) {
        diagramPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (diagramPinch.active && diagramPointers.size >= 2) {
        const pointers = Array.from(diagramPointers.values());
        const p1 = pointers[0];
        const p2 = pointers[1];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.hypot(dx, dy);
        if (diagramPinch.startDist > 0) {
          const scale = dist / diagramPinch.startDist;
          const rect = container.getBoundingClientRect();
          const centerX = (p1.x + p2.x) / 2 - rect.left;
          const centerY = (p1.y + p2.y) / 2 - rect.top;
          applyDiagramZoom(diagramPinch.startZoom * scale, { x: centerX, y: centerY });
        }
        return;
      }

      if (!diagramDrag.active) return;
      const dx = event.clientX - diagramDrag.startX;
      const dy = event.clientY - diagramDrag.startY;
      diagramTransform.x = diagramDrag.scrollLeft + dx;
      diagramTransform.y = diagramDrag.scrollTop + dy;
    }

    function onDiagramPointerUp(event) {
      if (diagramPointers.has(event.pointerId)) {
        diagramPointers.delete(event.pointerId);
      }
      if (diagramPinch.active && diagramPointers.size < 2) {
        diagramPinch.active = false;
        diagramPinch.startDist = 0;
      }
      if (diagramDrag.active && diagramDrag.pointerId === event.pointerId) {
        stopDiagramDrag(event.pointerId);
      }
    }

    function onWindowKeydown(event) {
      if (event.key === "Escape" && state.diagramFullscreen) {
        setDiagramFullscreen(false);
      }
    }

    function addTarget() {
      const defaultItem = craftableItems.value[0];
      state.targets.push({
        uid: targetUid++,
        itemId: defaultItem ? defaultItem.id : "",
        rate: "",
        maximize: true
      });
    }

    function removeTarget(index) {
      state.targets.splice(index, 1);
    }

    function moveTarget(index, delta) {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= state.targets.length) return;
      const [item] = state.targets.splice(index, 1);
      state.targets.splice(nextIndex, 0, item);
    }

    function updateFuel() {
      const options = generatorFuelOptions.value;
      if (!options.includes(state.selectedFuelId)) {
        state.selectedFuelId = options[0] || "";
      }
    }

    function normalizeItems(items) {
      return items.map((item) => {
        const normalized = { ...item };
        if (normalized.recipe && !normalized.recipes) {
          normalized.recipes = [normalized.recipe];
        }
        if (!Array.isArray(normalized.recipes)) {
          normalized.recipes = [];
        }
        if (normalized.startup_only === undefined) {
          normalized.startup_only = false;
        }
        return normalized;
      });
    }

    function getOutputRate(recipe) {
      const outputQty = recipe.output_qty || 1;
      const timeSec = recipe.time_sec || 1;
      return outputQty / timeSec;
    }

    function getEffectiveOutputRate(recipe, machine) {
      const outputQty = recipe.output_qty || 1;
      const timeSec = recipe.time_sec || 1;
      const machineRate = outputQty / timeSec;
      const outputPorts = machine && machine.output_ports ? machine.output_ports : 1;
      const outputLimit = outputPorts * BELT_CAPACITY;

      let inputLimit = Infinity;
      const inputs = recipe.inputs || [];
      let totalPerOutput = 0;
      for (const input of inputs) {
        const perOutput = input.qty / outputQty;
        totalPerOutput += perOutput;
        if (perOutput > 0) {
          inputLimit = Math.min(inputLimit, BELT_CAPACITY / perOutput);
        }
      }
      if (machine && machine.input_ports && totalPerOutput > 0) {
        inputLimit = Math.min(inputLimit, (machine.input_ports * BELT_CAPACITY) / totalPerOutput);
      }
      if (!Number.isFinite(inputLimit)) {
        inputLimit = machineRate;
      }
      return Math.min(machineRate, outputLimit, inputLimit);
    }

    function recalculate() {
      if (state.items.length === 0) return;
      const itemMap = itemsById.value;
      const machineMap = machinesById.value;

      const warnings = [];
      const availableRaw = {};
      for (const supply of state.supplies) {
        const value = parseFloat(supply.rate);
        const perMinute = Number.isFinite(value) ? value : 0;
        availableRaw[supply.itemId] = perMinute / 60;
      }

      const variantCache = {};

      function addWarning(message) {
        warnings.push(message);
      }

      function validateRecipe(item, recipe, machine) {
        const inputs = recipe.inputs || [];
        if (!machine) {
          addWarning(`Missing machine "${recipe.machine}" for item "${item.id}".`);
          return;
        }
        if (machine.input_ports && machine.input_ports < inputs.length) {
          addWarning(`Machine "${machine.id}" input ports less than inputs for "${item.id}".`);
        }
        if (Array.isArray(machine.allowed_items) && machine.allowed_items.length > 0) {
          for (const input of inputs) {
            if (!machine.allowed_items.includes(input.item)) {
              addWarning(`Machine "${machine.id}" disallows input "${input.item}" for "${item.id}".`);
            }
          }
        }
        if (Array.isArray(machine.allowed_categories) && machine.allowed_categories.length > 0) {
          for (const input of inputs) {
            const inputItem = itemMap[input.item];
            if (!inputItem) continue;
            if (!machine.allowed_categories.includes(inputItem.category)) {
              addWarning(`Machine "${machine.id}" disallows category "${inputItem.category}" for "${item.id}".`);
            }
          }
        }
      }

      function findSeedLoop(itemId, seedItemId) {
        const seedItem = itemMap[seedItemId];
        if (!seedItem || !Array.isArray(seedItem.recipes)) return null;
        const seedRecipe = seedItem.recipes.find((recipe) =>
          (recipe.inputs || []).some((input) => input.item === itemId)
        );
        if (!seedRecipe) return null;
        const cropInput = (seedRecipe.inputs || []).find((input) => input.item === itemId);
        return {
          seedItem,
          seedRecipe,
          cropInputQty: cropInput ? cropInput.qty : 0
        };
      }

      function expandVariants(itemId, stack = []) {
        if (variantCache[itemId]) return variantCache[itemId];
        if (stack.includes(itemId)) {
          addWarning(`Cycle detected at "${itemId}".`);
          variantCache[itemId] = [];
          return [];
        }

        const item = itemMap[itemId];
        if (!item) {
          addWarning(`Unknown item "${itemId}".`);
          variantCache[itemId] = [];
          return [];
        }

        if (item.map_only) {
          const rawVariant = {
            itemId,
            recipe: null,
            rawReq: new Map([[itemId, 1]]),
            machineUsage: new Map(),
            machineTotal: 0,
            depth: 0,
            inputs: [],
            effectiveOutputRate: Infinity
          };
          variantCache[itemId] = [rawVariant];
          return [rawVariant];
        }

        if (!item.recipes || item.recipes.length === 0) {
          addWarning(`Item "${itemId}" has no recipe.`);
          variantCache[itemId] = [];
          return [];
        }

        const variants = [];
        for (const recipe of item.recipes) {
          const machine = machineMap[recipe.machine];
          validateRecipe(item, recipe, machine);

          const inputs = recipe.inputs || [];
          const inputVariantsList = [];
          const seedInputs = [];
          let hasMissing = false;
          for (const input of inputs) {
            const inputItem = itemMap[input.item];
            if (inputItem && inputItem.startup_only) {
              seedInputs.push(input);
              continue;
            }
            const childVariants = expandVariants(input.item, [...stack, itemId]);
            if (childVariants.length === 0) {
              hasMissing = true;
            }
            inputVariantsList.push({ input, variants: childVariants });
          }
          if (hasMissing) continue;

          function buildCombo(index, picked) {
            if (index === inputVariantsList.length) {
              const outputQty = recipe.output_qty || 1;
              let effectiveRate = machine ? getEffectiveOutputRate(recipe, machine) : getOutputRate(recipe);
              const seedLoops = [];
              let netMultiplier = 1;

              if (seedInputs.length > 0) {
                let totalRatio = 0;
                for (const seedInput of seedInputs) {
                  const loop = findSeedLoop(itemId, seedInput.item);
                  if (!loop) {
                    addWarning(`Missing seed loop recipe for "${seedInput.item}" in "${itemId}".`);
                    continue;
                  }
                  const seedRecipe = loop.seedRecipe;
                  const seedOutputQty = seedRecipe.output_qty || 1;
                  const seedMachine = machineMap[seedRecipe.machine];
                  const seedRecipeEffectiveRate = seedMachine
                    ? getEffectiveOutputRate(seedRecipe, seedMachine)
                    : getOutputRate(seedRecipe);
                  const seedPerOutput = seedInput.qty / outputQty;
                  if (!seedOutputQty || !loop.cropInputQty) {
                    addWarning(`Invalid seed loop for "${seedInput.item}" in "${itemId}".`);
                    continue;
                  }
                  const ratio = seedPerOutput * (loop.cropInputQty / seedOutputQty);
                  totalRatio += ratio;
                  seedLoops.push({
                    seedItemId: seedInput.item,
                    seedRecipe,
                    seedMachineId: seedRecipe.machine,
                    seedRecipeEffectiveRate,
                    seedPerOutput
                  });
                }
                netMultiplier = 1 - totalRatio;
                if (netMultiplier <= EPS) {
                  addWarning(`Seed loop for "${itemId}" leaves no net output.`);
                  return;
                }
                effectiveRate *= netMultiplier;
              }

              if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) {
                addWarning(`Invalid output rate for "${itemId}".`);
                return;
              }

              const rawReq = new Map();
              const machineUsage = new Map();
              let depth = 0;
              const inputsUsed = [];

              for (const choice of picked) {
                const inputScale = (choice.input.qty / outputQty) / netMultiplier;
                inputsUsed.push({
                  itemId: choice.input.item,
                  qtyPerOutput: inputScale,
                  variant: choice.variant
                });

                for (const [rawId, qty] of choice.variant.rawReq) {
                  rawReq.set(rawId, (rawReq.get(rawId) || 0) + qty * inputScale);
                }

                for (const [machineId, qty] of choice.variant.machineUsage) {
                  machineUsage.set(machineId, (machineUsage.get(machineId) || 0) + qty * inputScale);
                }

                depth = Math.max(depth, choice.variant.depth);
              }

              if (machine) {
                const machinePerUnit = 1 / effectiveRate;
                machineUsage.set(machine.id, (machineUsage.get(machine.id) || 0) + machinePerUnit);
              }

              for (const loop of seedLoops) {
                if (!Number.isFinite(loop.seedRecipeEffectiveRate) || loop.seedRecipeEffectiveRate <= 0) {
                  addWarning(`Invalid seed loop rate for "${loop.seedItemId}" in "${itemId}".`);
                  continue;
                }
                const seedsPerOutput = loop.seedPerOutput / netMultiplier;
                const machinePerUnit = seedsPerOutput / loop.seedRecipeEffectiveRate;
                machineUsage.set(
                  loop.seedMachineId,
                  (machineUsage.get(loop.seedMachineId) || 0) + machinePerUnit
                );
                loop.seedsPerOutput = seedsPerOutput;
                loop.machinePerUnit = machinePerUnit;
              }

              let machineTotal = 0;
              for (const qty of machineUsage.values()) {
                machineTotal += qty;
              }

              variants.push({
                itemId,
                recipe,
                rawReq,
                machineUsage,
                machineTotal,
                depth: depth + 1,
                inputs: inputsUsed,
                effectiveOutputRate: effectiveRate,
                seedLoops
              });
              return;
            }

            const entry = inputVariantsList[index];
            for (const variant of entry.variants) {
              picked.push({ input: entry.input, variant });
              buildCombo(index + 1, picked);
              picked.pop();
            }
          }

          buildCombo(0, []);
        }

        variantCache[itemId] = variants;
        return variants;
      }

      function pickBestVariant(itemId, available) {
        const variants = expandVariants(itemId);
        if (variants.length === 0) return null;

        let best = null;
        for (const variant of variants) {
          let maxRate = Infinity;
          for (const [rawId, qty] of variant.rawReq) {
            if (qty <= 0) continue;
            const supply = available[rawId] || 0;
            maxRate = Math.min(maxRate, supply / qty);
          }
          if (!Number.isFinite(maxRate)) maxRate = 0;

          if (!best) {
            best = { variant, maxRate };
            continue;
          }

          if (maxRate > best.maxRate + EPS) {
            best = { variant, maxRate };
            continue;
          }

          if (Math.abs(maxRate - best.maxRate) <= EPS) {
            if (variant.machineTotal < best.variant.machineTotal - EPS) {
              best = { variant, maxRate };
              continue;
            }
            if (Math.abs(variant.machineTotal - best.variant.machineTotal) <= EPS) {
              if (variant.depth < best.variant.depth) {
                best = { variant, maxRate };
              }
            }
          }
        }

        return best;
      }

      function consumeResources(variant, rate, available, rawUsage) {
        for (const [rawId, qty] of variant.rawReq) {
          const used = qty * rate;
          rawUsage[rawId] = (rawUsage[rawId] || 0) + used;
          available[rawId] = Math.max(0, (available[rawId] || 0) - used);
        }
      }

      nodeUid = 1;

      function mergeRawUsage(target, source) {
        for (const [rawId, qty] of source) {
          target.set(rawId, (target.get(rawId) || 0) + qty);
        }
      }

      function rollbackRawUsage(available, usage) {
        for (const [rawId, qty] of usage) {
          available[rawId] = (available[rawId] || 0) + qty;
        }
      }

      function buildTreeDiscrete(itemId, variant, requestedRate, available, allowPartial) {
        const item = itemMap[itemId];
        if (!item) {
          addWarning(`Unknown item "${itemId}".`);
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
            actualRate: 0,
            rawUsage: new Map()
          };
        }

        if (requestedRate <= EPS) {
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
            actualRate: 0,
            rawUsage: new Map()
          };
        }

        if (item.map_only) {
          const availableRate = available[itemId] || 0;
          const actualRate = Math.min(requestedRate, availableRate);
          if (actualRate > 0) {
            available[itemId] = Math.max(0, availableRate - actualRate);
          }
          const rawUsage = new Map();
          if (actualRate > 0) {
            rawUsage.set(itemId, actualRate);
          }
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: actualRate, machineId: null, machineCount: 0, children: [] },
            actualRate,
            rawUsage
          };
        }

        if (!variant || !variant.recipe) {
          addWarning(`Item "${itemId}" has no recipe.`);
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
            actualRate: 0,
            rawUsage: new Map()
          };
        }

        const effectiveRate = variant.effectiveOutputRate;
        if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) {
          addWarning(`Invalid output rate for "${itemId}".`);
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
            actualRate: 0,
            rawUsage: new Map()
          };
        }

        let targetRate = requestedRate;
        let guard = 0;

        while (guard < 20) {
          guard += 1;
          const machineCount = allowPartial
            ? Math.ceil(targetRate / effectiveRate - EPS)
            : Math.floor(targetRate / effectiveRate + EPS);
          if (machineCount <= 0) {
            return {
              node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
              actualRate: 0,
              rawUsage: new Map()
            };
          }

          const capacityRate = machineCount * effectiveRate;
          const actualRate = allowPartial ? Math.min(targetRate, capacityRate) : capacityRate;
          const children = [];
          const rawUsage = new Map();
          let minSupportedRate = actualRate;

          for (const input of variant.inputs || []) {
            const reqRate = actualRate * input.qtyPerOutput;
            const child = buildTreeDiscrete(input.itemId, input.variant, reqRate, available, true);
            children.push(child.node);
            mergeRawUsage(rawUsage, child.rawUsage);
            if (reqRate > EPS) {
              const supportedRate = child.actualRate / input.qtyPerOutput;
              minSupportedRate = Math.min(minSupportedRate, supportedRate);
            }
          }

          if (minSupportedRate < actualRate - EPS) {
            rollbackRawUsage(available, rawUsage);
            if (minSupportedRate <= EPS) {
              return {
                node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
                actualRate: 0,
                rawUsage: new Map()
              };
            }
            targetRate = minSupportedRate;
            continue;
          }

          return {
            node: {
              id: `n${nodeUid++}`,
              itemId,
              rate: actualRate,
              machineId: variant.recipe.machine,
              machineCount,
              inputSpecs: variant.inputs || [],
              seedLoops: variant.seedLoops || [],
              recipe: variant.recipe,
              children
            },
            actualRate,
            rawUsage
          };
        }

        addWarning(`Failed to resolve discrete machines for "${itemId}".`);
        return {
          node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
          actualRate: 0,
          rawUsage: new Map()
        };
      }

      function collectMachineStats(roots) {
        const machineTotals = {};
        const machineRuns = [];

        function recordMachine(machineId, machineCount, machine) {
          const existing = machineTotals[machineId] || {
            machineId,
            count: 0,
            powerPerMachine: machine ? machine.power || 0 : 0,
            kitSize: machine ? machine.kit_size || 1 : 1,
            name: machine ? machine.name : "",
            name_zh: machine ? machine.name_zh : ""
          };
          existing.count += machineCount;
          machineTotals[machineId] = existing;
        }

        function recordMachineRun(entry) {
          machineRuns.push(entry);
        }

        function visit(node) {
          if (!node) return;

          if (node.machineId && node.machineCount > 0) {
            const machine = machineMap[node.machineId];
            if (machine) {
              recordMachine(node.machineId, node.machineCount, machine);
            } else {
              addWarning(`Missing machine "${node.machineId}" for item "${node.itemId}".`);
            }

            const outputPorts = machine && machine.output_ports ? machine.output_ports : 1;
            const inputPorts = machine && machine.input_ports ? machine.input_ports : (node.inputSpecs || []).length;
            const perMachineOutput = node.machineCount > 0 ? node.rate / node.machineCount : 0;
            const perPortOutput = outputPorts > 0 ? perMachineOutput / outputPorts : perMachineOutput;
            const outputUtil = perPortOutput / BELT_CAPACITY;

            let maxInputUtil = 0;
            for (const input of node.inputSpecs || []) {
              const inputRate = node.rate * input.qtyPerOutput;
              const perMachine = node.machineCount > 0 ? inputRate / node.machineCount : 0;
              const util = perMachine / BELT_CAPACITY;
              maxInputUtil = Math.max(maxInputUtil, util);
            }

            const outputRate = node.recipe ? getOutputRate(node.recipe) : 0;
            const beltLimited = perMachineOutput < outputRate - EPS;

            recordMachineRun({
              itemId: node.itemId,
              machineId: node.machineId,
              rate: node.rate,
              machineCount: node.machineCount,
              outputPorts,
              inputPorts,
              perPortOutput,
              outputUtil,
              inputUtil: maxInputUtil,
              beltLimited
            });

            for (const loop of node.seedLoops || []) {
              const seedMachine = machineMap[loop.seedMachineId];
              if (!seedMachine) {
                addWarning(`Missing machine "${loop.seedMachineId}" for item "${loop.seedItemId}".`);
                continue;
              }
              const seedRateDesired = node.rate * (loop.seedsPerOutput || 0);
              const seedEffectiveRate = loop.seedRecipeEffectiveRate || getOutputRate(loop.seedRecipe);
              const seedMachineCount = seedEffectiveRate > 0
                ? Math.ceil(seedRateDesired / seedEffectiveRate - EPS)
                : 0;
              if (seedMachineCount <= 0) {
                continue;
              }

              const seedRate = Math.min(seedRateDesired, seedMachineCount * seedEffectiveRate);
              recordMachine(loop.seedMachineId, seedMachineCount, seedMachine);

              const seedOutputPorts = seedMachine.output_ports ? seedMachine.output_ports : 1;
              const seedInputPorts = seedMachine.input_ports
                ? seedMachine.input_ports
                : (loop.seedRecipe.inputs || []).length;
              const seedPerMachineOutput = seedRate / seedMachineCount;
              const seedPerPortOutput = seedOutputPorts > 0 ? seedPerMachineOutput / seedOutputPorts : seedPerMachineOutput;
              const seedOutputUtil = seedPerPortOutput / BELT_CAPACITY;

              let seedInputUtil = 0;
              const seedOutputQty = loop.seedRecipe.output_qty || 1;
              for (const input of loop.seedRecipe.inputs || []) {
                const inputRate = seedRate * (input.qty / seedOutputQty);
                const perMachine = seedMachineCount > 0 ? inputRate / seedMachineCount : 0;
                const util = perMachine / BELT_CAPACITY;
                seedInputUtil = Math.max(seedInputUtil, util);
              }

              const seedOutputRate = getOutputRate(loop.seedRecipe);
              const seedBeltLimited = seedPerMachineOutput < seedOutputRate - EPS;

              recordMachineRun({
                itemId: loop.seedItemId,
                machineId: loop.seedMachineId,
                rate: seedRate,
                machineCount: seedMachineCount,
                outputPorts: seedOutputPorts,
                inputPorts: seedInputPorts,
                perPortOutput: seedPerPortOutput,
                outputUtil: seedOutputUtil,
                inputUtil: seedInputUtil,
                beltLimited: seedBeltLimited
              });
            }
          }

          for (const child of node.children || []) {
            visit(child);
          }
        }

        for (const root of roots) {
          visit(root);
        }

        const machineTotalsList = Object.values(machineTotals).map((entry) => {
          const kitSize = entry.kitSize || 1;
          return {
            ...entry,
            kitCount: kitSize > 0 ? Math.ceil(entry.count / kitSize) : 0,
            totalPower: entry.count * entry.powerPerMachine
          };
        });

        return { machineTotalsList, machineRuns };
      }

      const outputs = [];
      const rawUsage = {};
      const roots = [];

      for (const target of state.targets) {
        const itemId = target.itemId;
        if (!itemId) continue;

        const pick = pickBestVariant(itemId, availableRaw);
        if (!pick) {
          addWarning(`No valid recipe path for "${itemId}".`);
          continue;
        }

        const desired = parseFloat(target.rate);
        const desiredRate = Number.isFinite(desired) ? desired : null;
        const maxRate = Math.max(0, pick.maxRate);
        const requestedRate = target.maximize || desiredRate === null ? maxRate : Math.min(desiredRate, maxRate);

        if (desiredRate !== null && desiredRate > maxRate + EPS) {
          addWarning(`Target "${itemId}" capped at ${formatNumber(maxRate)} /s by resources.`);
        }

        const result = buildTreeDiscrete(itemId, pick.variant, requestedRate, availableRaw, false);
        const actualRate = result.actualRate;

        if (desiredRate !== null && actualRate < desiredRate - EPS) {
          addWarning(`Target "${itemId}" capped at ${formatNumber(actualRate)} /s after rounding.`);
        }

        outputs.push({ itemId, rate: actualRate });
        roots.push(result.node);
        for (const [rawId, qty] of result.rawUsage) {
          rawUsage[rawId] = (rawUsage[rawId] || 0) + qty;
        }
      }

      const { machineTotalsList, machineRuns } = collectMachineStats(roots);
      const { nodeIndex, parentIndex, nodeDepth } = indexNodes(roots);
      const utilIndex = buildNodeUtilIndex(nodeIndex, machineMap);
      const areaPlan = buildAreaPlan(roots, nodeIndex, parentIndex, nodeDepth, itemMap, utilIndex);

      const totalMachinePower = machineTotalsList.reduce((sum, entry) => sum + entry.totalPower, 0);
      const basePower = Number.isFinite(parseFloat(state.basePower)) ? parseFloat(state.basePower) : 0;
      const totalPower = totalMachinePower + basePower;

      let powerPerGenerator = 0;
      let generatorCount = 0;
      let fuelRate = 0;

      const gen = generatorsById.value[state.selectedGeneratorId];
      if (gen && gen.fuel_power && state.selectedFuelId) {
        const fuelPower = gen.fuel_power[state.selectedFuelId];
        powerPerGenerator = fuelPower || 0;
        if (powerPerGenerator > 0) {
          generatorCount = Math.ceil(totalPower / powerPerGenerator);
          fuelRate = generatorCount * (gen.fuel_rate_per_sec || 0);
        }
      }

      const rawUsageList = [];
      for (const supply of state.supplies) {
        const used = rawUsage[supply.itemId] || 0;
        const availablePerMinute = parseFloat(supply.rate);
        if (used <= EPS && (!Number.isFinite(availablePerMinute) || availablePerMinute <= EPS)) continue;
        const availPerMinute = Number.isFinite(availablePerMinute) ? availablePerMinute : 0;
        const usedPerMinute = used * 60;
        const utilization = availPerMinute > 0 ? usedPerMinute / availPerMinute : 0;
        rawUsageList.push({
          itemId: supply.itemId,
          used: usedPerMinute,
          available: availPerMinute,
          utilization
        });
      }

      const graph = buildGraph(
        roots,
        itemMap,
        machineMap,
        state.diagramOrientation,
        {
          areaPlan
        }
      );

      state.results = {
        basePower,
        totalPower,
        powerPerGenerator,
        generatorCount,
        fuelRate,
        outputs,
        rawUsage: rawUsageList,
        machineTotals: machineTotalsList,
        machineRuns,
        graph,
        roots,
        areaPlan
      };

      state.warnings = warnings;
      resetDiagramView();
    }

    function buildSummaryGraph(roots, itemMap, machineMap, orientation = "vertical") {
      if (!roots || roots.length === 0) {
        return null;
      }

      const NODE_W = 200;
      const NODE_H = 72;
      const H_GAP = 48;
      const V_GAP = 96;
      const MARGIN = 40;
      const horizontal = orientation === "horizontal";

      function measure(node) {
        if (!node.children || node.children.length === 0) {
          node._leafSpan = 1;
          return 1;
        }
        let span = 0;
        for (const child of node.children) {
          span += measure(child);
        }
        node._leafSpan = Math.max(1, span);
        return node._leafSpan;
      }

      for (const root of roots) {
        measure(root);
      }

      const leafSpanSize = horizontal ? NODE_H + V_GAP : NODE_W + H_GAP;
      const depthSpanSize = horizontal ? NODE_W + H_GAP : NODE_H + V_GAP;

      function assign(node, x, y) {
        node.x = x;
        node.y = y;
        if (!node.children || node.children.length === 0) return;
        let start = horizontal
          ? y - (node._leafSpan * leafSpanSize) / 2
          : x - (node._leafSpan * leafSpanSize) / 2;
        for (const child of node.children) {
          const childCenter = start + (child._leafSpan * leafSpanSize) / 2;
          if (horizontal) {
            assign(child, x - depthSpanSize, childCenter);
          } else {
            assign(child, childCenter, y - depthSpanSize);
          }
          start += child._leafSpan * leafSpanSize;
        }
      }

      let cursor = 0;
      for (const root of roots) {
        const rootSpan = root._leafSpan * leafSpanSize;
        const rootCenter = cursor + rootSpan / 2;
        if (horizontal) {
          assign(root, 0, rootCenter);
          cursor += rootSpan + NODE_H;
        } else {
          assign(root, rootCenter, 0);
          cursor += rootSpan + NODE_W;
        }
      }

      const nodes = [];
      const rawLinks = [];

      function flatten(node) {
        nodes.push(node);
        if (node.children) {
          for (const child of node.children) {
            rawLinks.push({ from: child.id, to: node.id });
            flatten(child);
          }
        }
      }

      for (const root of roots) {
        flatten(root);
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const node of nodes) {
        minX = Math.min(minX, node.x - NODE_W / 2);
        maxX = Math.max(maxX, node.x + NODE_W / 2);
        minY = Math.min(minY, node.y - NODE_H / 2);
        maxY = Math.max(maxY, node.y + NODE_H / 2);
      }

      const width = Math.max(1, maxX - minX + MARGIN * 2);
      const height = Math.max(1, maxY - minY + MARGIN * 2);

      const nodeMap = {};
      for (const node of nodes) {
        node.x = node.x - minX + MARGIN;
        node.y = node.y - minY + MARGIN;
        nodeMap[node.id] = node;
      }

      const links = rawLinks.map((link) => {
        const from = nodeMap[link.from];
        const to = nodeMap[link.to];
        if (horizontal) {
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y;
          const x2 = to.x - NODE_W / 2;
          const y2 = to.y;
          const midX = (x1 + x2) / 2;
          return { path: `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}` };
        }
        const x1 = from.x;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x;
        const y2 = to.y - NODE_H / 2;
        const midY = (y1 + y2) / 2;
        return { path: `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}` };
      });

      const graphNodes = nodes.map((node) => {
        const item = itemMap[node.itemId] || {};
        return {
          id: node.id,
          x: node.x,
          y: node.y,
          itemId: node.itemId,
          machineId: node.machineId,
          rate: node.rate,
          icon: item.icon || "",
          isRaw: item.map_only
        };
      });

      return {
        width,
        height,
        nodeSize: { width: NODE_W, height: NODE_H },
        nodes: graphNodes,
        links
      };
    }

    function buildPreciseGraph(roots, itemMap, machineMap, orientation = "vertical") {
      if (!roots || roots.length === 0) {
        return null;
      }

      const NODE_W = 180;
      const NODE_H = 64;
      const H_GAP = 24;
      const V_GAP = 32;
      const MARGIN = 40;
      const LOOP_GAP = 36;
      const horizontal = orientation === "horizontal";

      const depthMap = new Map();

      function assignDepth(node, depth) {
        depthMap.set(node.id, depth);
        for (const child of node.children || []) {
          assignDepth(child, depth + 1);
        }
      }

      for (const root of roots) {
        assignDepth(root, 0);
      }

      function gcd(a, b) {
        let x = Math.abs(a);
        let y = Math.abs(b);
        while (y > 0) {
          const temp = x % y;
          x = y;
          y = temp;
        }
        return x || 0;
      }

      function estimateSeedMachineCount(node, loop) {
        const seedsPerOutput = loop.seedsPerOutput || loop.seedPerOutput || 0;
        if (seedsPerOutput <= EPS) return 0;
        const seedEffectiveRate = loop.seedRecipeEffectiveRate || (loop.seedRecipe ? getOutputRate(loop.seedRecipe) : 0);
        if (!Number.isFinite(seedEffectiveRate) || seedEffectiveRate <= EPS) return 0;
        const seedRateDesired = node.rate * seedsPerOutput;
        if (!Number.isFinite(seedRateDesired) || seedRateDesired <= EPS) return 0;
        return Math.ceil(seedRateDesired / seedEffectiveRate - EPS);
      }

      function collectModuleCounts(node, counts) {
        if (node.machineId && node.machineCount > 0) {
          counts.push(node.machineCount);
        }
        for (const loop of node.seedLoops || []) {
          const loopCount = estimateSeedMachineCount(node, loop);
          if (loopCount > 0) {
            counts.push(loopCount);
          }
        }
        for (const child of node.children || []) {
          collectModuleCounts(child, counts);
        }
      }

      function computeModuleScale(root) {
        const counts = [];
        collectModuleCounts(root, counts);
        let scale = 0;
        for (const count of counts) {
          scale = scale === 0 ? count : gcd(scale, count);
          if (scale === 1) break;
        }
        return scale > 0 ? scale : 1;
      }

      function applyModuleScale(node, scale) {
        const safeScale = scale > 0 ? scale : 1;
        if (node.machineCount > 0) {
          node._moduleCount = Math.max(1, Math.round(node.machineCount / safeScale));
        } else {
          node._moduleCount = 0;
        }
        node._moduleRate = Number.isFinite(node.rate) ? node.rate / safeScale : 0;
        for (const child of node.children || []) {
          applyModuleScale(child, safeScale);
        }
      }

      for (const root of roots) {
        const scale = computeModuleScale(root);
        applyModuleScale(root, scale);
      }

      function computeLine(count, axis) {
        if (count <= 0) {
          return { count: 0, width: 0, height: 0, axis };
        }
        if (axis === "x") {
          return {
            count,
            width: count * NODE_W + (count - 1) * H_GAP,
            height: NODE_H,
            axis
          };
        }
        return {
          count,
          width: NODE_W,
          height: count * NODE_H + (count - 1) * V_GAP,
          axis
        };
      }

      function layoutLine(lineNodes, layout, startX, startY) {
        if (!lineNodes || lineNodes.length === 0) return;
        for (let index = 0; index < lineNodes.length; index += 1) {
          const node = lineNodes[index];
          if (layout.axis === "x") {
            node.x = startX + index * (NODE_W + H_GAP) + NODE_W / 2;
            node.y = startY + NODE_H / 2;
          } else {
            node.x = startX + NODE_W / 2;
            node.y = startY + index * (NODE_H + V_GAP) + NODE_H / 2;
          }
        }
      }

      const nodes = [];
      const loopNodes = [];
      const loopGroups = [];
      const nodesByAggregate = new Map();

      function getNodeModuleCount(node) {
        if (Number.isFinite(node._moduleCount)) return node._moduleCount;
        return node.machineCount || 0;
      }

      function getNodeModuleRate(node) {
        if (Number.isFinite(node._moduleRate)) return node._moduleRate;
        return node.rate || 0;
      }

      function collectSeedLoops(node, depth) {
        const baseRate = getNodeModuleRate(node);
        if (!node.seedLoops || node.seedLoops.length === 0 || baseRate <= EPS) return;
        for (const loop of node.seedLoops) {
          const seedRecipe = loop.seedRecipe;
          const seedItem = itemMap[loop.seedItemId] || {};
          if (!seedRecipe) continue;
          const seedsPerOutput = loop.seedsPerOutput || loop.seedPerOutput || 0;
          if (seedsPerOutput <= EPS) continue;
          const seedEffectiveRate = loop.seedRecipeEffectiveRate || getOutputRate(seedRecipe);
          if (!Number.isFinite(seedEffectiveRate) || seedEffectiveRate <= 0) continue;
          const seedRateDesired = baseRate * seedsPerOutput;
          const seedMachineCount = Math.ceil(seedRateDesired / seedEffectiveRate - EPS);
          if (seedMachineCount <= 0) continue;
          const seedRate = Math.min(seedRateDesired, seedMachineCount * seedEffectiveRate);
          if (seedRate <= EPS) continue;
          const perMachineRate = seedRate / seedMachineCount;

          const groupNodes = [];
          for (let index = 0; index < seedMachineCount; index += 1) {
            const id = `l-${node.id}-${loop.seedItemId}-${index + 1}`;
            const loopNode = {
              id,
              x: 0,
              y: 0,
              depth,
              itemId: loop.seedItemId,
              machineId: loop.seedMachineId,
              rate: perMachineRate,
              icon: seedItem.icon || "",
              isRaw: seedItem.map_only,
              isLoop: true,
              machineIndex: index + 1,
              machineTotal: seedMachineCount
            };
            loopNodes.push(loopNode);
            groupNodes.push(loopNode);
          }
          if (groupNodes.length > 0) {
            loopGroups.push({ parentId: node.id, nodes: groupNodes });
          }
        }
      }

      function createNodes(node) {
        const depth = depthMap.get(node.id) || 0;
        const item = itemMap[node.itemId] || {};
        const moduleCount = getNodeModuleCount(node);
        const moduleRate = getNodeModuleRate(node);
        if (node.machineId && moduleCount > 0 && moduleRate > EPS) {
          const perMachineRate = moduleRate / moduleCount;
          const machineNodes = [];
            for (let index = 0; index < moduleCount; index += 1) {
              const id = `m-${node.id}-${index + 1}`;
              const machineNode = {
                id,
                sourceId: node.id,
                x: 0,
                y: 0,
                depth,
                itemId: node.itemId,
                machineId: node.machineId,
                rate: perMachineRate,
                icon: item.icon || "",
                isRaw: item.map_only,
                isBoundary: Boolean(node.isBoundary),
                machineIndex: index + 1,
                machineTotal: moduleCount
              };
              nodes.push(machineNode);
              machineNodes.push(machineNode);
          }
          nodesByAggregate.set(node.id, machineNodes);
        } else if (moduleRate > EPS) {
          const id = `r-${node.id}`;
            const rawNode = {
              id,
              sourceId: node.id,
              x: 0,
              y: 0,
              depth,
              itemId: node.itemId,
              machineId: null,
              rate: moduleRate,
              icon: item.icon || "",
              isRaw: item.map_only,
              isBoundary: Boolean(node.isBoundary),
              machineIndex: null,
              machineTotal: null
            };
          nodes.push(rawNode);
          nodesByAggregate.set(node.id, [rawNode]);
        } else {
          nodesByAggregate.set(node.id, []);
        }

        collectSeedLoops(node, depth);

        for (const child of node.children || []) {
          createNodes(child);
        }
      }

      for (const root of roots) {
        createNodes(root);
      }

      const rawLinks = new Map();

      function addLink(fromId, toId, weight, inputIndex = 0) {
        if (!fromId || !toId) return;
        const key = `${fromId}|${toId}`;
        const existing = rawLinks.get(key);
        if (existing) {
          existing.weight += weight;
        } else {
          rawLinks.set(key, { weight, inputIndex });
        }
      }

      function connectNodes(node) {
        const parentMachines = nodesByAggregate.get(node.id) || [];
        const parentRate = getNodeModuleRate(node);
        const parentCount = getNodeModuleCount(node);
        const perMachineOutputRate = parentCount > 0 ? parentRate / parentCount : 0;

        const children = node.children || [];
        const inputSpecs = node.inputSpecs || [];

        for (let index = 0; index < children.length; index += 1) {
          const child = children[index];
          const inputSpec = inputSpecs[index];
          if (!inputSpec) continue;
          const childMachines = nodesByAggregate.get(child.id) || [];
          if (childMachines.length === 0 || parentMachines.length === 0) continue;

          const perParentDemand = perMachineOutputRate * (inputSpec.qtyPerOutput || 0);
          if (perParentDemand <= EPS) continue;

          const childRate = getNodeModuleRate(child);
          const childCount = getNodeModuleCount(child);
          const childPerMachineSupply = childCount > 0 ? childRate / childCount : childRate;
          if (childPerMachineSupply <= EPS) continue;

          // 按照生产流程建立连接：根据父子机器数量比例进行连接
          // 如果比例相同，则一对一连接；否则按比例分配
          const totalParentCount = parentMachines.length;
          const totalChildCount = childMachines.length;

          if (totalParentCount === 0 || totalChildCount === 0) continue;

          // 计算每个父机器应该连接多少个子机器
          const childrenPerParent = totalChildCount / totalParentCount;

          for (let pIdx = 0; pIdx < totalParentCount; pIdx += 1) {
            const parentMachine = parentMachines[pIdx];
            const totalDemand = perParentDemand;

            // 计算这个父机器应该连接的子机器范围
            const childStartFloat = pIdx * childrenPerParent;
            const childEndFloat = (pIdx + 1) * childrenPerParent;
            const childStartIdx = Math.floor(childStartFloat);
            const childEndIdx = Math.ceil(childEndFloat);

            // 连接到范围内的子机器
            for (let cIdx = childStartIdx; cIdx < Math.min(childEndIdx, totalChildCount); cIdx += 1) {
              const childMachine = childMachines[cIdx];

              // 计算权重：如果子机器完全在范围内，权重为1；否则按比例分配
              let weight = 1.0;
              if (cIdx === childStartIdx && childStartFloat > childStartIdx) {
                // 第一个子机器可能只占部分
                weight = 1.0 - (childStartFloat - childStartIdx);
              } else if (cIdx === childEndIdx - 1 && childEndFloat < childEndIdx) {
                // 最后一个子机器可能只占部分
                weight = childEndFloat - cIdx;
              }

              // 归一化权重
              const normalizedWeight = (totalDemand * weight) / childrenPerParent;
              addLink(childMachine.id, parentMachine.id, normalizedWeight, index);
            }
          }
        }

        for (const child of children) {
          connectNodes(child);
        }
      }

      for (const root of roots) {
        connectNodes(root);
      }

      const branchGap = horizontal ? V_GAP : H_GAP;

      function computeGridLayout(count) {
        if (count <= 0) {
          return { cols: 0, rows: 0, width: 0, height: 0 };
        }
        if (count === 1) {
          return { cols: 1, rows: 1, width: NODE_W, height: NODE_H };
        }
        const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
        const rows = Math.ceil(count / cols);
        const width = cols * NODE_W + (cols - 1) * H_GAP;
        const height = rows * NODE_H + (rows - 1) * V_GAP;
        return { cols, rows, width, height };
      }

      function computeGroupLayout(count, axis) {
        if (count <= 6) {
          const line = computeLine(count, axis);
          return { ...line, kind: "line" };
        }
        const grid = computeGridLayout(count);
        return { ...grid, axis, count, kind: "grid" };
      }

      function layoutGroupNodes(groupNodes, layout, startX, startY) {
        if (!groupNodes || groupNodes.length === 0 || !layout) return;
        if (layout.kind !== "grid") {
          layoutLine(groupNodes, layout, startX, startY);
          return;
        }
        const cols = Math.max(1, layout.cols || 1);
        for (let index = 0; index < groupNodes.length; index += 1) {
          const node = groupNodes[index];
          const row = Math.floor(index / cols);
          const col = index % cols;
          node.x = startX + col * (NODE_W + H_GAP) + NODE_W / 2;
          node.y = startY + row * (NODE_H + V_GAP) + NODE_H / 2;
        }
      }

      const aggregateLayouts = new Map();
      function getAggregateLayout(aggregateId) {
        if (aggregateLayouts.has(aggregateId)) return aggregateLayouts.get(aggregateId);
        const groupNodes = nodesByAggregate.get(aggregateId) || [];
        const layout = computeGridLayout(groupNodes.length);
        aggregateLayouts.set(aggregateId, layout);
        return layout;
      }

      const displayChildrenCache = new Map();
      function getDisplayChildren(node) {
        if (!node) return [];
        if (displayChildrenCache.has(node.id)) return displayChildrenCache.get(node.id);
        const result = [];
        for (const child of node.children || []) {
          const group = nodesByAggregate.get(child.id) || [];
          if (group.length > 0) {
            result.push(child);
          } else {
            result.push(...getDisplayChildren(child));
          }
        }
        displayChildrenCache.set(node.id, result);
        return result;
      }

      const layoutRoots = [];
      const layoutRootIds = new Set();
      for (const root of roots) {
        const group = nodesByAggregate.get(root.id) || [];
        if (group.length > 0) {
          if (!layoutRootIds.has(root.id)) {
            layoutRoots.push(root);
            layoutRootIds.add(root.id);
          }
        } else {
          for (const child of getDisplayChildren(root)) {
            if (!layoutRootIds.has(child.id)) {
              layoutRoots.push(child);
              layoutRootIds.add(child.id);
            }
          }
        }
      }

      const spanById = new Map();
      const visiting = new Set();

      function measureAggregate(node) {
        if (!node) return 0;
        if (spanById.has(node.id)) return spanById.get(node.id);
        if (visiting.has(node.id)) {
          const layout = getAggregateLayout(node.id);
          return horizontal ? layout.height : layout.width;
        }
        visiting.add(node.id);
        const layout = getAggregateLayout(node.id);
        const children = getDisplayChildren(node);
        let span = horizontal ? layout.height : layout.width;
        if (children.length > 0) {
          let total = 0;
          for (const child of children) {
            total += measureAggregate(child);
          }
          total += branchGap * Math.max(0, children.length - 1);
          span = Math.max(span, total);
        }
        spanById.set(node.id, span);
        visiting.delete(node.id);
        return span;
      }

      const aggregateCenters = new Map();

      function assignAggregate(node, x, y) {
        if (!node) return;
        const layout = getAggregateLayout(node.id);
        aggregateCenters.set(node.id, { x, y });
        const children = getDisplayChildren(node);
        if (children.length === 0) return;
        const totalSpan = spanById.get(node.id) || (horizontal ? layout.height : layout.width);
        let start = (horizontal ? y : x) - totalSpan / 2;
        for (const child of children) {
          const childLayout = getAggregateLayout(child.id);
          const childSpan = spanById.get(child.id) || (horizontal ? childLayout.height : childLayout.width);
          const childCenter = start + childSpan / 2;
          if (horizontal) {
            const gap = layout.width / 2 + childLayout.width / 2 + H_GAP;
            assignAggregate(child, x - gap, childCenter);
          } else {
            const gap = layout.height / 2 + childLayout.height / 2 + V_GAP;
            assignAggregate(child, childCenter, y - gap);
          }
          start += childSpan + branchGap;
        }
      }

      let cursor = 0;
      for (const root of layoutRoots) {
        const span = measureAggregate(root);
        if (horizontal) {
          assignAggregate(root, 0, cursor + span / 2);
        } else {
          assignAggregate(root, cursor + span / 2, 0);
        }
        cursor += span + branchGap;
      }

      for (const [aggregateId, groupNodes] of nodesByAggregate.entries()) {
        if (!groupNodes || groupNodes.length === 0) continue;
        if (aggregateCenters.has(aggregateId)) continue;
        const layout = getAggregateLayout(aggregateId);
        if (horizontal) {
          assignAggregate({ id: aggregateId, children: [] }, 0, cursor + layout.height / 2);
          cursor += layout.height + branchGap;
        } else {
          assignAggregate({ id: aggregateId, children: [] }, cursor + layout.width / 2, 0);
          cursor += layout.width + branchGap;
        }
      }

      for (const [aggregateId, groupNodes] of nodesByAggregate.entries()) {
        if (!groupNodes || groupNodes.length === 0) continue;
        const center = aggregateCenters.get(aggregateId);
        const layout = getAggregateLayout(aggregateId);
        if (!center || layout.cols <= 0 || layout.rows <= 0) continue;
        const startX = center.x - layout.width / 2;
        const startY = center.y - layout.height / 2;
        for (let index = 0; index < groupNodes.length; index += 1) {
          const node = groupNodes[index];
          const row = Math.floor(index / layout.cols);
          const col = index % layout.cols;
          node.x = startX + col * (NODE_W + H_GAP) + NODE_W / 2;
          node.y = startY + row * (NODE_H + V_GAP) + NODE_H / 2;
        }
      }

      const nodeMap = {};
      for (const node of nodes) {
        nodeMap[node.id] = node;
      }

      const aggregateBounds = new Map();
      for (const [aggregateId, groupNodes] of nodesByAggregate.entries()) {
        if (!groupNodes || groupNodes.length === 0) continue;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const node of groupNodes) {
          minX = Math.min(minX, node.x - NODE_W / 2);
          maxX = Math.max(maxX, node.x + NODE_W / 2);
          minY = Math.min(minY, node.y - NODE_H / 2);
          maxY = Math.max(maxY, node.y + NODE_H / 2);
        }
        aggregateBounds.set(aggregateId, {
          minX,
          maxX,
          minY,
          maxY,
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2
        });
      }

      const loopsByParent = new Map();
      for (const group of loopGroups) {
        if (!group.nodes || group.nodes.length === 0) continue;
        if (!loopsByParent.has(group.parentId)) {
          loopsByParent.set(group.parentId, []);
        }
        loopsByParent.get(group.parentId).push(group);
      }

      const loopAxis = horizontal ? "y" : "x";

      for (const [parentId, groups] of loopsByParent.entries()) {
        const base = aggregateBounds.get(parentId);
        if (!base) continue;
        const offsetBase = (groups.length - 1) / 2;
        for (let index = 0; index < groups.length; index += 1) {
          const group = groups[index];
          const layout = computeGroupLayout(group.nodes.length, loopAxis);
          if (layout.count === 0) continue;
          const offset = index - offsetBase;
          if (horizontal) {
            const centerX = base.maxX + LOOP_GAP + layout.width / 2 + offset * (layout.width + LOOP_GAP);
            const centerY = base.centerY;
            layoutGroupNodes(group.nodes, layout, centerX - layout.width / 2, centerY - layout.height / 2);
          } else {
            const centerX = base.maxX + LOOP_GAP + layout.width / 2;
            const centerY = base.maxY + LOOP_GAP + layout.height / 2 + offset * (layout.height + LOOP_GAP);
            layoutGroupNodes(group.nodes, layout, centerX - layout.width / 2, centerY - layout.height / 2);
          }
        }
      }

      const allNodes = nodes.concat(loopNodes);
      if (allNodes.length === 0) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const node of allNodes) {
        minX = Math.min(minX, node.x - NODE_W / 2);
        maxX = Math.max(maxX, node.x + NODE_W / 2);
        minY = Math.min(minY, node.y - NODE_H / 2);
        maxY = Math.max(maxY, node.y + NODE_H / 2);
      }

      const width = Math.max(1, maxX - minX + MARGIN * 2);
      const height = Math.max(1, maxY - minY + MARGIN * 2);
      const shiftX = MARGIN - minX;
      const shiftY = MARGIN - minY;

      for (const node of allNodes) {
        node.x += shiftX;
        node.y += shiftY;
      }

      for (const node of loopNodes) {
        nodeMap[node.id] = node;
      }

      function buildPath(from, to, useHorizontal, offset = 0) {
        if (useHorizontal) {
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + offset;
          const x2 = to.x - NODE_W / 2;
          const y2 = to.y + offset;
          const midX = (x1 + x2) / 2;
          return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
        }
        const x1 = from.x + offset;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x + offset;
        const y2 = to.y - NODE_H / 2;
        const midY = (y1 + y2) / 2;
        return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
      }

      // 定义颜色方案
      const linkColors = [
        '#3b82f6', // 蓝色
        '#10b981', // 绿色
        '#f59e0b', // 橙色
        '#ef4444', // 红色
        '#8b5cf6', // 紫色
        '#ec4899', // 粉色
        '#14b8a6', // 青色
        '#f97316', // 深橙色
      ];

      const links = Array.from(rawLinks.entries()).map(([key, linkData]) => {
        const [fromId, toId] = key.split("|");
        const from = nodeMap[fromId];
        const to = nodeMap[toId];
        if (!from || !to) return null;
        const color = linkColors[linkData.inputIndex % linkColors.length];
        return { path: buildPath(from, to, horizontal), color };
      }).filter(Boolean);

      const loopUseHorizontal = horizontal;
      for (const group of loopGroups) {
        const parentMachines = nodesByAggregate.get(group.parentId) || [];
        if (parentMachines.length === 0 || group.nodes.length === 0) continue;
        const parentAnchor = parentMachines[Math.floor(parentMachines.length / 2)];
        const loopAnchor = group.nodes[Math.floor(group.nodes.length / 2)];
        const forward = buildPath(parentAnchor, loopAnchor, loopUseHorizontal);
        links.push({ path: forward, loop: true });
      }

      return {
        width,
        height,
        nodeSize: { width: NODE_W, height: NODE_H },
        nodes: allNodes,
        links
      };
    }

    function buildGraph(roots, itemMap, machineMap, orientation = "vertical", viewState = {}) {
      return buildSummaryGraph(roots, itemMap, machineMap, orientation);
    }

    async function loadConfig() {
      try {
        const cacheBust = `v=${Date.now()}`;
        const [itemsRes, machinesRes, generatorsRes] = await Promise.all([
          fetch(`/config/items.json?${cacheBust}`),
          fetch(`/config/machines.json?${cacheBust}`),
          fetch(`/config/generators.json?${cacheBust}`)
        ]);

        const itemsData = await itemsRes.json();
        const machinesData = await machinesRes.json();
        const generatorsData = await generatorsRes.json();

        state.items = normalizeItems(itemsData.items || []);
        state.machines = machinesData.machines || [];
        state.generators = generatorsData.generators || [];

        state.supplies = supplyItems.value.map((item) => ({
          itemId: item.id,
          rate: 0,
          icon: item.icon || ""
        }));

        const defaultTarget = craftableItems.value[0];
        state.targets = defaultTarget
          ? [{ uid: targetUid++, itemId: defaultTarget.id, rate: "", maximize: true }]
          : [];

        state.selectedGeneratorId = state.generators[0] ? state.generators[0].id : "";
        updateFuel();

        recalculate();
      } catch (error) {
        state.warnings = [error.message || "Failed to load config."];
      }
    }

    onMounted(() => {
      loadConfig();
      if (typeof window !== "undefined") {
        window.addEventListener("keydown", onWindowKeydown);
      }
    });

    onBeforeUnmount(() => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", onWindowKeydown);
      }
      if (typeof document !== "undefined") {
        document.body.classList.remove("diagram-fullscreen");
      }
    });

    return {
      ...toRefs(state),
      t,
      displayItemName,
      displayMachineName,
      displayGeneratorName,
      formatNumber,
      toggleLang,
      addTarget,
      removeTarget,
      moveTarget,
      recalculate,
      updateFuel,
      generatorFuelOptions,
      craftableItems,
      formatRatePerMinute,
      diagramZoomLabel,
      diagramRef,
      diagramTransform,
      toggleDiagramFullscreen,
      setDiagramOrientation,
      zoomIn,
      zoomOut,
      resetDiagramView,
      onDiagramPointerDown,
      onDiagramPointerMove,
      onDiagramPointerUp,
      onDiagramWheel
    };
  }
});

// Wait for DOM and Vue to be fully ready before mounting
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    app.mount("#app");
  });
} else {
  // DOM already loaded
  app.mount("#app");
}
