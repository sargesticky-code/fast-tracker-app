#!/usr/bin/env python3
"""Download CC0 football team names and provider crosswalk for an offline candidate catalogue.

Sources: withqwerty/reep v0 data/teams.csv and data/names.csv (CC0).
No calls to Flashscore/Forebet; no databases, authentication or identity promotions.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = "https://raw.githubusercontent.com/withqwerty/reep/main/data/"
MAX_BYTES = {"teams.csv": 10_000_000, "names.csv": 5_000_000}

def normalize(name):
    import unicodedata
    n = unicodedata.normalize("NFKD", str(name or "")).casefold()
    return "".join(c for c in n if c.isalnum() and not unicodedata.combining(c))

def load_csv(path, *, offline=None):
    if offline is not None:
        data = Path(offline).read_bytes()
    else:
        # Public-domain GitHub source only. No challenge/cookie/proxy handling.
        with urlopen(ROOT + path, timeout=45) as response:
            data = response.read(MAX_BYTES[path] + 1)
    if len(data) > MAX_BYTES[path]:
        raise ValueError("SOURCE_TOO_LARGE")
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    return rows, hashlib.sha256(data).hexdigest()

def build(teams, names):
    ids = {}
    for t in teams:
        qid = (t.get("key_wikidata") or "").strip()
        if qid:
            ids.setdefault(qid, []).append(t)
    output = []
    for t in teams:
        name = (t.get("name") or "").strip()
        if not name:
            continue
        output.append({
            "entity_id":t.get("reep_id", ""),
            "source":"REEP_CC0",
            "source_name":name,
            "normalized_key":normalize(name),
            "country":t.get("country", ""),
            "wikidata_qid":t.get("key_wikidata", ""),
            "flashscore_team_id":t.get("key_flashscore", ""),
            "fotmob_team_id":t.get("key_fotmob", ""),
            "name_role":"PRIMARY",
            "identity_status":"REFERENCE_ONLY",
        })
    aliases=0
    for n in names:
        alias = (n.get("alias") or "").strip()
        qid = (n.get("key_wikidata") or "").strip()
        if not alias or len(ids.get(qid, []))!=1:
            continue
        t = ids[qid][0]
        if normalize(alias) == normalize(t.get("name","")):
            continue
        output.append({
            "entity_id":t.get("reep_id", ""),
            "source":"REEP_CC0",
            "source_name":alias,
            "normalized_key":normalize(alias),
            "country":t.get("country", ""),
            "wikidata_qid":qid,
            "flashscore_team_id":t.get("key_flashscore", ""),
            "fotmob_team_id":t.get("key_fotmob", ""),
            "name_role":"ALIAS",
            "identity_status":"REFERENCE_ONLY",
        })
        aliases += 1
    uniq = {}
    for r in output:
        key=(r["entity_id"],r["normalized_key"])
        if key not in uniq:
            uniq[key]=r
    return sorted(uniq.values(),key=lambda r:(r["entity_id"],r["name_role"],r["normalized_key"])),aliases

def main():
    args = argparse.ArgumentParser()
    args.add_argument("--out-dir",default="/tmp/all-in-one-open-teams")
    args = args.parse_args()
    teams, t_sha = load_csv("teams.csv")
    names, n_sha = load_csv("names.csv")
    if len(teams)<20000:
        raise ValueError("INCOMPLETE_PUBLIC_TEAM_CATALOGUE")
    rows, aliases = build(teams,names)
    dest=Path(args.out_dir)
    dest.mkdir(parents=True,exist_ok=True)
    cols=["entity_id","source","source_name","normalized_key","country","wikidata_qid","flashscore_team_id","fotmob_team_id","name_role","identity_status"]
    with (dest/"reference_team_names.csv").open("w",newline="",encoding="utf-8") as out:
        writer=csv.DictWriter(out,fieldnames=cols)
        writer.writeheader()
        writer.writerows(rows)
    manifest={"captured_at_utc":datetime.now(timezone.utc).isoformat(),
              "source_repo":"https://github.com/withqwerty/reep",
              "license":"CC0-1.0",
              "teams_csv_sha256":t_sha,"names_csv_sha256":n_sha,
              "team_entities":len(teams),"alias_entries_input":len(names),
              "team_aliases_linked_by_wikidata_qid":aliases,
              "output_rows":len(rows),"auto_published_to_database":False,
              "identity_promotion":"NOT_PERMITTED_WITHOUT_PROVIDER_ID_OR_EVENT_PROOF"}
    (dest/"manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    print("OPEN_TEAM_NAME_REFERENCE",json.dumps(manifest,sort_keys=True))

if __name__=="__main__":
    main()
