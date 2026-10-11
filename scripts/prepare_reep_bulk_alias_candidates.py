#!/usr/bin/env python3
"""Bounded, sample-gated CC0 Reep QID alias candidates. No network/DB writes."""
import csv,json,random,collections,unicodedata
from pathlib import Path

def norm(x):
 x=unicodedata.normalize("NFKD",str(x or "")).casefold()
 return "".join(c for c in x if c.isalnum() and not unicodedata.combining(c))
def sqlquote(x):return "'"+str(x).replace("'","''")+"'"
root=Path(__file__).resolve().parents[1]
catalog=list(csv.DictReader(open("/tmp/reep/reference_team_names.csv",encoding="utf8")))
verified=json.load(open(root/"ops/reference/verified-team-name-input-20261011.json"))
observed=json.load(open(root/"ops/reference/observed-provider-names-20261011.json"))
byname=collections.defaultdict(set);byentity=collections.defaultdict(list)
for row in catalog:
 name=norm(row["source_name"])
 if name and row["entity_id"]:
  byname[name].add(row["entity_id"])
  byentity[row["entity_id"]].append(row)
current=collections.defaultdict(set);targets=collections.defaultdict(set)
for source,name,team in verified:
 k=norm(name);current[source,k].add(team);targets[k].add(team)
anchors=collections.defaultdict(list)
for source,name,team in verified:
 k=norm(name)
 if len(byname[k])==1 and len(targets[k])==1:
  anchors[next(iter(byname[k]))].append((source,name,team))
resolved={}
for entity,a in anchors.items():
 t={z[2] for z in a}
 if len(t)==1:resolved[entity]=next(iter(t))
cross=[e for e,a in anchors.items() if len({z[0] for z in a})>=2]
conflicts=[e for e in cross if len({z[2] for z in anchors[e]})!=1]
sample=random.Random(20261011).sample(sorted(cross),min(40,len(cross)))
passed=len(sample)>=15 and not conflicts and all(e in resolved for e in sample)
seen=collections.defaultdict(set)
for source,name in observed:
 if source in ("FLASHSCORE","FOREBET"):seen[norm(name)].add((source,name))
candidate={};excluded=collections.Counter()
for ent,team in resolved.items():
 for row in byentity[ent]:
  key=norm(row["source_name"]);name=row["source_name"].strip()
  if len(byname[key])!=1 or (targets.get(key) and targets[key]!={team}):
   excluded["ambiguous"]+=1;continue
  for source,n in [("REEP_CC0",name),*sorted(seen.get(key,set()))]:
   identity=source,norm(n)
   if not norm(n) or identity in current:
    excluded["existing"]+=1;continue
   val=(source,n,team,ent,row.get("wikidata_qid") or "")
   if identity in candidate and candidate[identity] and candidate[identity][2]!=team:
    candidate[identity]=None;excluded["colliding_candidate"]+=1
   elif identity not in candidate:candidate[identity]=val
rows=sorted((v for v in candidate.values() if v),key=lambda r:(r[0],norm(r[1])))
audit={"catalogue_rows":len(catalog),"verified_input":len(verified),
  "observed_input":len(observed),"anchored_entities":len(resolved),
  "cross_source_entities":len(cross),"cross_source_conflicts":len(conflicts),
  "sample_size":len(sample),"sample_disagreements":sum(e not in resolved for e in sample),
  "gate_pass":passed,"candidates":len(rows),
  "by_source":dict(collections.Counter(r[0] for r in rows)),
  "excluded":dict(excluded),
  "sample_examples":[{"entity":e,"team":resolved.get(e),
    "names":[z[1] for z in anchors[e][:3]]} for e in sample[:20]]}
out=root/"ops/reep-bulk-output";out.mkdir(parents=True,exist_ok=True)
(out/"audit.json").write_text(json.dumps(audit,indent=2,ensure_ascii=False),encoding="utf8")
with (out/"candidates.csv").open("w",encoding="utf8",newline="") as f:
 w=csv.writer(f);w.writerow(["source","name","team_key","reep_entity","qid"]);w.writerows(rows)
if not passed:raise SystemExit("REEP_CROSS_SOURCE_SAMPLE_FAILED "+json.dumps(audit))
for i in range(0,len(rows),120):
 values=",\n".join("("+",".join(sqlquote(v) for v in r)+")" for r in rows[i:i+120])
 sql="""-- Reep sampled CC0, unique QID entity and pre-verified canonical name.
-- Do not overwrite old source identities or global homonyms.
WITH incoming(source,source_name,team_key,reep_id,qid) AS (
 VALUES
"""+values+"""
), valid AS (
 SELECT source,source_name,team_key,public.ft_team_name_key(source_name) source_key
 FROM incoming x WHERE EXISTS(SELECT 1 FROM public.team_entities_v2 e WHERE e.team_key=x.team_key)
 AND NOT EXISTS(SELECT 1 FROM public.team_name_master m
  WHERE m.source=x.source AND m.source_key=public.ft_team_name_key(x.source_name))
 AND NOT EXISTS(SELECT 1 FROM public.team_alias_registry_v2 a
  WHERE a.source=x.source AND a.alias_key=public.ft_team_name_key(x.source_name))
), safe AS (
 SELECT v.* FROM valid v WHERE NOT EXISTS(
 SELECT 1 FROM valid w WHERE v.source=w.source AND v.source_key=w.source_key
 AND v.team_key<>w.team_key)
), reg AS (
 INSERT INTO public.team_alias_registry_v2
 (source,alias_key,team_key,alias,status,confidence,evidence_count,distinct_event_count,
 verification_method,first_seen_at,last_seen_at,updated_at)
 SELECT source,source_key,team_key,source_name,'VERIFIED',0.94,1,1,
 'REEP_CC0_UNIQUE_ENTITY_MULTI_SOURCE_SAMPLE_CHECKED',now(),now(),now()
 FROM safe ON CONFLICT(source,alias_key,team_key) DO NOTHING
 RETURNING source,alias_key,team_key,alias,confidence
), mast AS (
 INSERT INTO public.team_name_master
 (source,source_name,source_key,team_key,hkjc_name_en,hkjc_name_zh,
 status,confidence,event_count,first_seen_at,last_seen_at,evidence_sources,updated_at)
 SELECT r.source,r.alias,r.alias_key,r.team_key,e.hkjc_name_en,e.hkjc_name_zh,
 'VERIFIED',r.confidence,1,now(),now(),
 '["REEP_CC0_ENTITY","SAMPLED_CROSS_SOURCE_20261011"]'::jsonb,now()
 FROM reg r JOIN public.team_entities_v2 e USING(team_key)
 ON CONFLICT(source,source_key,team_key) DO NOTHING RETURNING source
)
SELECT (SELECT count(*) FROM reg) aliases_inserted,
 (SELECT count(*) FROM mast) master_inserted;
"""
 (out/("batch_%03d.sql"%(i//120+1))).write_text(sql,encoding="utf8")
print("REEP_BULK_GATE_PASSED "+json.dumps({k:v for k,v in audit.items() if k!="sample_examples"}))
