const { createApp, reactive, computed, onMounted, toRefs, ref } = Vue;

const BELT_CAPACITY = 0.5;
const EPS = 1e-9;

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
    diagramVertical: "竖屏",
    diagramHorizontal: "横屏",
    diagramFullscreen: "全屏",
    diagramExitFullscreen: "退出全屏",
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
    diagramVertical: "Vertical",
    diagramHorizontal: "Horizontal",
    diagramFullscreen: "Fullscreen",
    diagramExitFullscreen: "Exit Fullscreen",
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

createApp({
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
      diagramOrientation: "vertical"
    });

    let targetUid = 1;
    let nodeUid = 1;

    const diagramRef = ref(null);
    const diagramDrag = {
      active: false,
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      scrollTop: 0
    };

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

    function toggleLang() {
      state.lang = state.lang === "zh" ? "en" : "zh";
    }

    function toggleDiagramFullscreen() {
      state.diagramFullscreen = !state.diagramFullscreen;
      if (typeof document !== "undefined") {
        document.body.classList.toggle("diagram-fullscreen", state.diagramFullscreen);
      }
    }

    function setDiagramOrientation(orientation) {
      state.diagramOrientation = orientation;
      if (state.results) {
        recalculate();
      }
    }

    function onDiagramPointerDown(event) {
      const container = diagramRef.value;
      if (!container) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      diagramDrag.active = true;
      diagramDrag.startX = event.clientX;
      diagramDrag.startY = event.clientY;
      diagramDrag.scrollLeft = container.scrollLeft;
      diagramDrag.scrollTop = container.scrollTop;
      container.classList.add("dragging");
      if (container.setPointerCapture) {
        container.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    }

    function onDiagramPointerMove(event) {
      if (!diagramDrag.active) return;
      const container = diagramRef.value;
      if (!container) return;
      const dx = event.clientX - diagramDrag.startX;
      const dy = event.clientY - diagramDrag.startY;
      container.scrollLeft = diagramDrag.scrollLeft - dx;
      container.scrollTop = diagramDrag.scrollTop - dy;
    }

    function onDiagramPointerUp(event) {
      if (!diagramDrag.active) return;
      const container = diagramRef.value;
      if (container) {
        container.classList.remove("dragging");
        if (container.releasePointerCapture) {
          container.releasePointerCapture(event.pointerId);
        }
      }
      diagramDrag.active = false;
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

      const graph = buildGraph(roots, itemMap, machineMap, state.diagramOrientation);

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
        graph
      };

      state.warnings = warnings;
    }

    function buildGraph(roots, itemMap, machineMap, orientation = "vertical") {
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
            assign(child, x + depthSpanSize, childCenter);
          } else {
            assign(child, childCenter, y + depthSpanSize);
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
            rawLinks.push({ from: node.id, to: child.id });
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
      diagramRef,
      toggleDiagramFullscreen,
      setDiagramOrientation,
      onDiagramPointerDown,
      onDiagramPointerMove,
      onDiagramPointerUp
    };
  }
}).mount("#app");
