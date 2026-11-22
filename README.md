# Endfield Infrastructure Calculator | 终末地基建量化计算器

[English](#english) | [中文](#中文)

---

## English

### 📖 Table of Contents
- [Overview](#overview)
- [Quick Start](#quick-start)
- [Docker Deployment](#docker-deployment)
- [Usage Guide](#usage-guide)
- [Diagram Controls](#diagram-controls)
- [Project Structure](#project-structure)
- [Calculation Rules](#calculation-rules)
- [Configuration Schema](#configuration-schema)
- [Contributing](#contributing)

### Overview

Compute production chains from map-only supplies, prioritize targets, and render a flow diagram of the industrial process. The app outputs machine counts, kit grouping, total power, and generator requirements.

**Live Demo:** [GitHub Pages](https://dr-lin-eng.github.io/zmd-Quantitative-Calculator/) (if available)

**Key Features:**
- 🔄 Production chain calculation with priority-based resource allocation
- 📊 Interactive flow diagram visualization (SVG-based)
- ⚡ Power consumption and generator requirement analysis
- 🎯 Discrete machine count optimization
- 🐳 Docker support for easy deployment

### Quick Start

**Prerequisites:**
- Python 3.8+
- pip

**Installation & Run:**

```powershell
# Create virtual environment
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\activate

# Install dependencies
pip install -r server\requirements.txt

# Start the server
uvicorn server.main:app --reload --host 0.0.0.0 --port 8000
```

If you run the command inside `server/`, use:

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open your browser and navigate to: **http://localhost:8000**

### Docker Deployment

**Option 1: Build locally**

```powershell
docker build -t endfield-calc .
docker run --rm -p 8000:8000 endfield-calc
```

**Option 2: Use prebuilt image**

```powershell
docker pull ghcr.io/dr-lin-eng/zmd-quantitative-calculator:latest
docker run -d --rm -p 18300:8000 ghcr.io/dr-lin-eng/zmd-quantitative-calculator:latest
```

**Option 3: Docker Compose**

```powershell
docker compose up --build
```

Access at: **http://localhost:8000** (or port 18300 for prebuilt image)

### Usage Guide

- **Map-only supply inputs** are specified in units per minute
- Click **Usage Guide** in the header for the in-app walkthrough
- Set a raw supply to **0** to treat it as unlimited; usage will still be estimated and shown
- **Output rates** and **fuel rates** are displayed per minute
- Targets are resolved in **priority order**
- **"Maximize" option** consumes all remaining raw supply for that target
- Machine counts are **discrete integers**; if a target cannot reach one full machine, it produces 0
- **Machine limits** are configured in the UI (Xiranite Oven defaults to 1 but can be edited; blank means unlimited)
- When all raws are unlimited and no target rate is specified, the solver uses **1 machine** of the final product

### Diagram Controls

- 🔄 **Vertical/Horizontal toggle**: Switch flow diagram orientation
- 🖼️ **Fullscreen mode**: Expand the diagram to full screen
- 🖱️ **Pan & Zoom**: Drag to pan inside the diagram area

### Project Structure

```
zmd-Quantitative-Calculator/
├── config/              # JSON configuration files
│   ├── items.json       # Item definitions and recipes
│   ├── machines.json    # Machine specifications
│   ├── generators.json  # Generator specifications
│   └── CONFIG_GUIDE.md  # Configuration schema documentation
├── web/                 # Vue.js frontend
│   ├── index.html       # Main HTML file
│   ├── app.js           # Vue application logic
│   └── styles.css       # Styling
├── server/              # FastAPI backend
│   ├── main.py          # Server entry point
│   └── requirements.txt # Python dependencies
├── scripts/             # Utility scripts
├── Dockerfile           # Docker image definition
└── docker-compose.yml   # Docker Compose configuration
```

For detailed configuration schema, see: **[config/CONFIG_GUIDE.md](config/CONFIG_GUIDE.md)**

### Calculation Rules

Two solvers are available under "Solver" / “计算方式”:

- **Global optimum (default)** – `web/solver.js`, a dependency-free linear program. Every recipe is a
  variable, so it mixes alternative recipes, reuses byproducts (sewage, acid), adds waste treatment
  and shares raw materials across targets. Targets are optimised in priority order, then the plan
  with the fewest machines / lowest power / least raw material is picked. Machine limits are kept as
  whole machines per recipe; machine counts are rounded up, so the last machine of a recipe may idle.
  The fewest-machines / lowest-power tie-break is evaluated before rounding up, so the displayed
  whole-machine totals can be slightly above the true minimum.
  Gas-environment recipes are charged one gas diffuser's minimum feed each.
- **Classic** – the original greedy tree. It only follows each item's default recipe and ignores
  byproducts, pipes and gas environments, so newer Wuling chains may not resolve.

Logistics limits: belts `0.5 items/sec/port`, pipes `2 units/sec/port` (`logistics` in `items.json`).

### Updating recipes | 更新配方

```bash
python scripts/update_config.py     # downloads game data to .cache/ and rewrites config/*.json
node --test tests/test_solver.cjs   # solver tests against the generated config
```

Data comes from [endfield-calc/factoriolab](https://github.com/endfield-calc/factoriolab) (curated
recipes) plus [AKEData](https://data.akedata.wiki) table dumps (newer recipes, ports, power, sizes,
gas environments). The data version is recorded in `config/items.json` and shown in the page header.

游戏更新后运行上面的脚本即可重新生成 `config/`，页面标题下会显示当前配方版本。

## Config schema (examples)

Full details: `config/CONFIG_GUIDE.md`.

### `config/items.json`

```json
{
  "id": "iron_ingot",
  "name": "Iron Ingot",
  "name_zh": "铁锭",
  "category": "intermediate",
  "map_only": false,
  "startup_only": false,
  "icon": "https://...",
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
```

### `config/machines.json`

```json
{
  "id": "assembler",
  "name": "Assembler",
  "name_zh": "组装机",
  "input_ports": 3,
  "output_ports": 1,
  "power": 6,
  "kit_size": 5,
  "allowed_categories": ["raw", "intermediate", "component"],
  "allowed_items": [],
  "icon": "https://..."
}
```

### `config/generators.json`

```json
{
  "id": "burner_generator",
  "name": "Burner Generator",
  "name_zh": "燃烧发电机",
  "fuel_rate_per_sec": 0.2,
  "fuel_power": {
    "coal": 120,
    "biofuel": 90
  }
}
```

## Notes

- The solver picks a single recipe path per target. If you want mixed recipes, extend `web/app.js`.
