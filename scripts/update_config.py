#!/usr/bin/env python3
"""Regenerate config/*.json from public game data.

Sources
  * endfield-calc/factoriolab (curated recipe data, itself derived from AKEData)
  * AKEData TableCfg dumps (https://data.akedata.wiki) for recipes added after
    the curated data's game version, machine ports/power/size and item names.

Usage
  python scripts/update_config.py            # download (cached) + regenerate
  python scripts/update_config.py --offline  # only use files already in cache
"""
import argparse
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "config"
DEFAULT_CACHE = ROOT / ".cache" / "gamedata"

UPSTREAM_REPO = "endfield-calc/factoriolab"
UPSTREAM_REF = "ark-endfield-3rd-test"
UPSTREAM_FILES = {
    "data.json": "src/data/aef/data.json",
    "en.json": "src/data/aef/i18n/en.json",
}
AKE_BASE = "https://data.akedata.wiki"
AKE_TABLES = [
    "FactoryMachineCraftTable.json",
    "FactoryBuildingTable.json",
    "FactoryItemTable.json",
    "FactoryVaporizerTable.json",
    "ItemTable.json",
    "I18nTextTable_CN.json",
    "I18nTextTable_EN.json",
]

# AKEData machine id -> curated machine id
MACHINE_ALIASES = {
    "component_mc_1": "cmpt_mc_1",
    "filling_powder_mc_1": "filling_pd_mc_1",
    "tools_assebling_mc_1": "tools_asm_mc_1",
    "seedcollector_1": "seedcol_1",
    "transmuter_1": "phase_trans_1",
    "transmuter_2": "phase_trans_2",
}
MACHINE_ALIASES_REV = {v: k for k, v in MACHINE_ALIASES.items()}

SKIP_ITEM_CATEGORIES = {"machine", "belt-and-pipe", "__domain_transfer", "__internal"}
SKIP_MACHINES = {"__domain_transfer", "__miner_pump_1", "settlement-tundra", "settlement-jinlong"}
# Machines that only exist to model map extraction; raw supply is entered by the user instead.
MINING_MACHINES = {"miner_2", "miner_3", "miner_4", "pump_1", "pump_2", "gas_pump_1"}
# Alternative conversion machines: never the default route for the classic tree solver.
ALT_MACHINES = {"phase_trans_1", "phase_trans_2", "liquid_recycle_gate"}
BELT_SPEED = 0.5
PIPE_SPEED = 2
PHASES = {1: "solid", 2: "liquid", 4: "gas"}
# Gas diffuser: FactoryVaporizerTable.consumeRate is the minimum feed, read as units per minute.
DIFFUSER_ID = "vaporizer_1"
ENV_NAMES = {
    "gas_inert": ("Stable Environment", "稳定环境"),
    "gas_acid": ("Acidic Environment", "酸性环境"),
    "gas_water": ("Humid Environment", "水汽环境"),
    "gas_xiranite": ("Xiranite Environment", "息壤环境"),
}


def fetch(url: str, dest: Path, offline: bool) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    if offline:
        raise SystemExit(f"--offline but missing cache file: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"download {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "zmd-quantitative-calculator"})
    with urllib.request.urlopen(req, timeout=120) as res:
        dest.write_bytes(res.read())
    return dest


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def title_from_id(value: str) -> str:
    cleaned = re.sub(r"[-_]+", " ", value).strip()
    return " ".join(part.capitalize() for part in cleaned.split()) or value


def make_icon(color: str, fallback_id: str) -> str:
    label = re.sub(r"[^a-zA-Z0-9]", "", fallback_id)[:4].upper() or "ITEM"
    return f"https://placehold.co/64x64/{color.lstrip('#')}/ffffff?text={label}"


def phase_of(item_id: str, factory_items: dict) -> str:
    entry = factory_items.get(f"item_{item_id}")
    if entry and entry.get("phaseType") in PHASES:
        return PHASES[entry["phaseType"]]
    if item_id.startswith("liquid_"):
        return "liquid"
    if item_id.startswith("gas_"):
        return "gas"
    return "solid"


def num(value):
    return int(value) if float(value).is_integer() else value


def ake_io(groups) -> dict:
    out = {}
    for group in groups:
        for entry in group.get("group", []):
            item_id = entry["id"][5:] if entry["id"].startswith("item_") else entry["id"]
            out[item_id] = out.get(item_id, 0) + entry["count"]
    return out


def pick_primary(recipe_id: str, outputs: dict, phases: dict) -> str:
    for out_id in outputs:
        if recipe_id == out_id or recipe_id.startswith(out_id + "-") or recipe_id.endswith("-" + out_id):
            return out_id
    solids = [o for o in outputs if phases.get(o) == "solid"]
    return (solids or list(outputs))[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--upstream-ref", default=UPSTREAM_REF)
    parser.add_argument("--ake-version", default="latest", help="AKEData version id, e.g. 1.6.4@11944529-13")
    args = parser.parse_args()

    # ---- load sources -------------------------------------------------
    up_dir = args.cache / "upstream" / args.upstream_ref
    for name, rel in UPSTREAM_FILES.items():
        fetch(f"https://raw.githubusercontent.com/{UPSTREAM_REPO}/{args.upstream_ref}/{rel}", up_dir / name, args.offline)
    data = load(up_dir / "data.json")
    en = load(up_dir / "en.json")
    base_version = next(iter(data.get("version", {}).values()), "").lstrip("v")

    manifest_path = args.cache / "akedata" / "manifest.json"
    if not args.offline and manifest_path.exists():
        manifest_path.unlink()
    manifest = load(fetch(f"{AKE_BASE}/manifest.json", manifest_path, args.offline))
    versions = {v["id"]: v for v in manifest["versions"]}
    latest = versions[manifest["latest"] if args.ake_version == "latest" else args.ake_version]
    base = next((v for v in manifest["versions"] if v["gameVersion"] == base_version), None)

    def ake_table(version: dict, name: str):
        dest = args.cache / "akedata" / version["id"].replace("@", "_") / name
        return load(fetch(f"{AKE_BASE}/{version['tableCfgPath']}/{name}", dest, args.offline))

    craft_latest = ake_table(latest, "FactoryMachineCraftTable.json")
    craft_base = ake_table(base, "FactoryMachineCraftTable.json") if base else craft_latest
    buildings = ake_table(latest, "FactoryBuildingTable.json")
    factory_items = ake_table(latest, "FactoryItemTable.json")
    vaporizer = ake_table(latest, "FactoryVaporizerTable.json").get(DIFFUSER_ID, {})
    item_table = ake_table(latest, "ItemTable.json")
    text_cn = ake_table(latest, "I18nTextTable_CN.json")
    text_en = ake_table(latest, "I18nTextTable_EN.json")

    def ake_name(table: dict, key: str, texts: dict) -> str:
        entry = table.get(key) or {}
        return texts.get(str((entry.get("name") or {}).get("id")), "")

    icon_colors = {icon["id"]: icon.get("color", "#4b5563") for icon in data.get("icons", [])}
    up_items = {item["id"]: item for item in data["items"]}
    machine_ids = {i for i, item in up_items.items() if item.get("category") == "machine"}

    # Some recipes only run inside a gas environment made by a diffuser; the curated data drops that.
    env_gas = {g["genEnv"]: g["consumeItem"][5:] for g in vaporizer.get("groups", [])}
    env_rate = {g["consumeItem"][5:]: g["consumeRate"] / 60 for g in vaporizer.get("groups", [])}

    def signature(machine: str, ins: dict, outs: dict):
        return (machine, tuple(sorted(ins.items())), tuple(sorted(outs.items())))

    env_by_signature = {}
    for r in craft_latest.values():
        if r.get("gasEnv") in env_gas:
            machine = MACHINE_ALIASES.get(r["machineId"], r["machineId"])
            env_by_signature[signature(machine, ake_io(r["ingredients"]), ake_io(r["outcomes"]))] = env_gas[r["gasEnv"]]

    # ---- recipes: curated base + newer AKEData additions ---------------
    recipes = []  # {id, name_zh, in, out, time, producers, locations, group}
    mining_outputs = set()
    generators_out = []
    for r in data["recipes"]:
        producers = [p for p in r.get("producers", []) if p not in SKIP_MACHINES]
        if not producers:
            continue
        if "mining" in r.get("flags", []):
            mining_outputs.update(k for k in r.get("out", {}) if not k.startswith("__"))
            continue
        if r.get("usage", 0) < 0 and not r.get("out"):
            (fuel_id, fuel_qty), = r["in"].items()
            generators_out.append({
                "id": r["id"],
                "name": en.get("recipes", {}).get(r["id"]) or title_from_id(r["id"]),
                "name_zh": r.get("name", ""),
                "fuel_rate_per_sec": fuel_qty / r["time"],
                "fuel_power": {fuel_id: abs(r["usage"])},
                "icon": make_icon(icon_colors.get(r.get("icon", ""), "#4b5563"), r["id"]),
            })
            continue
        recipes.append({
            "id": r["id"], "name_zh": r.get("name", ""), "in": r.get("in", {}), "out": r.get("out", {}),
            "time": r["time"], "producers": producers, "locations": r.get("locations"), "group": None,
        })

    added_ids = sorted(set(craft_latest) - set(craft_base)) if base else []
    extra_items = {}
    for rid in added_ids:
        r = craft_latest[rid]
        machine = MACHINE_ALIASES.get(r["machineId"], r["machineId"])
        if machine not in machine_ids:
            print(f"skip {rid}: unknown machine {machine}")
            continue
        ins, outs = ake_io(r["ingredients"]), ake_io(r["outcomes"])
        for item_id in list(ins) + list(outs):
            if item_id not in up_items:
                extra_items[item_id] = True
        recipes.append({
            "id": rid, "name_zh": "", "in": ins, "out": outs, "time": r["progressRound"],
            "producers": [machine], "locations": None, "group": "inn",
        })

    # merge identical recipes that only differ by producer (e.g. mix_pool_1 / mix_pool_2)
    merged = {}
    for r in recipes:
        key = (json.dumps(r["in"], sort_keys=True), json.dumps(r["out"], sort_keys=True), r["time"])
        if r["group"] and key in merged:
            merged[key]["producers"] += [p for p in r["producers"] if p not in merged[key]["producers"]]
        else:
            merged.setdefault(key if r["group"] else (r["id"],), r)
    recipes = list(merged.values())

    # ---- items ---------------------------------------------------------
    item_ids = [i for i, item in up_items.items() if item.get("category") not in SKIP_ITEM_CATEGORIES]
    used = set()
    for r in recipes:
        used.update(r["in"]); used.update(r["out"])
    used.update(mining_outputs)
    item_ids = [i for i in item_ids if i in used] + sorted(extra_items)
    phases = {i: phase_of(i, factory_items) for i in item_ids}

    produced = set()
    for r in recipes:
        produced.update(r["out"])
    seed_ids = {i for i in item_ids if i in up_items and "seed" in i}
    raw_ids = set(mining_outputs) | seed_ids | {i for i in item_ids if i not in produced}

    direct_inputs = {}
    recipe_count = {}
    for r in recipes:
        for out_id in r["out"]:
            direct_inputs.setdefault(out_id, set()).update(r["in"])
            recipe_count[out_id] = recipe_count.get(out_id, 0) + 1

    recipes_by_item = {}
    disposal = []
    for r in recipes:
        inputs = [{"item": k, "qty": num(v)} for k, v in sorted(r["in"].items())]
        if not r["out"]:
            for machine in r["producers"]:
                disposal.append({"id": f"{r['id']}@{machine}" if len(r["producers"]) > 1 else r["id"],
                                 "name_zh": r["name_zh"], "machine": machine, "time_sec": r["time"], "inputs": inputs})
            continue
        primary = pick_primary(r["id"], r["out"], phases)
        cyclic = recipe_count.get(primary, 0) > 1 and any(
            i not in raw_ids and primary in direct_inputs.get(i, set()) for i in r["in"])
        for index, machine in enumerate(r["producers"]):
            entry = {
                "id": f"{r['id']}@{machine}" if len(r["producers"]) > 1 else r["id"],
                "machine": machine,
                "time_sec": r["time"],
                "output_qty": num(r["out"][primary]),
                "inputs": inputs,
            }
            byproducts = [{"item": k, "qty": num(v)} for k, v in r["out"].items() if k != primary]
            if byproducts:
                entry["byproducts"] = byproducts
            if r["locations"]:
                entry["locations"] = r["locations"]
            env = env_by_signature.get(signature(machine, r["in"], r["out"]))
            if env:
                entry["env"] = env
            if index > 0 or machine in ALT_MACHINES or cyclic or primary in mining_outputs:
                entry["alt"] = True
            recipes_by_item.setdefault(primary, []).append(entry)

    category_map = {"material": "intermediate", "product": "product", "settlement": "product", "activity": "activity"}
    items_out = []
    for item_id in item_ids:
        src = up_items.get(item_id, {})
        name_zh = src.get("name") or ake_name(item_table, f"item_{item_id}", text_cn) or item_id
        name_en = (en.get("items", {}).get(item_id) or ake_name(item_table, f"item_{item_id}", text_en)
                   or title_from_id(item_id))
        map_only = item_id in raw_ids
        entry = {
            "id": item_id,
            "name": name_en,
            "name_zh": name_zh,
            "category": "raw" if map_only else category_map.get(src.get("category"), "intermediate"),
            "phase": phases[item_id],
            "map_only": map_only,
            "icon": make_icon(icon_colors.get(src.get("icon", item_id), "#4b5563"), item_id),
        }
        if item_id in seed_ids:
            entry["startup_only"] = True
        if item_id in extra_items:
            entry["group"] = "inn"
        item_recipes = recipes_by_item.get(item_id, [])
        # the first non-alt recipe is what the classic solver falls back to; make sure one exists
        if item_recipes and not map_only and all(r.get("alt") for r in item_recipes):
            item_recipes[0].pop("alt")
        entry["recipes"] = item_recipes
        items_out.append(entry)

    # ---- machines --------------------------------------------------------
    used_machines = {r["machine"] for rs in recipes_by_item.values() for r in rs} | {d["machine"] for d in disposal}
    used_machines.add("power_sta_1")
    machines_out = []
    for machine_id in sorted(used_machines | (MINING_MACHINES & machine_ids)):
        src = up_items[machine_id]
        meta = src.get("machine", {})
        building = buildings.get(MACHINE_ALIASES_REV.get(machine_id, machine_id))
        size = meta.get("size")
        ports = {"input_ports": 0, "output_ports": 0, "pipe_input_ports": 0, "pipe_output_ports": 0}
        if building:
            size = size or [building["range"]["width"], building["range"]["depth"]]
            for key, field in (("input", "inputPorts"), ("output", "outputPorts")):
                for port in building.get(field, []):
                    ports[("pipe_" if port.get("isPipe") else "") + f"{key}_ports"] += 1
        machines_out.append({
            "id": machine_id,
            "name": en.get("items", {}).get(machine_id) or ake_name(buildings, MACHINE_ALIASES_REV.get(machine_id, machine_id), text_en) or title_from_id(machine_id),
            "name_zh": src.get("name", ""),
            "category": "machine",
            **ports,
            "power": meta.get("usage", building.get("powerConsume", 0) if building else 0) or 0,
            "size": size or [1, 1],
            "kit_size": (size[0] * size[1]) if size else 1,
            **({"locations": meta["locations"]} if meta.get("locations") else {}),
            **({"virtual": True} if machine_id.startswith("settlement-") or machine_id.endswith("_gate") else {}),
            **({"mining": True} if machine_id in MINING_MACHINES else {}),
            "allowed_categories": [],
            "allowed_items": [],
            "icon": make_icon(icon_colors.get(src.get("icon", machine_id), "#4b5563"), machine_id),
        })

    used_envs = sorted({r["env"] for rs in recipes_by_item.values() for r in rs if r.get("env")})
    environments = [{
        "id": gas,
        "name": ENV_NAMES.get(gas, (title_from_id(gas), gas))[0],
        "name_zh": ENV_NAMES.get(gas, (title_from_id(gas), gas))[1],
        "gas": gas,
        "rate_per_sec": env_rate[gas],
        "machine": DIFFUSER_ID,
    } for gas in used_envs]
    if environments and DIFFUSER_ID in buildings:
        building = buildings[DIFFUSER_ID]
        size = [building["range"]["width"], building["range"]["depth"]]
        machines_out.append({
            "id": DIFFUSER_ID,
            "name": ake_name(buildings, DIFFUSER_ID, text_en) or "Gas Diffuser",
            "name_zh": ake_name(buildings, DIFFUSER_ID, text_cn) or "气体散布机",
            "category": "machine",
            "input_ports": 0, "output_ports": 0, "pipe_input_ports": 1, "pipe_output_ports": 0,
            "power": building.get("powerConsume", 0),
            "size": size,
            "kit_size": size[0] * size[1],
            "environment": True,
            "allowed_categories": [],
            "allowed_items": [],
            "icon": make_icon("#4b5563", DIFFUSER_ID),
        })

    meta = {
        "game_version": latest["gameVersion"],
        "data_version": latest["id"],
        "sources": [
            f"https://github.com/{UPSTREAM_REPO}/tree/{args.upstream_ref} (v{base_version})",
            f"{AKE_BASE} ({latest['id']})",
        ],
    }
    logistics = {"belt_per_sec": BELT_SPEED, "pipe_per_sec": PIPE_SPEED}
    OUT_DIR.mkdir(exist_ok=True)
    dump = lambda name, payload: (OUT_DIR / name).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    dump("items.json", {"version": 2, **meta, "logistics": logistics, "environments": environments,
                        "items": items_out, "disposal": disposal})
    dump("machines.json", {"version": 2, "machines": machines_out})
    dump("generators.json", {"version": 2, "generators": generators_out})

    n_recipes = sum(len(i["recipes"]) for i in items_out)
    print(f"game {latest['id']}: {len(items_out)} items, {n_recipes} recipes (+{len(disposal)} disposal), "
          f"{len(machines_out)} machines, {len(generators_out)} generators; "
          f"{len(added_ids)} recipes newer than curated v{base_version}")


if __name__ == "__main__":
    main()
