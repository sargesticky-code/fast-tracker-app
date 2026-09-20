import Link from "next/link";
import { getFeed, modelCoverageCount, freshness } from "@/lib/fast-tracker";

function missingClass(match){
  const h=match.health||{};
  if(!h.primaryMissingReason) return null;
  if(h.forebetState==="FIXTURE_ONLY") return "SOURCE_FIXTURE_ONLY";
  if(!h.forebetState || h.forebetCheckFreshness==="STALE") return "CAPTURE_OR_CHECK_PENDING";
  if(h.forebetState==="UNRESOLVED" && h.forebetCheckFreshness==="FRESH") return "SOURCE_NO_MODEL";
  if(h.diagnostics?.some(x=>String(x).includes("ALIAS_NOT_REGISTERED"))) return "MATCHING_REVIEW";
  return "OTHER";
}

const classMeta={
  SOURCE_FIXTURE_ONLY:["Source有賽事、冇預測","Forebet曾見到賽事，但冇prediction model。"],
  SOURCE_NO_MODEL:["Source已check、冇model","已完成Forebet檢查；唔會用alias或假數據補洞。"],
  CAPTURE_OR_CHECK_PENDING:["Capture / check待完成","尚未完成檢查，或者check已過時；屬pipeline待處理。"],
  MATCHING_REVIEW:["Matching需覆核","Source有線索，但球隊alias / matching需要人工驗證。"],
  OTHER:["其他資料缺口","有缺口，但未落入以上分類。"],
};

export default async function HealthPage(){
  const feed=await getFeed(); const now=Date.now(); const matches=feed.matches||[];
  const missingRows=matches.filter(m=>m.health?.primaryMissingReason);
  const classes=missingRows.reduce((a,m)=>{const k=missingClass(m)||"OTHER";a[k]=(a[k]||0)+1;return a;},{});
  const stats={
    total:matches.length,
    modeled:matches.filter(m=>modelCoverageCount(m)>0).length,
    forebet:matches.filter(m=>m.forebet).length,
    multisource:matches.filter(m=>m.multi).length,
    stale:matches.filter(m=>freshness(m,now).key==="stale").length,
    missing:missingRows.length,
  };
  return <main className="shell detail-shell">
    <div className="detail-top"><Link href="/" className="back">← 賽事</Link><span>Phase 1 · canonical health</span></div>
    <section className="detail-hero"><p className="eyebrow">FAST TRACKER 2026</p><h1>Data Health</h1><p>Canonical database狀態。Source真係冇model，同system未完成capture/matching會分開顯示。</p></section>
    <section className="health-strip"><div><b>{stats.total}</b><span>24H HKJC</span></div><div><b>{stats.modeled}</b><span>有模型</span></div><div><b>{stats.forebet}</b><span>Forebet</span></div><div><b>{stats.multisource}</b><span>Multi-source</span></div></section>
    <section className="panel"><div className="panel-title"><div><p>QUALITY</p><h2>Coverage</h2></div><span>{feed.source}</span></div>
      <div className="health-list"><div><span>過時資料</span><b>{stats.stale}</b></div><div><span>缺 evidence</span><b>{stats.missing}</b></div><div><span>Source已check但冇model</span><b>{(classes.SOURCE_NO_MODEL||0)+(classes.SOURCE_FIXTURE_ONLY||0)}</b></div><div><span>Capture/check待完成</span><b>{classes.CAPTURE_OR_CHECK_PENDING||0}</b></div><div><span>Matching需覆核</span><b>{classes.MATCHING_REVIEW||0}</b></div><div><span>Feed window</span><b>{feed.windowHours}h</b></div><div><span>Generated</span><b>{new Date(feed.generatedAt).toLocaleTimeString("zh-HK",{timeZone:"Asia/Hong_Kong",hour:"2-digit",minute:"2-digit"})}</b></div></div>
    </section>
    {missingRows.length>0&&<section className="panel"><div className="panel-title"><div><p>GAPS</p><h2>缺資料賽事</h2></div><span>{missingRows.length}</span></div>
      {Object.entries(classMeta).map(([key,[label,note]])=>{const rows=missingRows.filter(m=>missingClass(m)===key);if(!rows.length)return null;return <div key={key} style={{marginTop:"18px"}}><div className="panel-title"><div><p>{key}</p><h2 style={{fontSize:"18px"}}>{label}</h2><small>{note}</small></div><span>{rows.length}</span></div><div className="health-list">{rows.map(m=><div key={m.id}><span>{m.homeZh||m.home} vs {m.awayZh||m.away}<small style={{display:"block"}}>{m.id} · {m.health?.primaryMissingReason||"NO DATA"}</small></span><b>{m.health?.forebetState||"NOT CHECKED"}</b></div>)}</div></div>})}
    </section>}
    <section className="panel"><div className="panel-title"><div><p>POLICY</p><h2>Phase 1 safeguards</h2></div></div><p className="fineprint">HKJC係 betting universe。缺 source 就顯示 NO DATA；stale唔當current；未check同source無model唔會混為一談；Decision engine保持validation-gated，未有足夠校準唔輸出正式投注指令。</p></section>
  </main>;
}
