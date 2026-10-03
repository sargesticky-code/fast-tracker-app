"use client";

import { normalizeMarketQuote, PROVIDERS } from "@/lib/market-provider-contract";

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
}

function safe(value, fallback = "Unknown") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function price(value) {
  const x = n(value);
  return x === null ? "Unknown" : x.toFixed(2);
}

function dateTime(value) {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " HKT";
}

function currentQuote(match, analysis, story) {
  const decision = analysis?.decision || {};
  const oddsStatuses = [
    story?.bettingAdvice?.oddsStatus,
    decision.oddsStatus,
  ].map((value) => String(value || "").toUpperCase()).filter(Boolean);
  const sourceModes = [
    story?.governance?.sourceMode,
    analysis?.governance?.sourceMode,
    analysis?.evidence?.phase1Health?.sourceMode,
  ].map((value) => String(value || "").toUpperCase()).filter(Boolean);
  // Fail closed if any authoritative layer marks the price stale/reference-only.
  const stale = oddsStatuses.some((value) => value.includes("STALE"))
    || sourceModes.some((value) => value.includes("FALLBACK"));
  const side = decision.selection || null;
  const fallback =
    side === "H" ? match?.odds?.home :
    side === "D" ? match?.odds?.draw :
    side === "A" ? match?.odds?.away : null;
  const observedAt =
    analysis?.evidence?.phase1Health?.oddsUpdatedAt ||
    match?.oddsUpdatedAt ||
    match?.updatedAt ||
    analysis?.generatedAt ||
    null;

  return {
    stale,
    quote: normalizeMarketQuote({
      canonicalMatchId: match?.id,
      providerKey: "HKJC",
      market: decision.market || "HDA",
      selection: side,
      line: decision.line ?? null,
      decimalPrice: stale ? null : (decision.currentOdds ?? fallback),
      observedAt,
      status: stale ? "STALE_OR_REFERENCE" : (decision.currentOdds ?? fallback) == null ? "UNKNOWN" : "OBSERVED",
    }),
  };
}

function lineupState(deep) {
  const eventMap = deep?.humanFactors?.eventMap || null;
  const rows = Array.isArray(deep?.humanFactors?.lineup) ? deep.humanFactors.lineup : [];
  if (eventMap?.lineup_confirmed_at) return ["CONFIRMED", "Confirmed lineup"];
  if (rows.length) {
    const confirmed = rows.filter((row) => row?.confirmed === true).length;
    const unconfirmed = rows.filter((row) => row?.confirmed !== true).length;
    if (confirmed > 0 && unconfirmed === 0) return ["CONFIRMED", "Confirmed lineup"];
    return ["PREDICTED", "Predicted / provisional lineup"];
  }
  if (eventMap) return ["PENDING", "Lineup pending"];
  return ["UNKNOWN", "Lineup evidence unavailable"];
}

function sampleRows(deep) {
  const rows = [];
  const h2h = deep?.h2h || deep?.headToHead || null;
  const games = n(h2h?.h2h_games);
  if (games !== null && games > 0) {
    rows.push(["Head-to-head", games + " verified meetings", safe(h2h?.source, "Stored H2H evidence")]);
  }

  const form = deep?.models?.form || null;
  if (form) {
    const hg = n(form.home_games);
    const ag = n(form.away_games);
    const hvg = n(form.home_venue_games);
    const avg = n(form.away_venue_games);
    let value = hg === null && ag === null ? "Sample size unavailable" : "Home " + (hg ?? "unknown") + " / Away " + (ag ?? "unknown") + " matches";
    if (hvg !== null || avg !== null) value += " · venue " + (hvg ?? "unknown") + "/" + (avg ?? "unknown");
    rows.push(["Team form sample", value, safe(form.model_source, "Team Form model")]);
  }

  const internal = deep?.models?.internal || null;
  if (internal) {
    const training = n(internal.training_matches);
    rows.push(["Internal model sample", training === null ? "Training sample unavailable" : training + " historical matches", safe(internal.model_source, "Dixon-Coles / Pi")]);
  }
  return rows;
}

function playerRows(deep) {
  const rows = Array.isArray(deep?.humanFactors?.playerStatus) ? deep.humanFactors.playerStatus : [];
  return rows.slice(0, 10).map((row, index) => ({
    key: String(row.player_key || row.player_name || "player") + "-" + index,
    player: safe(row.player_name || row?.raw?.player?.name || row?.raw?.player_name || row.player_key),
    side: safe(row.team_side, "Team unknown"),
    status: safe(row.status_value || row.status_type, "Status unknown"),
    confirmed: row.confirmed === true ? "Confirmed" : row.confirmed === false ? "Unconfirmed" : "Confirmation unknown",
    source: safe(row.source_name || row.source, "Source not recorded"),
  }));
}

export default function EvidenceArticle({ match, deep, analysis, story }) {
  if (!match) return null;

  const body = story?.story || null;
  const decision = analysis?.decision || {};
  const quoteState = currentQuote(match, analysis, story);
  const quote = quoteState.quote;
  const action = safe(decision.action, "WATCH").toUpperCase();
  const candidate = safe(decision.candidateClass, "UNAVAILABLE").toUpperCase();
  const unavailable = quoteState.stale || ["NO_BET", "PASS"].includes(action) || ["DATA_RISK", "NO_MODEL", "NO_EDGE"].includes(candidate);

  const home = safe(match.home || match.homeEn || match.homeZh, "Home");
  const away = safe(match.away || match.awayEn || match.awayZh, "Away");
  const headline = body?.headline || home + " vs " + away + ": evidence-based match analysis";
  const conclusion = body?.thesis || (unavailable
    ? "No actionable recommendation is supported by the current verified evidence."
    : "The current evidence supports a watchlist candidate, subject to price and data freshness.");

  const lineup = lineupState(deep);
  const lineups = Array.isArray(deep?.humanFactors?.lineup) ? deep.humanFactors.lineup : [];
  const confirmedLineups = lineups.filter((row) => row.confirmed === true).length;
  const provisionalLineups = lineups.filter((row) => row.confirmed !== true).length;
  const players = playerRows(deep);
  const facts = sampleRows(deep);
  const form = deep?.models?.form || null;
  const forebet = deep?.models?.forebet || null;
  const invalidators = Array.isArray(story?.invalidators) && story.invalidators.length
    ? story.invalidators
    : Array.isArray(analysis?.invalidators) ? analysis.invalidators : [];

  return (
    <article className="ft-evidence-article" id="analysis">
      <header className="ft-article-header">
        <div>
          <p>FAST TRACKER MATCH ANALYSIS</p>
          <h2>{headline}</h2>
          <span>{safe(match.leagueEn || match.league || match.leagueZh, "Football")} · {dateTime(match.kickoff)}</span>
        </div>
        <div className={"ft-article-state " + (unavailable ? "is-watch" : "is-candidate")}>
          <b>{unavailable ? "WATCH / SKIP" : candidate.replaceAll("_", " ")}</b>
          <small>{quoteState.stale ? "Stale or reference-only price" : "Evidence-gated recommendation"}</small>
        </div>
      </header>

      {quoteState.stale ? (
        <div className="ft-article-alert">
          <strong>Stale-price protection is active.</strong>
          <span>The narrative may explain the evidence, but the recommendation is not actionable until a fresh market observation is available.</span>
        </div>
      ) : null}

      <section className="ft-article-summary">
        <h3>Conclusion</h3>
        <p>{conclusion}</p>
        {body?.executiveSummary ? <p>{body.executiveSummary}</p> : null}
      </section>

      <section className="ft-article-grid">
        <div><span>Bookmaker</span><strong>{quote.providerLabel || PROVIDERS.HKJC.label}</strong><small>{quote.providerKind || "BOOKMAKER"}</small></div>
        <div><span>Market / selection</span><strong>{safe(quote.market)} · {safe(quote.selection)}</strong><small>{quote.line === null ? "Line not applicable / unknown" : "Line " + quote.line}</small></div>
        <div><span>Observed price</span><strong>{quoteState.stale ? "Not current" : price(quote.decimalPrice)}</strong><small>As of {dateTime(quote.observedAt)}</small></div>
        <div><span>Decision state</span><strong>{action.replaceAll("_", " ")}</strong><small>{candidate.replaceAll("_", " ")}</small></div>
      </section>

      <section className="ft-article-columns">
        <div>
          <h3>Verified context and samples</h3>
          {facts.length ? facts.map((row) => (
            <div className="ft-article-evidence-row" key={row[0]}>
              <span>{row[0]}</span><strong>{row[1]}</strong><small>Source: {row[2]}</small>
            </div>
          )) : <p className="ft-article-unknown">No verified sample-size context is available for this match.</p>}

          {forebet ? (
            <div className="ft-article-evidence-row">
              <span>Prediction-provider evidence</span>
              <strong>{forebet.predicted_score ? "Forebet predicted score " + forebet.predicted_score : "Forebet prediction available"}</strong>
              <small>{forebet.avg_goals == null ? "Average-goals estimate unavailable" : "Model average-goals estimate " + Number(forebet.avg_goals).toFixed(2)}</small>
            </div>
          ) : null}

          {form && (form.form_xg_home != null || form.form_xg_away != null) ? (
            <div className="ft-article-evidence-row">
              <span>Model expected goals</span>
              <strong>{price(form.form_xg_home)} – {price(form.form_xg_away)}</strong>
              <small>This is a Team Form model estimate, not observed xG.</small>
            </div>
          ) : null}
        </div>

        <div>
          <h3>Lineups and player availability</h3>
          <div className={"ft-lineup-state ft-lineup-" + lineup[0].toLowerCase()}>
            <strong>{lineup[1]}</strong>
            <span>{lineups.length ? confirmedLineups + " confirmed rows · " + provisionalLineups + " provisional/unconfirmed rows" : "No lineup rows are currently available"}</span>
          </div>
          {players.length ? players.map((row) => (
            <div className="ft-article-evidence-row" key={row.key}>
              <span>{row.side} · {row.player}</span><strong>{row.status}</strong><small>{row.confirmed} · Source: {row.source}</small>
            </div>
          )) : (
            <p className="ft-article-unknown">No verified player-status evidence is currently available. This is unknown coverage, not zero injuries.</p>
          )}
        </div>
      </section>

      <section className="ft-article-columns">
        <div>
          <h3>Reasoning</h3>
          <p>{body?.marketInterpretation || (quote.decimalPrice !== null
            ? `The current analysis uses the observed ${quote.providerLabel || "bookmaker"} ${quote.market || "market"} price shown above.`
            : "A fresh, usable market price is not available for an actionable comparison.")}</p>
          <p>{body?.modelConsensusInterpretation || "Independent model-family evidence is shown elsewhere on the match page; no narrative consensus is inferred when an English story is unavailable."}</p>
          <p>{body?.humanFactorsInterpretation || (lineup[0] === "UNKNOWN"
            ? "Human-factor coverage is incomplete, so missing lineup or player-status evidence remains unknown."
            : `Lineup state: ${lineup[1]}. It is not promoted beyond its stored confirmation status.`)}</p>
        </div>
        <div>
          <h3>Counterevidence and uncertainty</h3>
          <p>{body?.counterCase || "No English narrative countercase is available for this snapshot; absence of a narrative is not evidence that counterevidence is absent."}</p>
          {invalidators.length ? <ul>{invalidators.slice(0, 6).map((row, index) => <li key={String(row) + index}>{String(row)}</li>)}</ul> : <p className="ft-article-unknown">No explicit invalidators are stored for the current snapshot.</p>}
        </div>
      </section>

      <section className="ft-article-sources">
        <h3>Evidence provenance</h3>
        <div>
          <span>Article engine: {safe(story?.engine?.name, "Deterministic analysis fallback")}</span>
          <span>Article generated: {dateTime(story?.generatedAt)}</span>
          <span>Snapshot hash: {safe(story?.cache?.analysisHash, "Unavailable")}</span>
          <span>Fixture key: {safe(match.id)}</span>
        </div>
        {Array.isArray(story?.commentary) && story.commentary.length ? (
          <div className="ft-attributed-sources">
            {story.commentary.slice(0, 5).map((row, index) => row.source_url ? (
              <a href={row.source_url} target="_blank" rel="noreferrer" key={safe(row.source, "source") + index}>{safe(row.source, "External source")} · {safe(row.headline || row.summary, "Context")}</a>
            ) : (
              <span key={safe(row.source, "source") + index}>{safe(row.source, "External source")} · {safe(row.headline || row.summary, "Context")}</span>
            ))}
          </div>
        ) : null}
      </section>
    </article>
  );
}
