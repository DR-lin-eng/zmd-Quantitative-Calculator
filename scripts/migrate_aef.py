import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "factoriolab-ark-endfield-3rd-test" / "src" / "data" / "aef" / "data.json"
OUT_ITEMS = ROOT / "config" / "items.json"
OUT_MACHINES = ROOT / "config" / "machines.json"
OUT_GENERATORS = ROOT / "config" / "generators.json"


def title_from_id(value: str) -> str:
    cleaned = re.sub(r"[-_]+", " ", value).strip()
    if not cleaned:
        return value
    return " ".join(part.capitalize() for part in cleaned.split())


def label_from_id(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]", "", value)
    if not slug:
        return "ITEM"
    return slug[:4].upper()


def make_icon(icon_id: str, fallback_id: str, icon_colors: dict) -> str:
    color = icon_colors.get(icon_id, "#4b5563").lstrip("#")
    label = label_from_id(fallback_id)
    return f"https://placehold.co/64x64/{color}/ffffff?text={label}"


def main() -> None:
    with SRC.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    icon_colors = {icon["id"]: icon.get("color", "#4b5563") for icon in data.get("icons", [])}

    items = data.get("items", [])
    recipes = data.get("recipes", [])

    machine_items = {item["id"] for item in items if item.get("category") == "machine"}

    used_items = set()
    for recipe in recipes:
        used_items.update(recipe.get("in", {}).keys())
        used_items.update(recipe.get("out", {}).keys())

    mining_outputs = set()
    for recipe in recipes:
        if "mining" in recipe.get("flags", []) and not recipe.get("in"):
            mining_outputs.update(recipe.get("out", {}).keys())

    seed_ids = {
        item["id"]
        for item in items
        if item.get("category") != "machine" and "seed" in item.get("id", "")
    }
    map_only_ids = set(mining_outputs) | seed_ids

    direct_inputs_by_output = {}
    total_recipes_by_output = {}
    for recipe in recipes:
        outputs = recipe.get("out", {})
        if len(outputs) != 1:
            continue
        output_id = next(iter(outputs.keys()))
        if output_id in machine_items or output_id not in used_items:
            continue
        if output_id in mining_outputs:
            continue
        total_recipes_by_output[output_id] = total_recipes_by_output.get(output_id, 0) + 1
        direct_inputs_by_output.setdefault(output_id, set()).update(recipe.get("in", {}).keys())

    recipes_by_item = {}
    for recipe in recipes:
        outputs = recipe.get("out", {})
        if len(outputs) != 1:
            continue
        output_id, output_qty = next(iter(outputs.items()))
        if output_id in machine_items:
            continue
        if output_id not in used_items:
            continue
        if output_id in mining_outputs and not recipe.get("in"):
            continue

        inputs = recipe.get("in", {})
        if total_recipes_by_output.get(output_id, 0) > 1:
            has_cycle = any(
                input_id not in map_only_ids
                and output_id in direct_inputs_by_output.get(input_id, set())
                for input_id in inputs.keys()
            )
            if has_cycle:
                continue

        for producer in recipe.get("producers", []):
            entry = {
                "machine": producer,
                "time_sec": recipe.get("time", 1),
                "output_qty": output_qty,
                "inputs": [
                    {"item": key, "qty": value}
                    for key, value in sorted(inputs.items())
                ]
            }
            recipes_by_item.setdefault(output_id, []).append(entry)

    items_out = []
    for item in items:
        item_id = item.get("id")
        if not item_id or item_id in machine_items:
            continue
        if item_id not in used_items:
            continue

        map_only = item_id in map_only_ids
        category = item.get("category", "material")

        if map_only:
            mapped_category = "raw"
        elif category == "material":
            mapped_category = "intermediate"
        elif category == "product":
            mapped_category = "product"
        elif category == "settlement":
            mapped_category = "product"
        elif category == "belt-and-pipe":
            mapped_category = "component"
        else:
            mapped_category = "intermediate"

        item_entry = {
            "id": item_id,
            "name": title_from_id(item_id),
            "name_zh": item.get("name", ""),
            "category": mapped_category,
            "map_only": map_only,
            "icon": make_icon(item.get("icon", item_id), item_id, icon_colors)
        }
        if item_id in seed_ids:
            item_entry["startup_only"] = True

        item_recipes = recipes_by_item.get(item_id, [])
        if item_recipes:
            item_entry["recipes"] = sorted(item_recipes, key=lambda r: r["machine"])
        else:
            item_entry["recipes"] = []

        items_out.append(item_entry)

    machine_recipe_stats = {}
    for recipe in recipes:
        producers = recipe.get("producers", [])
        input_count = len(recipe.get("in", {}))
        output_count = len(recipe.get("out", {}))
        for producer in producers:
            stats = machine_recipe_stats.setdefault(producer, {"max_inputs": 0, "max_outputs": 0})
            stats["max_inputs"] = max(stats["max_inputs"], input_count)
            stats["max_outputs"] = max(stats["max_outputs"], output_count)

    machines_out = []
    for item in items:
        if item.get("category") != "machine":
            continue
        machine_id = item.get("id")
        machine_meta = item.get("machine", {})
        stats = machine_recipe_stats.get(machine_id, {"max_inputs": 0, "max_outputs": 0})
        size = machine_meta.get("size") or []
        kit_size = 1
        if isinstance(size, list) and len(size) == 2 and all(isinstance(n, int) for n in size):
            kit_size = max(1, size[0] * size[1])

        machines_out.append({
            "id": machine_id,
            "name": title_from_id(machine_id),
            "name_zh": item.get("name", ""),
            "category": "machine",
            "input_ports": stats["max_inputs"],
            "output_ports": max(1, stats["max_outputs"]),
            "power": machine_meta.get("usage", 0),
            "kit_size": kit_size,
            "allowed_categories": [],
            "allowed_items": [],
            "icon": make_icon(item.get("icon", machine_id), machine_id, icon_colors)
        })

    generators_out = []
    for recipe in recipes:
        if recipe.get("usage", 0) >= 0:
            continue
        outputs = recipe.get("out", {})
        if outputs:
            continue
        inputs = recipe.get("in", {})
        if len(inputs) != 1:
            continue
        fuel_id, fuel_qty = next(iter(inputs.items()))
        time_sec = recipe.get("time", 1)
        if not time_sec:
            continue
        fuel_rate = fuel_qty / time_sec
        fuel_power = abs(recipe.get("usage", 0))
        gen_id = recipe.get("id") or f"gen_{fuel_id}"

        generators_out.append({
            "id": gen_id,
            "name": title_from_id(gen_id),
            "name_zh": recipe.get("name", ""),
            "fuel_rate_per_sec": fuel_rate,
            "fuel_power": {fuel_id: fuel_power},
            "icon": make_icon(recipe.get("icon", gen_id), gen_id, icon_colors)
        })

    OUT_ITEMS.write_text(json.dumps({"version": 1, "items": items_out}, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_MACHINES.write_text(json.dumps({"version": 1, "machines": machines_out}, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_GENERATORS.write_text(
        json.dumps({"version": 1, "generators": generators_out}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


if __name__ == "__main__":
    main()
