import MatchCard from "@/components/match-card";
import {
  dataAgeMinutes,
  divergence,
  freshness,
  getFeed,
  modelCoverageCount,
  reviewScore,
} from "@/lib/fast-tracker";

const filters = [
  ["focus", "焦點"],
  ["all", "全部"],
  ["gaps", "Edge"],
  ["missing", "缺資料"],
  ["stale", "過時"],
];

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const requestedFilter = params?.filter || "focus";
  const filter = filters.some(([key]) => key === requestedFilter) ? requestedFilter : "focus";
  const feed = await getFeed();
  const all = feed.matches;
  const nowMs = Date.now();

  const byFocus = [...all].sort((a, b) => {
    const scoreDelta = reviewScore(b, nowMs) - reviewScore(a, nowMs);
    if (scoreDelta) return scoreDelta;
    return new Date(a.kickoff) - new Date(b.kickoff);
  });

  let matches = byFocus;
  if (filter === "all") matches = [...all].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (filter === "gaps") {
    matches = all.filter((m) => divergence(m))
      .sort((a, b) => Math.abs(divergence(b).value) - Math.abs(divergence(a).value));
  }
  if (filter === "missing") {
    matches = all.filter((m) => modelCoverageCount(m) === 0)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  }
  if (filter === "stale") {
    matches = all.filter((m) => freshness(m, nowMs).key === "stale")
      .sort((a, b) => dataAgeMinutes(b, nowMs) - dataAgeMinutes(a, nowMs));
  }

  const modeled = all.filter((m) => modelCoverageCount(m) > 0).length;
  const missing = all.filter((m) => modelCoverageCount(m) === 0).length;
  const stale = all.filter((m) => freshness(m, nowMs).key === "stale").length;
  const valueCandidates = all.filter((m) => {
    const gap = divergence(m);
    return gap && Math.abs(gap.value) >= 0.05;
  }).length;
  const isLive = feed.source === "supabase-canonical-live";
  const focusMatches = byFocus
    .filter((m) => divergence(m) && modelCoverageCount(m) > 0)
    .slice(0, 7);

  const headings = {
    focus: ["LIVE + NEXT 24H", "先睇 Value，再睇模型細節"],
    all: ["Upcoming 24H", "按開賽時間排序"],
    gaps: ["Edge 候選", "按模型與 HKJC 市場差異排序"],
    missing: ["缺資料", "HKJC 有盤但暫時未有外部模型"],
    stale: ["過時資料", "超過 6 小時未更新"],
  };

  return (
    <main className="shell">
      <header className="hero compact-hero">
        <div>
          <p className="eyebrow">FAST TRACK 2026</p>
          <h1>Betting Board</h1>
          <p className="subtitle">HKJC 24H · HDA / 入球 / 角球 · 先睇 Edge，再睇 evidence</p>
        </div>
        <span className={`preview-badge ${isLive ? "live-badge" : ""}`}>
          {isLive ? "LIVE SQL" : "FALLBACK"}
        </span>
      </header>

      <section className="board-stats">
        <div><span>24H 賽事</span><b>{all.length}</b></div>
        <div><span>Value 候選</span><b>{valueCandidates}</b></div>
        <div><span>有模型</span><b>{modeled}</b></div>
        <div className={missing || stale ? "health-warn" : ""}>
          <span>資料提醒</span><b>{missing + stale}</b>
        </div>
      </section>

      {focusMatches.length > 0 ? (
        <section className="focus-zone">
          <div className="focus-zone-head">
            <div>
              <span>BEST BETS · VALUE SHORTLIST</span>
              <h2>最值得先睇</h2>
            </div>
            <p>重點：市場 / Edge / Odds / 預測比分 / 入球 / 角球</p>
          </div>
          <div className="focus-list">
            {focusMatches.map((match, index) => (
              <MatchCard key={match.id} match={match} nowMs={nowMs} focusRank={index + 1} />
            ))}
          </div>
        </section>
      ) : null}

      <nav className="filters sticky-filters">
        {filters.map(([key, label]) => (
          <a key={key} className={filter === key ? "active" : ""} href={key === "focus" ? "/" : `/?filter=${key}`}>
            {label}
          </a>
        ))}
      </nav>

      <section className="section-head">
        <div>
          <h2>{headings[filter]?.[0] || headings.focus[0]}</h2>
          <p>{matches.length} 場 · 香港時間</p>
        </div>
        <span>{headings[filter]?.[1] || headings.focus[1]}</span>
      </section>

      <div className="match-list">
        {matches.map((match) => <MatchCard key={match.id} match={match} nowMs={nowMs} />)}
      </div>

      <footer className="bottom-nav">
        <a className="selected" href="/">賽事</a>
        <span>Live</span>
        <span>模型</span>
        <a href="/health">系統</a>
      </footer>
    </main>
  );
}
