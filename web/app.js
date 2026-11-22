// Verify Vue is loaded
if (typeof Vue === 'undefined') {
  throw new Error('Vue is not loaded. Please check your internet connection.');
}

const { createApp, reactive, computed, onMounted, onBeforeUnmount, toRefs, ref } = Vue;

const BELT_CAPACITY = 0.5;
const EPS = 1e-9;
const MAX_VARIANT_ATTEMPTS = 24;
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
    machineLimits: "机器数量限制",
    machineLimitsHint: "留空表示不限制",
    otherMachines: "其他机器",
    usageGuide: "使用指南",
    usageGuideTitle: "使用指南",
    resetDefaults: "重置默认值",
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
    beltInputUtil: "入口带宽利用",
    unlimited: "不限",
    calcMode: "计算方式",
    calcModeLp: "全局最优（线性规划）",
    calcModeClassic: "经典（树形贪心）",
    calcModeHint: "全局最优会混合多条配方、回收副产物并处理废水；经典模式只走默认配方。",
    objective: "次要目标",
    objectiveMachines: "机器最少",
    objectivePower: "耗电最少",
    objectiveRaw: "原料最省",
    targetRate: "/分钟",
    otherSupplies: "农场 / 牧场原料",
    byproducts: "富余副产物",
    byproductsHint: "未被消耗的产物，可入库或另行处理",
    colItem: "物品",
    colMachine: "机器",
    colUsed: "消耗",
    colAvailable: "供给",
    colUtil: "利用率",
    disposalTag: "处理",
    environmentTag: "环境",
    useEnvironments: "允许气体环境配方（需气体散布机）",
    gameVersion: "配方版本"
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
    machineLimits: "Machine Limits",
    machineLimitsHint: "Leave blank for no limit",
    otherMachines: "Other Machines",
    usageGuide: "Usage Guide",
    usageGuideTitle: "Usage Guide",
    resetDefaults: "Reset Defaults",
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
    beltInputUtil: "Input Belt Util",
    unlimited: "Unlimited",
    calcMode: "Solver",
    calcModeLp: "Global optimum (linear programming)",
    calcModeClassic: "Classic (greedy tree)",
    calcModeHint: "Global optimum mixes recipes, reuses byproducts and treats waste; classic only follows default recipes.",
    objective: "Tie-breaker",
    objectiveMachines: "Fewest machines",
    objectivePower: "Lowest power",
    objectiveRaw: "Least raw material",
    targetRate: "/min",
    otherSupplies: "Farm / ranch materials",
    byproducts: "Surplus byproducts",
    byproductsHint: "Produced but not consumed; store or handle separately",
    colItem: "Item",
    colMachine: "Machine",
    colUsed: "Used",
    colAvailable: "Available",
    colUtil: "Util",
    disposalTag: "Disposal",
    environmentTag: "Environment",
    useEnvironments: "Allow gas-environment recipes (needs a gas diffuser)",
    gameVersion: "Data"
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
      machineLimits: {},
      targets: [],
      showGuide: false,
      selectedGeneratorId: "",
      selectedFuelId: "",
      results: null,
      warnings: [],
      diagramFullscreen: false,
      diagramOrientation: "vertical",
      diagramZoom: 1,
      disposal: [],
      logistics: null,
      environments: [],
      useEnvironments: true,
      calcMode: "lp",
      objective: "machines",
      gameVersion: ""
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
    const craftableItems = computed(() => state.items.filter((item) => !item.map_only && item.recipes.length > 0));
    // The classic tree solver only follows default recipes; alternative routes are left to the LP solver.
    const classicItemsById = computed(() => {
      const map = {};
      for (const item of state.items) {
        const defaults = item.recipes.filter((recipe) => !recipe.alt);
        // It does not model gas diffusers either, so environment recipes are a last resort.
        const plain = defaults.filter((recipe) => !recipe.env);
        map[item.id] = { ...item, recipes: plain.length ? plain : defaults };
      }
      return map;
    });
    const mainSupplies = computed(() => state.supplies.filter((supply) => !supply.group));
    const extraSupplies = computed(() => state.supplies.filter((supply) => supply.group));
    const primaryMachineLimits = computed(() => state.machines.filter((machine) => machine.id === "xiranite_oven_1"));
    const secondaryMachineLimits = computed(() => state.machines.filter((machine) => machine.id !== "xiranite_oven_1" && !machine.mining && !machine.virtual && !machine.environment));

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

    function displayEnvName(envId) {
      const env = state.environments.find((entry) => entry.id === envId);
      if (!env) return envId;
      return state.lang === "zh" ? env.name_zh || env.name || envId : env.name || env.name_zh || envId;
    }

    function resetMachineLimits() {
      for (const machine of state.machines) {
        state.machineLimits[machine.id] = machine.id === "xiranite_oven_1" ? 1 : "";
      }
    }

    function openGuide() {
      state.showGuide = true;
    }

    function closeGuide() {
      state.showGuide = false;
    }

    function onGuideBackdrop(event) {
      if (event.target === event.currentTarget) {
        closeGuide();
      }
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
      if (!state.results) return;
      if (state.results.mode === "lp") {
        state.results.graph = buildFlowGraph(
          state.results.machineRuns,
          state.results.flowRawUsage,
          itemsById.value,
          state.diagramOrientation
        );
        if (options.resetView) resetDiagramView();
        return;
      }
      if (!state.results.roots) return;
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
      if (state.calcMode === "lp" && typeof FactorySolver !== "undefined") {
        recalculateLp();
      } else {
        recalculateClassic();
      }
    }

    function computePower(totalMachinePower) {
      const basePower = Number.isFinite(parseFloat(state.basePower)) ? parseFloat(state.basePower) : 0;
      const totalPower = totalMachinePower + basePower;
      let powerPerGenerator = 0;
      let generatorCount = 0;
      let fuelRate = 0;
      const gen = generatorsById.value[state.selectedGeneratorId];
      if (gen && gen.fuel_power && state.selectedFuelId) {
        powerPerGenerator = gen.fuel_power[state.selectedFuelId] || 0;
        if (powerPerGenerator > 0) {
          generatorCount = Math.ceil(totalPower / powerPerGenerator);
          fuelRate = generatorCount * (gen.fuel_rate_per_sec || 0);
        }
      }
      return { basePower, totalPower, powerPerGenerator, generatorCount, fuelRate };
    }

    function buildRawUsageList(rawUsage) {
      const list = [];
      for (const supply of state.supplies) {
        const used = rawUsage[supply.itemId] || 0;
        const availablePerMinute = parseFloat(supply.rate);
        const hasSupply = Number.isFinite(availablePerMinute) && availablePerMinute > EPS;
        if (used <= EPS && !hasSupply) continue;
        const usedPerMinute = used * 60;
        list.push({
          itemId: supply.itemId,
          used: usedPerMinute,
          available: hasSupply ? availablePerMinute : 0,
          utilization: hasSupply ? usedPerMinute / availablePerMinute : 0,
          unlimited: !hasSupply
        });
      }
      return list;
    }

    function warningText(warning) {
      if (typeof warning === "string") return warning;
      const name = warning.itemId ? displayItemName(warning.itemId) : "";
      const perMin = (value) => formatRatePerMinute(value);
      const zh = state.lang === "zh";
      switch (warning.code) {
        case "unbounded":
          return zh
            ? `「${name}」没有任何原料或机器限制，按 1 台机器的产能 (${perMin(warning.rate)} /min) 计算。`
            : `"${name}" is not limited by any supply or machine; using one machine's output (${perMin(warning.rate)} /min).`;
        case "target_short":
          return zh
            ? `「${name}」只能达到 ${perMin(warning.rate)} /min（目标 ${perMin(warning.wanted)} /min），受原料或机器限制。`
            : `"${name}" reaches only ${perMin(warning.rate)} /min of ${perMin(warning.wanted)} /min (limited by supply or machines).`;
        case "target_zero":
          return zh ? `「${name}」在当前限制下无法生产。` : `"${name}" cannot be produced under the current limits.`;
        case "fluid_surplus":
          return zh
            ? `流体「${name}」有 ${perMin(warning.rate)} /min 无处排放，会堵塞管道，请放开废水处理或相关原料限制。`
            : `Fluid "${name}" has ${perMin(warning.rate)} /min with nowhere to go and will block pipes.`;
        case "limit_rounded":
          return zh
            ? "机器数量上限下的配方分配为近似取整，结果可能略低于理论最优。"
            : "Machine-limit allocation was rounded heuristically; the result may be slightly below the optimum.";
        case "unlimited_raw":
          return zh
            ? `原料「${name}」供给为 0，按不限处理，估算消耗 ${formatNumber(warning.used)} /min。`
            : `Raw "${name}" supply is 0 and treated as unlimited. Estimated usage: ${formatNumber(warning.used)} /min.`;
        case "env_used": {
          const envName = displayEnvName(warning.envId);
          return zh
            ? `方案使用了「${envName}」配方：相关的 ${warning.machines} 台机器需完全位于气体散布机范围内。已计入 1 台散布机的最低通气量（${name} ${perMin(warning.rate)} /min），一台罩不住时每多一台再加同样的量。`
            : `The plan uses "${envName}" recipes: ${warning.machines} machine(s) must sit fully inside a gas diffuser's range. One diffuser's minimum feed (${name} ${perMin(warning.rate)} /min) is included; add the same again for every extra diffuser.`;
        }
        case "unknown_item":
          return zh ? `未知物品 ${warning.itemId}` : `Unknown item ${warning.itemId}`;
        default:
          return warning.code || "";
      }
    }

    /** Layered flow graph for LP results: raw supplies first, each recipe one node, back edges dashed. */
    function buildFlowGraph(runs, rawUsage, itemMap, orientation = "vertical") {
      if (!runs || runs.length === 0) return null;
      const NODE_W = 220;
      const NODE_H = 72;
      const GAP = 36;
      const LAYER_GAP = 96;
      const MARGIN = 40;
      const horizontal = orientation === "horizontal";

      const nodes = [];
      const producers = {};
      const consumers = {};
      const addTo = (map, key, value) => (map[key] = map[key] || []).push(value);
      for (const [itemId, used] of Object.entries(rawUsage)) {
        if (used <= EPS) continue;
        const node = { id: `raw:${itemId}`, itemId, rate: used, isRaw: true, preds: [], succs: [] };
        nodes.push(node);
        addTo(producers, itemId, node);
      }
      for (const run of runs) {
        const node = {
          id: `run:${run.recipeId}`,
          itemId: run.itemId,
          rate: run.rate,
          machineId: run.machineId,
          machineCount: run.virtual ? 0 : run.machineCount,
          isDisposal: run.disposal || !!run.environment,
          preds: [],
          succs: []
        };
        nodes.push(node);
        for (const io of run.outputs) addTo(producers, io.item, node);
        for (const io of run.inputs) addTo(consumers, io.item, node);
      }

      const edges = [];
      for (const itemId of Object.keys(consumers)) {
        for (const from of producers[itemId] || []) {
          for (const to of consumers[itemId]) {
            if (from === to) continue;
            const edge = { from, to, itemId, back: false };
            edges.push(edge);
            from.succs.push(edge);
          }
        }
      }

      // Depth-first search marks edges that close a cycle; they are ignored for layering.
      const visitState = new Map();
      const roots = nodes.filter((node) => node.isRaw).concat(nodes.filter((node) => !node.isRaw));
      for (const root of roots) {
        if (visitState.has(root)) continue;
        const stack = [[root, 0]];
        visitState.set(root, 1);
        while (stack.length) {
          const frame = stack[stack.length - 1];
          const edge = frame[0].succs[frame[1]++];
          if (!edge) {
            visitState.set(frame[0], 2);
            stack.pop();
            continue;
          }
          const seen = visitState.get(edge.to);
          if (seen === 1) {
            edge.back = true;
          } else if (!seen) {
            visitState.set(edge.to, 1);
            stack.push([edge.to, 0]);
          }
        }
      }
      for (const edge of edges) {
        if (!edge.back) edge.to.preds.push(edge);
      }
      const depthOf = (node) => {
        if (node.depth !== undefined) return node.depth;
        node.depth = 0;
        let depth = node.isRaw ? 0 : 1;
        for (const edge of node.preds) depth = Math.max(depth, depthOf(edge.from) + 1);
        node.depth = depth;
        return depth;
      };
      const layers = [];
      for (const node of nodes) {
        const depth = depthOf(node);
        (layers[depth] = layers[depth] || []).push(node);
      }

      const compact = layers.filter(Boolean);
      let maxSpan = 0;
      const cross = horizontal ? NODE_H : NODE_W;
      const along = horizontal ? NODE_W : NODE_H;
      compact.forEach((layer, index) => {
        if (index > 0) {
          for (const node of layer) {
            const anchors = node.preds.filter((edge) => edge.from.pos !== undefined).map((edge) => edge.from.pos);
            node.order = anchors.length ? anchors.reduce((a, b) => a + b, 0) / anchors.length : 0;
          }
          layer.sort((a, b) => a.order - b.order);
        }
        const span = layer.length * cross + (layer.length - 1) * GAP;
        maxSpan = Math.max(maxSpan, span);
        layer.forEach((node, i) => {
          node.pos = i * (cross + GAP) - span / 2;
          node.layer = index;
        });
      });

      const nodeMap = {};
      const graphNodes = nodes.map((node) => {
        const c = node.pos + maxSpan / 2 + cross / 2 + MARGIN;
        const a = node.layer * (along + LAYER_GAP) + along / 2 + MARGIN;
        const item = itemMap[node.itemId] || {};
        const out = {
          id: node.id,
          x: horizontal ? a : c,
          y: horizontal ? c : a,
          itemId: node.itemId,
          machineId: node.machineId,
          machineCount: node.machineCount,
          rate: node.rate,
          icon: item.icon || "",
          isRaw: !!node.isRaw,
          isDisposal: !!node.isDisposal
        };
        nodeMap[node.id] = out;
        return out;
      });

      const phaseColor = { liquid: "#38bdf8", gas: "#a78bfa" };
      const links = edges.map((edge) => {
        const from = nodeMap[edge.from.id];
        const to = nodeMap[edge.to.id];
        const color = phaseColor[(itemMap[edge.itemId] || {}).phase] || "";
        if (edge.back) {
          if (horizontal) {
            const y1 = from.y + NODE_H / 2;
            const y2 = to.y + NODE_H / 2;
            const bend = Math.max(y1, y2) + 60;
            return { path: `M ${from.x} ${y1} C ${from.x} ${bend} ${to.x} ${bend} ${to.x} ${y2}`, loop: true, color };
          }
          const x1 = from.x + NODE_W / 2;
          const x2 = to.x + NODE_W / 2;
          const bend = Math.max(x1, x2) + 80;
          return { path: `M ${x1} ${from.y} C ${bend} ${from.y} ${bend} ${to.y} ${x2} ${to.y}`, loop: true, color };
        }
        if (horizontal) {
          const x1 = from.x + NODE_W / 2;
          const x2 = to.x - NODE_W / 2;
          const mid = (x1 + x2) / 2;
          return { path: `M ${x1} ${from.y} C ${mid} ${from.y} ${mid} ${to.y} ${x2} ${to.y}`, color };
        }
        const y1 = from.y + NODE_H / 2;
        const y2 = to.y - NODE_H / 2;
        const mid = (y1 + y2) / 2;
        return { path: `M ${from.x} ${y1} C ${from.x} ${mid} ${to.x} ${mid} ${to.x} ${y2}`, color };
      });

      const crossSize = maxSpan + MARGIN * 2 + 100;
      const alongSize = compact.length * along + (compact.length - 1) * LAYER_GAP + MARGIN * 2 + (horizontal ? 0 : 0);
      return {
        width: horizontal ? alongSize : crossSize,
        height: horizontal ? crossSize : alongSize,
        nodeSize: { width: NODE_W, height: NODE_H },
        nodes: graphNodes,
        links
      };
    }

    function recalculateLp() {
      const itemMap = itemsById.value;
      const machineMap = machinesById.value;
      const logistics = state.logistics || {};
      const belt = logistics.belt_per_sec || BELT_CAPACITY;
      const pipe = logistics.pipe_per_sec || 2;

      const supplies = {};
      for (const supply of state.supplies) {
        const perMinute = parseFloat(supply.rate);
        supplies[supply.itemId] = Number.isFinite(perMinute) && perMinute > EPS ? perMinute / 60 : Infinity;
      }
      const machineLimits = {};
      for (const machine of state.machines) {
        const limit = parseFloat(state.machineLimits[machine.id]);
        if (Number.isFinite(limit) && limit >= 0 && !machine.virtual) machineLimits[machine.id] = limit;
      }
      const targets = state.targets
        .filter((target) => target.itemId)
        .map((target) => {
          const perMinute = parseFloat(target.rate);
          const fixed = !target.maximize && Number.isFinite(perMinute) && perMinute > 0;
          return { itemId: target.itemId, rate: fixed ? perMinute / 60 : null, maximize: !fixed };
        });

      const solved = FactorySolver.solve({
        items: state.items,
        disposal: state.disposal,
        machines: state.machines,
        logistics: state.logistics,
        environments: state.environments,
        disabledEnvs: state.useEnvironments ? [] : state.environments.map((env) => env.id),
        supplies,
        machineLimits,
        targets,
        objective: state.objective
      });

      const isFluid = (itemId) => {
        const phase = (itemMap[itemId] || {}).phase;
        return phase === "liquid" || phase === "gas";
      };
      const portUtil = (ios, machine, machineCount, beltPorts, pipePorts) => {
        let solid = 0;
        let fluid = 0;
        for (const io of ios) {
          if (isFluid(io.item)) fluid += io.rate;
          else solid += io.rate;
        }
        const count = Math.max(1, machineCount);
        let util = 0;
        if (beltPorts > 0) util = Math.max(util, solid / count / (beltPorts * belt));
        if (pipePorts > 0) util = Math.max(util, fluid / count / (pipePorts * pipe));
        return util;
      };

      const machineTotals = {};
      const machineRuns = solved.runs.map((run) => {
        const machine = machineMap[run.machineId] || {};
        const virtual = !!machine.virtual;
        if (!virtual) {
          const entry = machineTotals[run.machineId] || {
            machineId: run.machineId,
            count: 0,
            powerPerMachine: machine.power || 0,
            kitSize: machine.kit_size || 1
          };
          entry.count += run.machineCount;
          machineTotals[run.machineId] = entry;
        }
        return {
          ...run,
          virtual,
          machineCount: virtual ? 0 : run.machineCount,
          outputUtil: virtual ? 0 : portUtil(run.outputs, machine, run.machineCount, machine.output_ports || 0, machine.pipe_output_ports || 0),
          inputUtil: virtual ? 0 : portUtil(run.inputs, machine, run.machineCount, machine.input_ports || 0, machine.pipe_input_ports || 0)
        };
      });
      const machineTotalsList = Object.values(machineTotals).map((entry) => ({
        ...entry,
        kitCount: entry.kitSize > 0 ? Math.ceil(entry.count / entry.kitSize) : 0,
        totalPower: entry.count * entry.powerPerMachine
      }));

      const power = computePower(machineTotalsList.reduce((sum, entry) => sum + entry.totalPower, 0));
      const rawUsageList = buildRawUsageList(solved.rawUsage);
      const warnings = solved.warnings.slice();
      for (const entry of rawUsageList) {
        if (entry.unlimited && entry.used > EPS) warnings.push({ code: "unlimited_raw", itemId: entry.itemId, used: entry.used });
      }

      state.results = {
        mode: "lp",
        ...power,
        outputs: solved.outputs,
        rawUsage: rawUsageList,
        byproducts: solved.surplus,
        machineTotals: machineTotalsList,
        machineRuns,
        flowRawUsage: solved.rawUsage,
        graph: buildFlowGraph(machineRuns, solved.rawUsage, itemMap, state.diagramOrientation)
      };
      state.warnings = warnings;
      resetDiagramView();
    }

    function recalculateClassic() {
      const itemMap = classicItemsById.value;
      const machineMap = machinesById.value;

      const warnings = [];
      const availableRaw = {};
      for (const supply of state.supplies) {
        const value = parseFloat(supply.rate);
        const perMinute = Number.isFinite(value) ? value : 0;
        if (perMinute <= EPS) {
          availableRaw[supply.itemId] = Infinity;
        } else {
          availableRaw[supply.itemId] = perMinute / 60;
        }
      }
      const availableMachines = {};
      for (const machine of state.machines) {
        const rawLimit = state.machineLimits[machine.id];
        const parsedLimit = parseFloat(rawLimit);
        if (Number.isFinite(parsedLimit) && parsedLimit >= 0) {
          availableMachines[machine.id] = Math.floor(parsedLimit);
        }
      }

      const variantCache = {};
      const machineLimitWarnings = new Set();

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
            machineNodes: new Map(),
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
              // Tree nodes per machine: every node needs at least one whole machine.
              const machineNodes = new Map();
              const addNode = (machineId, count = 1) =>
                machineNodes.set(machineId, (machineNodes.get(machineId) || 0) + count);
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
                for (const [machineId, count] of choice.variant.machineNodes) addNode(machineId, count);

                depth = Math.max(depth, choice.variant.depth);
              }

              if (machine) {
                const machinePerUnit = 1 / effectiveRate;
                machineUsage.set(machine.id, (machineUsage.get(machine.id) || 0) + machinePerUnit);
                addNode(machine.id);
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
                addNode(loop.seedMachineId);
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
                machineNodes,
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

      function isBetterPick(a, b) {
        if (Math.abs(a.maxRate - b.maxRate) > EPS) return a.maxRate > b.maxRate;
        if (Math.abs(a.variant.machineTotal - b.variant.machineTotal) > EPS) {
          return a.variant.machineTotal < b.variant.machineTotal;
        }
        return a.variant.depth < b.variant.depth;
      }

      /** Variants ordered best first, by the rate they allow before machine rounding. */
      function rankVariants(itemId, available) {
        const picks = [];
        for (const variant of expandVariants(itemId)) {
          let maxRate = Infinity;
          for (const [rawId, qty] of variant.rawReq) {
            if (qty <= 0) continue;
            const supply = available[rawId] || 0;
            maxRate = Math.min(maxRate, supply / qty);
          }
          for (const [machineId, qty] of variant.machineUsage) {
            if (qty <= 0) continue;
            const limit = availableMachines[machineId];
            if (Number.isFinite(limit)) {
              maxRate = Math.min(maxRate, limit / qty);
            }
          }
          for (const [machineId, nodes] of variant.machineNodes) {
            const limit = availableMachines[machineId];
            if (Number.isFinite(limit) && nodes > limit) maxRate = 0;
          }
          if (!Number.isFinite(maxRate)) maxRate = 0;
          picks.push({ variant, maxRate });
        }
        // Insertion keeps the first of equal picks ahead, as the single-pick scan did.
        const ranked = [];
        for (const pick of picks) {
          let index = ranked.length;
          while (index > 0 && isBetterPick(pick, ranked[index - 1])) index--;
          ranked.splice(index, 0, pick);
        }
        return ranked;
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

      function mergeMachineUsage(target, source) {
        for (const [machineId, qty] of source) {
          target.set(machineId, (target.get(machineId) || 0) + qty);
        }
      }

      function rollbackMachineUsage(available, usage) {
        for (const [machineId, qty] of usage) {
          if (!Number.isFinite(available[machineId])) continue;
          available[machineId] += qty;
        }
      }

      function warnMachineLimit(itemId, machineId) {
        const key = `${itemId}|${machineId}`;
        if (machineLimitWarnings.has(key)) return;
        machineLimitWarnings.add(key);
        addWarning(`Machine "${machineId}" limit reached while producing "${itemId}".`);
      }

      function buildTreeDiscrete(itemId, variant, requestedRate, available, allowPartial) {
        const item = itemMap[itemId];
        if (!item) {
          addWarning(`Unknown item "${itemId}".`);
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
            actualRate: 0,
            rawUsage: new Map(),
            machineUsage: new Map()
          };
        }

        if (requestedRate <= EPS) {
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
            actualRate: 0,
            rawUsage: new Map(),
            machineUsage: new Map()
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
            rawUsage,
            machineUsage: new Map()
          };
        }

        if (!variant || !variant.recipe) {
          addWarning(`Item "${itemId}" has no recipe.`);
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
            actualRate: 0,
            rawUsage: new Map(),
            machineUsage: new Map()
          };
        }

        const effectiveRate = variant.effectiveOutputRate;
        if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) {
          addWarning(`Invalid output rate for "${itemId}".`);
          return {
            node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
            actualRate: 0,
            rawUsage: new Map(),
            machineUsage: new Map()
          };
        }

        let targetRate = requestedRate;
        let guard = 0;

        while (guard < 20) {
          guard += 1;
          const machineId = variant.recipe.machine;
          const machineLimit = availableMachines[machineId];
          if (Number.isFinite(machineLimit)) {
            const maxRateByMachine = machineLimit * effectiveRate;
            if (targetRate > maxRateByMachine + EPS) {
              warnMachineLimit(itemId, machineId);
              targetRate = maxRateByMachine;
              if (targetRate <= EPS) {
                return {
                  node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
                  actualRate: 0,
                  rawUsage: new Map(),
                  machineUsage: new Map()
                };
              }
              continue;
            }
          }
          const machineCount = allowPartial
            ? Math.ceil(targetRate / effectiveRate - EPS)
            : Math.floor(targetRate / effectiveRate + EPS);
          if (machineCount <= 0) {
            return {
              node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
              actualRate: 0,
              rawUsage: new Map(),
              machineUsage: new Map()
            };
          }
          if (Number.isFinite(machineLimit) && machineCount > machineLimit) {
            warnMachineLimit(itemId, machineId);
            targetRate = machineLimit * effectiveRate;
            if (targetRate <= EPS) {
              return {
                node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
                actualRate: 0,
                rawUsage: new Map(),
                machineUsage: new Map()
              };
            }
            continue;
          }

          const capacityRate = machineCount * effectiveRate;
          const actualRate = allowPartial ? Math.min(targetRate, capacityRate) : capacityRate;
          let seedLimited = false;
          for (const loop of variant.seedLoops || []) {
            const seedLimit = availableMachines[loop.seedMachineId];
            if (!Number.isFinite(seedLimit)) continue;
            const seedsPerOutput = loop.seedsPerOutput || 0;
            const seedEffectiveRate = loop.seedRecipeEffectiveRate || getOutputRate(loop.seedRecipe);
            if (seedsPerOutput <= 0 || seedEffectiveRate <= 0) continue;
            const maxRateBySeed = (seedLimit * seedEffectiveRate) / seedsPerOutput;
            if (actualRate > maxRateBySeed + EPS) {
              warnMachineLimit(itemId, loop.seedMachineId);
              targetRate = Math.min(targetRate, maxRateBySeed);
              seedLimited = true;
            }
          }
          if (seedLimited) {
            if (targetRate <= EPS) {
              return {
                node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
                actualRate: 0,
                rawUsage: new Map(),
                machineUsage: new Map()
              };
            }
            continue;
          }
          const children = [];
          const rawUsage = new Map();
          const machineUsage = new Map();
          let minSupportedRate = actualRate;

          if (Number.isFinite(machineLimit)) {
            availableMachines[machineId] = machineLimit - machineCount;
            machineUsage.set(machineId, (machineUsage.get(machineId) || 0) + machineCount);
          }

          for (const loop of variant.seedLoops || []) {
            const seedLimit = availableMachines[loop.seedMachineId];
            if (!Number.isFinite(seedLimit)) continue;
            const seedRateDesired = actualRate * (loop.seedsPerOutput || 0);
            const seedEffectiveRate = loop.seedRecipeEffectiveRate || getOutputRate(loop.seedRecipe);
            const seedMachineCount = seedEffectiveRate > 0
              ? Math.ceil(seedRateDesired / seedEffectiveRate - EPS)
              : 0;
            if (seedMachineCount <= 0) continue;
            if (seedMachineCount > seedLimit + EPS) {
              warnMachineLimit(itemId, loop.seedMachineId);
              rollbackMachineUsage(availableMachines, machineUsage);
              targetRate = (seedLimit * seedEffectiveRate) / (loop.seedsPerOutput || 1);
              seedLimited = true;
              break;
            }
            availableMachines[loop.seedMachineId] = seedLimit - seedMachineCount;
            machineUsage.set(
              loop.seedMachineId,
              (machineUsage.get(loop.seedMachineId) || 0) + seedMachineCount
            );
          }
          if (seedLimited) {
            if (targetRate <= EPS) {
              return {
                node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
                actualRate: 0,
                rawUsage: new Map(),
                machineUsage: new Map()
              };
            }
            continue;
          }

          for (const input of variant.inputs || []) {
            const reqRate = actualRate * input.qtyPerOutput;
            const child = buildTreeDiscrete(input.itemId, input.variant, reqRate, available, true);
            children.push(child.node);
            mergeRawUsage(rawUsage, child.rawUsage);
            mergeMachineUsage(machineUsage, child.machineUsage);
            if (reqRate > EPS) {
              const supportedRate = child.actualRate / input.qtyPerOutput;
              minSupportedRate = Math.min(minSupportedRate, supportedRate);
            }
          }

          if (minSupportedRate < actualRate - EPS) {
            rollbackRawUsage(available, rawUsage);
            rollbackMachineUsage(availableMachines, machineUsage);
            if (minSupportedRate <= EPS) {
              return {
                node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
                actualRate: 0,
                rawUsage: new Map(),
                machineUsage: new Map()
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
            rawUsage,
            machineUsage
          };
        }

        addWarning(`Failed to resolve discrete machines for "${itemId}".`);
        return {
          node: { id: `n${nodeUid++}`, itemId, rate: 0, machineId: null, machineCount: 0, children: [] },
          actualRate: 0,
          rawUsage: new Map(),
          machineUsage: new Map()
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

        const picks = rankVariants(itemId, availableRaw);
        if (!picks.length) {
          addWarning(`No valid recipe path for "${itemId}".`);
          continue;
        }

        const desired = target.maximize ? NaN : parseFloat(target.rate) / 60;
        const desiredRate = Number.isFinite(desired) ? desired : null;

        // The ranking ignores machine rounding, so the top pick can still build nothing.
        // Fall back to the next picks before giving up on the target.
        const before = {
          raw: { ...availableRaw },
          machines: { ...availableMachines },
          warnings: warnings.length,
          limitWarnings: new Set(machineLimitWarnings)
        };
        const restore = () => {
          Object.assign(availableRaw, before.raw);
          Object.assign(availableMachines, before.machines);
          warnings.length = before.warnings;
          machineLimitWarnings.clear();
          before.limitWarnings.forEach((entry) => machineLimitWarnings.add(entry));
        };
        const wantsOutput = target.maximize || desiredRate === null || desiredRate > EPS;
        const attempts = wantsOutput ? Math.min(picks.length, MAX_VARIANT_ATTEMPTS) : 1;
        let built = null;
        for (let attempt = 0; attempt < attempts; attempt++) {
          if (attempt > 0) restore();
          built = buildTarget(itemId, picks[attempt], desiredRate, target.maximize);
          if (built.actualRate > EPS) break;
        }
        if (built.actualRate <= EPS && attempts > 1) {
          restore();
          built = buildTarget(itemId, picks[0], desiredRate, target.maximize);
        }

        outputs.push({ itemId, rate: built.actualRate });
        roots.push(built.node);
        for (const [rawId, qty] of built.rawUsage) {
          rawUsage[rawId] = (rawUsage[rawId] || 0) + qty;
        }
      }

      function buildTarget(itemId, pick, desiredRate, maximize) {
        let maxRate = pick.maxRate;
        if (!Number.isFinite(maxRate)) {
          maxRate = Infinity;
        } else {
          maxRate = Math.max(0, maxRate);
        }
        const fallbackRate = pick.variant.effectiveOutputRate;
        const useFallback = (!Number.isFinite(maxRate) || maxRate === Infinity)
          && (maximize || desiredRate === null);
        const requestedRate = useFallback
          ? fallbackRate
          : (maximize || desiredRate === null ? maxRate : Math.min(desiredRate, maxRate));

        if (useFallback) {
          addWarning(`Target "${itemId}" has no raw limits; using 1 machine output rate (${formatNumber(fallbackRate)} /s).`);
        } else if (desiredRate !== null && desiredRate > maxRate + EPS) {
          addWarning(`Target "${itemId}" capped at ${formatNumber(maxRate)} /s by resources.`);
        }

        const result = buildTreeDiscrete(itemId, pick.variant, requestedRate, availableRaw, false);
        const actualRate = result.actualRate;

        if (desiredRate !== null && actualRate < desiredRate - EPS) {
          addWarning(`Target "${itemId}" capped at ${formatNumber(actualRate)} /s after rounding.`);
        }
        return result;
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
        const hasSupply = Number.isFinite(availablePerMinute) && availablePerMinute > EPS;
        const availPerMinute = hasSupply ? availablePerMinute : 0;
        const usedPerMinute = used * 60;
        const utilization = hasSupply && availPerMinute > 0 ? usedPerMinute / availPerMinute : 0;
        rawUsageList.push({
          itemId: supply.itemId,
          used: usedPerMinute,
          available: availPerMinute,
          utilization,
          unlimited: !hasSupply
        });
      }

      for (const entry of rawUsageList) {
        if (!entry.unlimited) continue;
        if (entry.used <= EPS) continue;
        addWarning(`Raw "${entry.itemId}" supply is 0, treated as unlimited. Estimated usage: ${formatNumber(entry.used)} /min.`);
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
        state.disposal = itemsData.disposal || [];
        state.logistics = itemsData.logistics || null;
        state.environments = itemsData.environments || [];
        state.gameVersion = itemsData.game_version || "";
        state.machines = machinesData.machines || [];
        state.generators = generatorsData.generators || [];

        state.supplies = supplyItems.value.map((item) => ({
          itemId: item.id,
          rate: 0,
          group: item.group || "",
          icon: item.icon || ""
        }));

        state.machineLimits = {};
        resetMachineLimits();

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
      resetMachineLimits,
      addTarget,
      removeTarget,
      moveTarget,
      recalculate,
      warningText,
      displayEnvName,
      updateFuel,
      generatorFuelOptions,
      craftableItems,
      mainSupplies,
      extraSupplies,
      primaryMachineLimits,
      secondaryMachineLimits,
      formatRatePerMinute,
      diagramZoomLabel,
      diagramRef,
      diagramTransform,
      openGuide,
      closeGuide,
      onGuideBackdrop,
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
