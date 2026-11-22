# Config 参数说明与示例

本项目使用三份 JSON 配置文件：`config/items.json`、`config/machines.json`、`config/generators.json`。

## config/items.json

示例：

```json
{
  "version": 1,
  "items": [
    {
      "id": "iron_ingot",
      "name": "Iron Ingot",
      "name_zh": "铁锭",
      "category": "intermediate",
      "map_only": false,
      "icon": "https://placehold.co/64x64/8b5e34/ffffff?text=FE",
      "recipes": [
        {
          "machine": "smelter",
          "time_sec": 2,
          "output_qty": 1,
          "inputs": [
            { "item": "iron_ore", "qty": 1 }
          ]
        }
      ]
    }
  ]
}
```

字段说明：
- `version`: 配置版本号，方便后续升级兼容。
- `items`: 物品列表。
- `id`: 物品唯一标识（英文或数字，建议小写+下划线）。
- `name`: 英文名（界面英文模式使用）。
- `name_zh`: 中文名（界面中文模式使用）。
- `category`: 物品分类，可用 `raw` / `intermediate` / `component` / `product`。
- `map_only`: 是否为地图原料（只作为输入供给，不通过配方制造）。
- `startup_only`: 是否只用于启动的内部物品（例如作物种子）。当为 `true` 时会隐藏供给输入，但仍参与连续生产的配平计算。
- `icon`: 图标 URL。
- `recipes`: 该物品可用配方列表。
- `recipes[].machine`: 生产机器 ID，对应 `machines.json`。
- `recipes[].time_sec`: 配方耗时（秒）。
- `recipes[].output_qty`: 每次配方产出数量。
- `recipes[].inputs`: 输入材料列表。
- `recipes[].inputs[].item`: 输入物品 ID。
- `recipes[].inputs[].qty`: 输入数量。

## config/machines.json

示例：

```json
{
  "version": 1,
  "machines": [
    {
      "id": "assembler",
      "name": "Assembler",
      "name_zh": "组装机",
      "category": "assembly",
      "input_ports": 3,
      "output_ports": 1,
      "power": 6,
      "kit_size": 5,
      "allowed_categories": ["raw", "intermediate", "component"],
      "allowed_items": [],
      "icon": "https://placehold.co/64x64/2563eb/ffffff?text=ASM"
    }
  ]
}
```

字段说明：
- `machines`: 机器列表。
- `id`: 机器唯一标识。
- `name` / `name_zh`: 英文/中文名称。
- `category`: 机器分类（用于展示或备注）。
- `input_ports`: 输入端口数量，用于带宽限制估算。
- `output_ports`: 输出端口数量，用于带宽限制估算（最小 1）。
- `power`: 单台机器功耗。
- `kit_size`: 套件规模（用于套件数量统计）。
- `allowed_categories`: 允许输入的物品分类（为空表示不限制）。
- `allowed_items`: 允许输入的物品 ID 白名单（为空表示不限制）。
- `icon`: 图标 URL。

## config/generators.json

示例：

```json
{
  "version": 1,
  "generators": [
    {
      "id": "burner_generator",
      "name": "Burner Generator",
      "name_zh": "燃烧发电机",
      "fuel_rate_per_sec": 0.2,
      "fuel_power": {
        "coal": 120,
        "biofuel": 90
      },
      "icon": "https://placehold.co/64x64/7c2d12/ffffff?text=GEN"
    }
  ]
}
```

字段说明：
- `generators`: 发电机列表。
- `id`: 发电机唯一标识。
- `name` / `name_zh`: 英文/中文名称。
- `fuel_rate_per_sec`: 单台发电机的燃料消耗速率（单位：个/秒）。
- `fuel_power`: 燃料单位能量映射（键为燃料 ID，值为每单位燃料的能量）。
- `icon`: 图标 URL。

## v2 新增字段（由 `scripts/update_config.py` 生成）

旧字段全部保留，下列字段均为可选，缺省时按旧行为处理。

### items.json

顶层：

- `game_version` / `data_version` / `sources`：配方对应的游戏版本与数据来源。
- `logistics`：`belt_per_sec`（传送带每口每秒）与 `pipe_per_sec`（管道每口每秒）。
- `environments`：气体环境。`gas` 为通入气体散布机的气体，`rate_per_sec` 为一台散布机的最低通气量，`machine` 为散布机 id。
- `disposal`：只有输入、没有产出的处理配方（废水处理机、净水节点）。字段同配方，无 `output_qty`。

物品：

- `phase`：`solid` / `liquid` / `gas`，决定走传送带还是管道。
- `group`：供给列表的分组，`inn` 为 1.6 农场 / 牧场原料，界面默认折叠。

配方：

- `id`：配方唯一 id；同一配方可由多种机器生产时为 `配方@机器`。
- `byproducts`：副产物列表 `[{ "item": "...", "qty": 1 }]`，与主产物同一周期产出。
- `alt`：替代路线（扩容机器、固气 / 液气转化、循环配方）。经典算法忽略，全局最优会自动选用。
- `env`：需要的气体环境 id（对应 `environments[].id`）。
- `locations`：可建造的地区（`tundra` 四号谷地 / `jinlong` 武陵）。

```json
{
  "id": "copper_nugget",
  "machine": "furnance_1",
  "time_sec": 2,
  "output_qty": 1,
  "inputs": [
    { "item": "copper_ore", "qty": 1 },
    { "item": "liquid_water", "qty": 1 }
  ],
  "byproducts": [{ "item": "liquid_sewage", "qty": 1 }],
  "locations": ["jinlong"]
}
```

### machines.json

- `input_ports` / `output_ports`：传送带口数量；`pipe_input_ports` / `pipe_output_ports`：管道口数量。
- `size`：占地 `[宽, 深]`，`kit_size` 为两者乘积。
- `ports`：出入口列表，供「设备摆放」使用。每项 `{ "type": "belt"|"pipe", "io": "in"|"out", "x", "y", "dir": [dx, dy] }`：
  `x`/`y` 是占地网格内的格子（左上角为原点，`y` 朝出料侧增大），`dir` 是物料流动方向。没有 `ports` 的设备按口数量自动排在上下两侧。
- `virtual`：不占地的虚拟设施（据点供货、净水节点），不计入机器汇总。
- `mining`：采集设施（矿机、水泵、气泵），原料由“地图原料供给”填写，不参与计算。
- `environment`：气体散布机。
- `locations`：可建造的地区。

### 更新数据

```bash
python scripts/update_config.py            # 下载最新数据并重新生成 config/
python scripts/update_config.py --offline  # 只使用 .cache/ 中已有的文件
node --test tests/test_solver.cjs          # 校验生成的配置与求解器
```
