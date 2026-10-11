#!/usr/bin/env python3
"""One-time GitHub-CC0 source name chunks for Postgres bulk reference import.

Authoritative names stay attributed to Reep IDs, not fabricated canonical IDs.
No network access, no DB mutation, no recurring job.
"""
import csv
import json
from pathlib import Path
from collections import Counter
import argparse
import hashlib

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--source",required=True)
    ap.add_argument("--out",required=True)
    ap.add_argument("--chunk-size",type=int,default=2000)
    args=ap.parse_args()
    if not 500<=args.chunk_size<=4000:
        ap.error("chunk-size must be between 500 and 4000")
    out=Path(args.out)
    out.mkdir(parents=True,exist_ok=True)
    fields=("entity_id","source_name","country","wikidata_qid","flashscore_team_id","fotmob_team_id","name_role")
    count=0
    part=0
    digest=hashlib.sha256()
    identities=set()
    rows=[]
    roles=Counter()
    source_path=Path(args.source)
    with source_path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        for row in reader:
            key=(row.get("entity_id",""),row.get("normalized_key",""))
            if not all(key) or not row.get("source_name"):
                raise ValueError("incomplete source data: name / identity")
            if key in identities:
                raise ValueError("duplicate external entity and source key: "+str(key))
            identities.add(key)
            record=[row.get(k,"") for k in fields]
            roles[row.get("name_role","")]+=1
            count+=1
            rows.append(record)
            if len(rows)>=args.chunk_size:
                part+=1
                write_chunk(out,part,rows,digest)
                rows=[]
    if rows:
        part+=1
        write_chunk(out,part,rows,digest)
    manifest={"source":"REEP_CC0","provenance":"https://github.com/withqwerty/reep",
              "license":"CC0-1.0","row_count":count,
              "distinct_external_entities":len({i[0] for i in identities}),
              "chunk_count":part,"roles":dict(roles),
              "chunk_content_sha256":digest.hexdigest(),
              "import_mode":"SOURCE_REFERENCE_ONLY_NOT_CANONICAL_VERIFIED",
              "automatic_schedule":False}
    (out/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")
    if count<47000 or part<10:
        raise ValueError("unexpectedly incomplete source reference")
    print("COMPLETE_TEAM_REFERENCE_PREPARED",json.dumps(manifest,sort_keys=True))

def write_chunk(path,part,records,digest):
    payload=json.dumps(records,ensure_ascii=False,separators=(",",":"))
    digest.update(payload.encode("utf8"))
    (path/f"chunk_{part:03}.json").write_text(payload,encoding="utf8")

if __name__=="__main__":
    main()
