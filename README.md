# Endfield Infrastructure Calculator

Compute production chains from map-only supplies, prioritize targets, and render a flow diagram of the industrial process. The app outputs machine counts, kit grouping, total power, and generator requirements.

## Run

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r server\requirements.txt
uvicorn server.main:app --reload --host 0.0.0.0 --port 8000
```

If you run the command inside `server/`, use:

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`.

## Docker

Build and run directly:

```powershell
docker build -t endfield-calc .
docker run --rm -p 8000:8000 endfield-calc
```

Run the prebuilt image:

```powershell
docker pull ghcr.io/dr-lin-eng/zmd-quantitative-calculator:latest
docker run --rm -p 8000:8000 ghcr.io/dr-lin-eng/zmd-quantitative-calculator:latest
```

Or with Compose:

```powershell
docker compose up --build
```

## Usage

- Map-only supply inputs are per minute. Output rates and fuel rates are also displayed per minute.
- Targets are resolved in priority order. “Maximize” consumes all remaining raw supply for that target.
- Machine counts are discrete integers; if a target cannot reach one full machine, it produces 0.

## Diagram controls

- Use the Vertical/Horizontal toggle to switch flow orientation.
- Click Fullscreen to expand the diagram; drag to pan inside the diagram area.

## Structure

- `config/`: JSON configs (items, machines, generators)
- `web/`: Vue + SVG frontend
- `server/`: FastAPI static server
- `config/CONFIG_GUIDE.md`: Config schema guide with field descriptions and examples

## Rules

- Belt throughput: `0.5 / sec / port`, used to cap per-machine output.
- Multi-output machines split evenly across outputs.
- Multi-input machines assume one belt per input item.
- Kits are grouped by `kit_size`.

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
