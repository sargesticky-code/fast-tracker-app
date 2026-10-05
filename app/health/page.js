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
  const routeGuard=heartbeats.FRONTEND_ROUTE_GUARD||{};
  const routeGuardRaw=routeGuard.raw||{};
  const routeCurrentCount=Number(routeGuardRaw.current_feed_count??matches.length);
  const routeUnresolved=Array.isArray(routeGuardRaw.unresolved_ids)?routeGuardRaw.unresolved_ids:[];
  const sourceContextCoverage={
    matched:matches.filter(m=>m.sourceContext && Number(m.sourceContext.matchConfidence)>=0.94).length,
    detail:matches.filter(m=>m.sourceContext?.detailAvailable).length,
    lineup:matches.filter(m=>m.sourceContext?.lineupAvailable).length,
  };
  const statusIcon=(status)=>{
    const s=String(status||"").toUpperCase();
    if(["OK","SUCCESS","HEALTHY","FRESH","READY"].some(x=>s.includes(x))) return "🟢";
    if(["WARN","STALE","PARTIAL","PENDING"].some(x=>s.includes(x))) return "🟡";
    if(["FAIL","ERROR","DOWN","BLOCK"].some(x=>s.includes(x))) return "🔴";
    return "⚪";
  };
  const coverageBar=(value,total)=>{
    const pct=total>0?Math.max(0,Math.min(100,Math.round(value/total*100))):0;
    return <span style={{display:"inline-flex",alignItems:"center",gap:7,minWidth:120}}><i style={{display:"inline-block",width:70,height:8,borderRadius:99,overflow:"hidden",background:"#e7ece9"}}><i style={{display:"block",height:"100%",width:pct+"%",background:pct>=80?"#2f9e62":pct>=50?"#d6a11d":"#d65b5b"}} /></i><b>{pct}%</b></span>;
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
    <div className="detail-top"><Link href="/" className="back">← 返回賽事</Link><span>後台 · 系統狀態</span></div>
    <section className="detail-hero"><p className="eyebrow">FAST TRACKER 2026 · 後台</p><h1>系統狀態</h1><p>集中睇資料有冇更新、預測覆蓋同需要處理嘅問題。前台唔再顯示呢啲技術資訊。</p></section>
    <section className="health-strip"><div><b>🗓 {upcoming.length}</b><span>未開賽</span></div><div><b>● {live.length}</b><span>即場</span></div><div><b>✓ {stats.modeled}</b><span>有預測</span></div><div><b>{stats.missing>0?"🟡":"🟢"} {stats.missing}</b><span>需留意</span></div></section>
    <section className="panel"><div className="panel-title"><div><p>資料更新</p><h2>主要資料來源</h2></div><span>自動更新</span></div>
      <div className="health-list">
        <div><span>Bet365 feed<small style={{display:"block"}}>Cloud Flashscore/Bet365 ingest heartbeat</small></span><b>{heartbeatAge("FLASHSCORE_BET365")}</b></div>
        <div><span>Bet365 live odds<small style={{display:"block"}}>Cloud Bet365 prematch/reference prices</small></span><b>{heartbeatAge("FLASHSCORE_BET365")}</b></div>
        <div><span>即場比分及數據<small style={{display:"block"}}>1-min score sync · detail stats last-good preserved</small></span><b>{heartbeatAge("LIVE_SCORE_EDGE")}</b></div>
        <div><span>即場資料檢查<small style={{display:"block"}}>odds/score 3m · stats/shadow 10m</small></span><b>{statusIcon(heartbeats.LIVE_LAYER_GUARD?.status)} {heartbeats.LIVE_LAYER_GUARD?.status || "—"} · {heartbeatAge("LIVE_LAYER_GUARD")}</b></div>
        <div><span>即場資料服務<small style={{display:"block"}}>expected build vs production host</small></span><b>{statusIcon(heartbeats.LIVE_UPSTREAM_DEPLOY?.status)} {heartbeats.LIVE_UPSTREAM_DEPLOY?.status || "—"} · {heartbeats.LIVE_UPSTREAM_DEPLOY?.value || "—"}</b></div>
        <div><span>備用即場資料<small style={{display:"block"}}>native fixture identity prewarm · 2-min cadence</small></span><b>{statusIcon(heartbeats.LIVE_SOURCE_SHADOW?.status)} {heartbeats.LIVE_SOURCE_SHADOW?.status || "—"} · {heartbeats.LIVE_SOURCE_SHADOW?.value || "—"}</b></div>
        <div><span>即場資料比對<small style={{display:"block"}}>coverage · score · source ID · minute drift · detail</small></span><b>{statusIcon(heartbeats.LIVE_SHADOW_COMPARE?.status)} {heartbeats.LIVE_SHADOW_COMPARE?.status || "—"} · {heartbeats.LIVE_SHADOW_COMPARE?.value || "—"}</b></div>
        <div><span>賽事配對<small style={{display:"block"}}>verified source-match registry</small></span><b>{statusIcon(heartbeats.PHASE3_IDENTITY_REGISTRY?.status)} {heartbeats.PHASE3_IDENTITY_REGISTRY?.status || "—"} · {heartbeats.PHASE3_IDENTITY_REGISTRY?.value || "—"}</b></div>
        <div><span>頁面連結檢查<small style={{display:"block"}}>全 current feed resolver + representative detail/legacy probes</small></span><b>{statusIcon(routeGuard.status)} {routeGuard.status || "—"} · {routeCurrentCount-routeUnresolved.length}/{routeCurrentCount} 正常 · {heartbeatAge("FRONTEND_ROUTE_GUARD")}</b></div>
      </div>
    </section>
    <section className="panel"><div className="panel-title"><div><p>市場資料</p><h2>24小時資料覆蓋</h2></div><span>{stats.total} 場</span></div>
      <div className="health-list"><div><span>⚽ 預測比分</span><b>{coverageBar(coverage.score,stats.total)}</b></div><div><span>↕ 入球大細</span><b>{coverageBar(coverage.goals,stats.total)}</b></div><div><span>🚩 角球大細</span><b>{coverageBar(coverage.corners,stats.total)}</b></div><div><span>◎ 多來源預測</span><b>{coverageBar(coverage.multi,stats.total)}</b></div><div><span>Goals 可直接比較 / Line mismatch</span><b>{lineStatus.goalsComparable} / {lineStatus.goalsMismatch}</b></div><div><span>Corners 可直接比較 / Line mismatch</span><b>{lineStatus.cornersComparable} / {lineStatus.cornersMismatch}</b></div></div>
    </section>
    <section className="panel"><div className="panel-title"><div><p>預測來源</p><h2>模型資料狀態</h2></div><span>{matches.length} 場</span></div>
      <div className="health-list">
        <div><span>Forebet<small style={{display:"block"}}>Model / Fixture only / Source absent</small></span><b>{sourceCoverage.forebet.model} / {sourceCoverage.forebet.fixture} / {sourceCoverage.forebet.absent}</b></div>
        <div><span>DC / Pi<small style={{display:"block"}}>Model / Fail-closed / Identity block</small></span><b>{sourceCoverage.dcpi.model} / {sourceCoverage.dcpi.fail} / {sourceCoverage.dcpi.identity}</b></div>
        <div><span>Team-Form<small style={{display:"block"}}>Model / Insufficient / Identity block</small></span><b>{sourceCoverage.form.model} / {sourceCoverage.form.insufficient} / {sourceCoverage.form.identity}</b></div>
        <div><span>Multi-source<small style={{display:"block"}}>Available / No matched source / No consensus</small></span><b>{sourceCoverage.multi.model} / {sourceCoverage.multi.noMatch} / {sourceCoverage.multi.noConsensus}</b></div>
        <div><span>External context fallback<small style={{display:"block"}}>FotMob exact/verified fixture · Detail · Lineup</small></span><b>{sourceContextCoverage.matched} / {sourceContextCoverage.detail} / {sourceContextCoverage.lineup}</b></div>
      </div>
    </section>
    <section className="panel"><div className="panel-title"><div><p>資料質素</p><h2>需要處理</h2></div><span>後台</span></div>
      <div className="health-list"><div><span>過時資料</span><b>{stats.stale}</b></div><div><span>缺 evidence</span><b>{stats.missing}</b></div><div><span>Source已check但冇model</span><b>{(classes.SOURCE_NO_MODEL||0)+(classes.SOURCE_FIXTURE_ONLY||0)}</b></div><div><span>Source / scan不可用</span><b>{classes.SOURCE_UNAVAILABLE||0}</b></div><div><span>Capture/check待完成</span><b>{classes.CAPTURE_OR_CHECK_PENDING||0}</b></div><div><span>Matching需覆核</span><b>{classes.MATCHING_REVIEW||0}</b></div><div><span>Feed window</span><b>{feed.windowHours}h</b></div><div><span>Generated</span><b>{new Date(feed.generatedAt).toLocaleTimeString("zh-HK",{timeZone:"Asia/Hong_Kong",hour:"2-digit",minute:"2-digit"})}</b></div></div>
    </section>
    {gapRows.length>0&&<section className="panel"><div className="panel-title"><div><p>待處理</p><h2>資料未完整賽事</h2></div><span>{gapRows.length}</span></div>
      <div className="health-list">{gapRows.map(m=><div key={m.id}><span>{m.homeZh||m.home} vs {m.awayZh||m.away}<small style={{display:"block"}}>{m.id} · FB {m.health?.forebetCoverageStatus||"—"} · DC/PI {m.health?.dcPiCoverageStatus||"—"} · FORM {m.health?.formCoverageStatus||"—"} · MULTI {m.health?.multisourceCoverageStatus||"—"}{m.sourceContext ? ` · CTX ${m.sourceContext.source} ${Math.round(Number(m.sourceContext.matchConfidence||0)*100)}%` : ""}</small></span><b>{unifiedCoverageStatus(m)}</b></div>)}</div>
    </section>}
    <section className="panel"><div className="panel-title"><div><p>系統原則</p><h2>資料保護</h2></div></div><p className="fineprint">Bet365 is the active bookmaker feed. 資料不足會清楚標示，不會用舊資料扮最新資料；來源未確認時亦不會自行補假數據。詳細技術狀態保留喺後台供排錯使用。</p></section>
  </main>;
}
