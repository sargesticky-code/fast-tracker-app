import Link from "next/link";
import { getFeed, modelCoverageCount, freshness, lineComparisonStatus, unifiedCoverageStatus } from "@/lib/fast-tracker";

function missingClass(match){
  const h=match.health||{};
  const reason=String(h.forebetReason||h.primaryMissingReason||"").toLowerCase();
  if(h.forebetState==="FIXTURE_ONLY") return "SOURCE_FIXTURE_ONLY";
  if(reason.includes("alias_near_miss") || reason.includes("name_candidate") || reason.includes("match_policy_review")) return "MATCHING_REVIEW";
  if(reason.includes("source_surface_unavailable") || reason.includes("target_missing_from_forebet_scan_output")) return "SOURCE_UNAVAILABLE";
  if(reason.includes("fixture_absent_from_fetched_model_surfaces") || reason.includes("published_without_usable_model")) return "SOURCE_NO_MODEL";
  if(!h.forebetState || h.forebetCheckFreshness==="STALE") return "CAPTURE_OR_CHECK_PENDING";
  if(h.forebetState==="UNRESOLVED" && h.forebetCheckFreshness==="FRESH") return "SOURCE_NO_MODEL";
  if(h.diagnostics?.some(x=>String(x).includes("ALIAS_NOT_REGISTERED"))) return "MATCHING_REVIEW";
  if(!h.primaryMissingReason && h.forebetState==="MODEL") return null;
  return "OTHER";
}

const classMeta={
  SOURCE_FIXTURE_ONLY:["Source有賽事、冇預測","Forebet曾見到賽事，但冇prediction model。"],
  SOURCE_NO_MODEL:["Source已check、冇model","Forebet可用surface已檢查，但冇見到可用model；唔會用假數據補洞。"],
  SOURCE_UNAVAILABLE:["Source / scan不可用","Forebet surface被擋、未發布，或target未出現於本輪scan；同alias問題分開。"],
  CAPTURE_OR_CHECK_PENDING:["Capture / check待完成","尚未完成檢查，或者check已過時；屬pipeline待處理。"],
  MATCHING_REVIEW:["Matching需覆核","Source有線索，但球隊alias / matching需要人工驗證。"],
  OTHER:["其他資料缺口","有缺口，但未落入以上分類。"],
};

export default async function HealthPage(){
  const feed=await getFeed(); const now=Date.now(); const matches=feed.matches||[];
  const gapRows=matches.filter(m=>!m.liveNow && unifiedCoverageStatus(m)!=="DATA_RICH");
  const missingRows=matches.filter(m=>m.health?.primaryMissingReason);
  const classes=missingRows.reduce((a,m)=>{const k=missingClass(m)||"OTHER";a[k]=(a[k]||0)+1;return a;},{});
  const sourceCount=(field,value)=>matches.filter(m=>m.health?.[field]===value).length;
  const sourceCoverage={
    forebet:{
      model:sourceCount("forebetCoverageStatus","MODEL_AVAILABLE"),
      fixture:sourceCount("forebetCoverageStatus","FIXTURE_ONLY"),
      absent:sourceCount("forebetCoverageStatus","SOURCE_ABSENT"),
      unresolved:sourceCount("forebetCoverageStatus","UNRESOLVED"),
    },
    dcpi:{
      model:sourceCount("dcPiCoverageStatus","MODEL_AVAILABLE"),
      fail:sourceCount("dcPiCoverageStatus","MODEL_FAIL_CLOSED"),
      identity:sourceCount("dcPiCoverageStatus","IDENTITY_BLOCK"),
      noRow:sourceCount("dcPiCoverageStatus","NO_SOURCE_ROW"),
    },
    form:{
      model:sourceCount("formCoverageStatus","MODEL_AVAILABLE"),
      insufficient:sourceCount("formCoverageStatus","FORM_INSUFFICIENT"),
      identity:sourceCount("formCoverageStatus","IDENTITY_BLOCK"),
      noRow:sourceCount("formCoverageStatus","NO_SOURCE_ROW"),
    },
    multi:{
      model:sourceCount("multisourceCoverageStatus","MULTISOURCE_AVAILABLE"),
      noMatch:sourceCount("multisourceCoverageStatus","NO_MATCHED_SOURCE"),
      noConsensus:sourceCount("multisourceCoverageStatus","NO_CONSENSUS"),
      noRow:sourceCount("multisourceCoverageStatus","NO_SOURCE_ROW"),
    },
  };
  const coverage={
    score:matches.filter(m=>m.forebetDetail?.predictedScore || m.forebet?.predictedScore).length,
    goals:matches.filter(m=>
      m.forebetDetail?.ou25?.over!=null ||
      m.forebetDetail?.ou25?.under!=null ||
      m.forebetDetail?.ou25?.avgGoals!=null ||
      m.forebetDetail?.avgGoals!=null ||
      m.multi?.over25!=null ||
      m.multi?.under25!=null
    ).length,
    corners:matches.filter(m=>
      m.forebetDetail?.corners95?.over!=null ||
      m.forebetDetail?.corners95?.under!=null ||
      m.forebetDetail?.corners95?.avgCorners!=null ||
      m.forebetDetail?.avgCorners!=null
    ).length,
    multi:matches.filter(m=>m.multi && ((m.multi.sources||m.multi.sourceCount||0)>0 || m.multi.over25!=null || m.multi.bttsYes!=null)).length,
  };
  const upcoming=matches.filter(m=>!m.liveNow);
  const live=matches.filter(m=>m.liveNow);
  const lineStatus={
    goalsComparable:upcoming.filter(m=>lineComparisonStatus(m,"goals").comparable).length,
    goalsMismatch:upcoming.filter(m=>lineComparisonStatus(m,"goals").key==="mismatch").length,
    cornersComparable:upcoming.filter(m=>lineComparisonStatus(m,"corners").comparable).length,
    cornersMismatch:upcoming.filter(m=>lineComparisonStatus(m,"corners").key==="mismatch").length,
  };
  const heartbeats=feed.systemHealth||{};
  const heartbeatAge=(key)=>{
    const t=heartbeats[key]?.observedAt ? new Date(heartbeats[key].observedAt).getTime() : NaN;
    if(!Number.isFinite(t)) return "—";
    const mins=Math.max(0,Math.round((now-t)/60000));
    return mins<2 ? "剛更新" : mins<60 ? `${mins}m` : `${Math.round(mins/60)}h`;
  };
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
    <section className="health-strip"><div><b>{upcoming.length}</b><span>Upcoming</span></div><div><b>{live.length}</b><span>Live</span></div><div><b>{stats.forebet}</b><span>Forebet</span></div><div><b>{stats.multisource}</b><span>Multi-source</span></div></section>
    <section className="panel"><div className="panel-title"><div><p>HEARTBEAT</p><h2>Direct data pipelines</h2></div><span>自動更新</span></div>
      <div className="health-list">
        <div><span>HKJC Upcoming authority<small style={{display:"block"}}>15-min direct official snapshot</small></span><b>{heartbeatAge("HKJC_UPCOMING_EDGE")}</b></div>
        <div><span>HKJC Live odds<small style={{display:"block"}}>5-min direct official capture</small></span><b>{heartbeatAge("HKJC_LIVE_EDGE")}</b></div>
        <div><span>Live score / stats<small style={{display:"block"}}>5-min score + xG/stat layer</small></span><b>{heartbeatAge("LIVE_SCORE_EDGE")}</b></div>
      </div>
    </section>
    <section className="panel"><div className="panel-title"><div><p>MARKETS</p><h2>24H Intelligence Coverage</h2></div><span>{stats.total} matches</span></div>
      <div className="health-list"><div><span>Forebet predicted score</span><b>{coverage.score}/{stats.total}</b></div><div><span>Goals O/U evidence</span><b>{coverage.goals}/{stats.total}</b></div><div><span>Corners evidence</span><b>{coverage.corners}/{stats.total}</b></div><div><span>Multi-source evidence</span><b>{coverage.multi}/{stats.total}</b></div><div><span>Goals 可直接比較 / Line mismatch</span><b>{lineStatus.goalsComparable} / {lineStatus.goalsMismatch}</b></div><div><span>Corners 可直接比較 / Line mismatch</span><b>{lineStatus.cornersComparable} / {lineStatus.cornersMismatch}</b></div></div>
    </section>
    <section className="panel"><div className="panel-title"><div><p>MODEL SOURCES</p><h2>真實 source coverage</h2></div><span>{matches.length} matches</span></div>
      <div className="health-list">
        <div><span>Forebet<small style={{display:"block"}}>Model / Fixture only / Source absent</small></span><b>{sourceCoverage.forebet.model} / {sourceCoverage.forebet.fixture} / {sourceCoverage.forebet.absent}</b></div>
        <div><span>DC / Pi<small style={{display:"block"}}>Model / Fail-closed / Identity block</small></span><b>{sourceCoverage.dcpi.model} / {sourceCoverage.dcpi.fail} / {sourceCoverage.dcpi.identity}</b></div>
        <div><span>Team-Form<small style={{display:"block"}}>Model / Insufficient / Identity block</small></span><b>{sourceCoverage.form.model} / {sourceCoverage.form.insufficient} / {sourceCoverage.form.identity}</b></div>
        <div><span>Multi-source<small style={{display:"block"}}>Available / No matched source / No consensus</small></span><b>{sourceCoverage.multi.model} / {sourceCoverage.multi.noMatch} / {sourceCoverage.multi.noConsensus}</b></div>
      </div>
    </section>
    <section className="panel"><div className="panel-title"><div><p>QUALITY</p><h2>Coverage</h2></div><span>{feed.source}</span></div>
      <div className="health-list"><div><span>過時資料</span><b>{stats.stale}</b></div><div><span>缺 evidence</span><b>{stats.missing}</b></div><div><span>Source已check但冇model</span><b>{(classes.SOURCE_NO_MODEL||0)+(classes.SOURCE_FIXTURE_ONLY||0)}</b></div><div><span>Source / scan不可用</span><b>{classes.SOURCE_UNAVAILABLE||0}</b></div><div><span>Capture/check待完成</span><b>{classes.CAPTURE_OR_CHECK_PENDING||0}</b></div><div><span>Matching需覆核</span><b>{classes.MATCHING_REVIEW||0}</b></div><div><span>Feed window</span><b>{feed.windowHours}h</b></div><div><span>Generated</span><b>{new Date(feed.generatedAt).toLocaleTimeString("zh-HK",{timeZone:"Asia/Hong_Kong",hour:"2-digit",minute:"2-digit"})}</b></div></div>
    </section>
    {gapRows.length>0&&<section className="panel"><div className="panel-title"><div><p>GAPS</p><h2>Coverage未完整賽事</h2></div><span>{gapRows.length}</span></div>
      <div className="health-list">{gapRows.map(m=><div key={m.id}><span>{m.homeZh||m.home} vs {m.awayZh||m.away}<small style={{display:"block"}}>{m.id} · FB {m.health?.forebetCoverageStatus||"—"} · DC/PI {m.health?.dcPiCoverageStatus||"—"} · FORM {m.health?.formCoverageStatus||"—"} · MULTI {m.health?.multisourceCoverageStatus||"—"}</small></span><b>{unifiedCoverageStatus(m)}</b></div>)}</div>
    </section>}
    <section className="panel"><div className="panel-title"><div><p>POLICY</p><h2>Phase 1 safeguards</h2></div></div><p className="fineprint">HKJC係 betting universe。缺 source 就顯示 NO DATA；stale唔當current；未check同source無model唔會混為一談；Decision engine保持validation-gated，未有足夠校準唔輸出正式投注指令。</p></section>
  </main>;
}
