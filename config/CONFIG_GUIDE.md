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
