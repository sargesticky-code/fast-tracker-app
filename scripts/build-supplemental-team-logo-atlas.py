import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ATLAS_DIR = ROOT.parent / "football-logo-atlas"
ASSET_DIR = ROOT / "data/team-logo-supplemental-assets"

SUPPLEMENTAL = [
    ("al hussein", "al-hussein", "Al Hussein Sport Club official website favicon / club shield", "https://alhussein.club/wp-content/uploads/2026/05/cropped-cropped-alhussein.club_-2-1-192x192.jpg", "Official club website asset; used without alteration. No reuse license stated."),
    ("banks o dee", "banks-o-dee", "Banks o’ Dee official club site (Pitchero club logo)", "https://images.pitchero.com/club_logos/72256/XVbqv05mSdGOmLOhDF0x_BOD_Purple.png", "Official club website asset; used without alteration. No reuse license stated."),
    ("berwick rangers", "berwick-rangers", "Berwick Rangers official club website badge", "https://berwickrangers.com/wp-content/themes/gf/berwick_rangers-logo-192x192.png", "Official club website asset; used without alteration. No reuse license stated."),
    ("clydebank", "clydebank", "Clydebank FC official club website logo", "https://www.clydebankfc.com/wp-content/uploads/2021/09/logo-clydebank.png", "Official club website asset; used without alteration. No reuse license stated."),
    ("cumbernauld colts", "cumbernauld-colts", "Cumbernauld Colts official club website logo", "https://cumbernauldcoltsfc.com/wp-content/uploads/2023/11/cumbernauld-colts-logo.jpg", "Official club website asset; used without alteration. No reuse license stated."),
    ("eskhata", "eskhata", "FC Eskhata official club website team logo", "https://eskhata-fc.tj/wp-content/fnw-languages/team-logos/eskhata.png", "Official club website asset; used without alteration. No reuse license stated."),
    ("formartine united", "formartine-united", "Formartine United FC official website logo", "https://cdn.prod.website-files.com/632c1c18033fb94873a6f57b/632c24e2d7b61c3360b5d30a_Formartine%20Logo.svg", "Official club website asset; downscaled, no recoloring. No reuse license stated."),
    ("lynx", "lynx", "Lynx FC official website logo", "https://static.wixstatic.com/media/11ca43_52b0424f8452492485763f23ab2dcd15~mv2.png/v1/fill/w_261,h_261,al_c,q_85/Lynx_football_club.png", "Official club website asset; used without alteration. No reuse license stated."),
    ("mons calpe", "mons-calpe", "Mons Calpe SC official website logo", "https://www.vamons.com/mons.png", "Official club website asset; used without alteration. No reuse license stated."),
    ("unan managua", "unan-managua", "Wikimedia Commons File:Escudo UNAN Managua.png; author UNAN Managua", "https://commons.wikimedia.org/wiki/File:Escudo_UNAN_Managua.png", "CC BY-SA 4.0; resized to 22px without other changes. Attribution: UNAN Managua; source and license link retained here."),
]

base = json.loads((ATLAS_DIR / "team-logo-index-v20261012.json").read_text())
atlas = Image.open(ATLAS_DIR / "football-logo-atlas-v20261012.webp").convert("RGBA")
new_assets = []
for key, stem, source, source_url, license_note in SUPPLEMENTAL:
    if key in base["logos"]:
        continue
    index = base["count"]
    x, y = index % base["columns"], index // base["columns"]
    if y >= base["rows"]:
        raise RuntimeError("The base atlas has no free tile slots")
    tile = Image.open(ASSET_DIR / f"{stem}.webp").convert("RGBA")
    tile = tile.resize((base["tileSize"], base["tileSize"]), Image.Resampling.LANCZOS)
    atlas.alpha_composite(tile, (x * base["tileSize"], y * base["tileSize"]))
    base["logos"][key] = [{
        "x": x,
        "y": y,
        "source": f"supplemental/{stem}.webp",
        "file": f"supplemental/{stem}.webp",
    }]
    base["count"] += 1
    new_assets.append({
        "key": key,
        "file": f"team-logo-supplemental-assets/{stem}.webp",
        "source": source,
        "license": license_note,
        "source_url": source_url,
    })

new_version = "v20261012b"
base["atlas"] = f"football-logo-atlas-{new_version}.webp"
atlas.save(ATLAS_DIR / base["atlas"], "WEBP", quality=72, method=6)
(ATLAS_DIR / f"team-logo-index-{new_version}.json").write_text(
    json.dumps(base, ensure_ascii=False, separators=(",", ":")) + "\n"
)

registry_path = ROOT / "data/team-logo-aliases.json"
registry = json.loads(registry_path.read_text())
registry["snapshotCapturedAt"] = "2026-10-12T06:31:38.187256+00:00"
for source, target in [
    ("al hussein jor", "al hussein"),
    ("banks o dee", "banks o dee"),
    ("berwick", "berwick rangers"),
    ("clydebank fc", "clydebank"),
    ("cumbernauld colts", "cumbernauld colts"),
    ("eskhata", "eskhata"),
    ("formartine utd", "formartine united"),
    ("lynx", "lynx"),
    ("mons calpe", "mons calpe"),
    ("unan managua", "unan managua"),
]:
    registry["aliases"][source] = target
registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n")

manifest_path = ROOT / "data/team-logo-supplements.json"
manifest = json.loads(manifest_path.read_text())
known = {asset["key"] for asset in manifest["assets"]}
manifest["assets"].extend(asset for asset in new_assets if asset["key"] not in known)
manifest["assets"].sort(key=lambda asset: asset["key"])
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

notice = """Additional badges in the v20261012b atlas are 22px tiles. Nine were downloaded from the named clubs’ official websites; the cited pages do not state a reuse license. UNAN Managua is CC BY-SA 4.0, author UNAN Managua; source and license: https://commons.wikimedia.org/wiki/File:Escudo_UNAN_Managua.png. It was resized to the tile size without recoloring or reshaping. Full source/status records are in data/team-logo-supplements.json.

These marks are used in a personal football dashboard and do not imply affiliation or endorsement. Remove any asset upon request from its rights holder. Fraserburgh’s official website expressly prohibits reproduction without permission, so no Fraserburgh badge is included.
"""
(ATLAS_DIR / f"NOTICE-{new_version}.txt").write_text(notice)
print(json.dumps({"added": [asset["key"] for asset in new_assets], "count": base["count"], "atlas": base["atlas"], "bytes": (ATLAS_DIR / base["atlas"]).stat().st_size}))
