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
  const matchStatus = String(match?.status || "").toUpperCase().replace(/[\s_-]+/g, "");
  const terminalStatus = ["FULLTIME","FINISHED","FT","ENDED","MATCHENDED","INPLAYMATCHENDED","AET","PEN","CANCELLED","CANCELED","VOID","ABANDONED"].includes(matchStatus);
  const kickoffMs = match?.kickoff ? new Date(match.kickoff).getTime() : NaN;
  const kickoffStarted = Number.isFinite(kickoffMs) && kickoffMs <= Date.now() + 2 * 60 * 1000;
  const priceObserved = match?.oddsUpdatedAt || match?.health?.hkjcPriceChangedAt || null;
  const priceObservedMs = priceObserved ? new Date(priceObserved).getTime() : NaN;
  const priceAgeMinutes = Number.isFinite(priceObservedMs) ? (Date.now() - priceObservedMs) / 60000 : null;
  // Fail closed if any authoritative layer marks the quote stale, if the
  // prematch quote is older than six hours, or if the match has already started.
  const stale = oddsStatuses.some((value) => value.includes("STALE"))
    || sourceModes.some((value) => value.includes("FALLBACK"))
    || terminalStatus
    || kickoffStarted
    || (priceAgeMinutes !== null && priceAgeMinutes > 360)
    || String(match?.health?.hkjcFreshness || "").toUpperCase() === "STALE";
  const side = decision.selection || null;
  const fallback =
    side === "H" ? match?.odds?.home :
    side === "D" ? match?.odds?.draw :
    side === "A" ? match?.odds?.away : null;
  const observedAt =
    analysis?.evidence?.phase1Health?.priceObservedAt ||
    analysis?.evidence?.phase1Health?.oddsUpdatedAt ||
    match?.oddsUpdatedAt ||
    match?.health?.hkjcPriceChangedAt ||
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
  const resolvedConfirmed = rows.filter((row) => row?.fact_status === "CONFIRMED").length;
  const sourceConfirmedUnresolved = rows.filter((row) => row?.fact_status === "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED").length;
  const provisional = rows.filter((row) => !["CONFIRMED", "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"].includes(String(row?.fact_status || ""))).length;
  if (eventMap?.lineup_confirmed_at && sourceConfirmedUnresolved > 0) {
    return ["PARTIAL", "Official lineup source confirmed · player identity reconciliation incomplete"];
  }
  if (eventMap?.lineup_confirmed_at && rows.length > 0 && resolvedConfirmed === rows.length) {
    return ["CONFIRMED", "Confirmed lineup with resolved player identities"];
  }
  if (rows.length) {
    if (resolvedConfirmed > 0 && sourceConfirmedUnresolved === 0 && provisional === 0) {
      return ["CONFIRMED", "Confirmed lineup with resolved player identities"];
    }
    if (sourceConfirmedUnresolved > 0) return ["PARTIAL", "Source-confirmed lineup rows · player identity unresolved"];
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
  return rows.slice(0, 10).map((row, index) => {
    const factStatus = String(row?.fact_status || "").toUpperCase();
    const confirmation = factStatus === "CONFIRMED"
      ? "Confirmed source + canonical player identity"
      : factStatus === "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"
        ? "Source reports status · player identity unresolved"
        : row.confirmed === false
          ? "Unconfirmed status · player identity unresolved"
          : "Identity / confirmation unresolved";
    return {
      key: String(row.evidence_key || row.player_key || row.player_name || "player") + "-" + index,
      player: safe(row.player_name || row?.raw?.player?.name || row?.raw?.player_name || row.player_key),
      side: safe(row.team_side, "Team unknown"),
      status: safe(row.status_value || row.status_type, "Status unknown"),
      confirmed: confirmation,
      source: safe(row.source_name || row.source, "Source not recorded"),
      sourceUrl: row.source_link || row.source_url || null,
      evidenceKey: safe(row.evidence_key, "Evidence key unavailable"),
      recordGroup: safe(row.record_group, "Record group unavailable"),
    };
  });
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
  const confirmedStarters = lineups.filter((row) => row.fact_status === "CONFIRMED" && row.starter === true).length;
  const confirmedBench = lineups.filter((row) => row.fact_status === "CONFIRMED" && row.starter === false).length;
  const sourceConfirmedIdentityUnresolved = lineups.filter((row) => row.fact_status === "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED").length;
  const provisionalStarters = lineups.filter((row) => !["CONFIRMED", "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"].includes(String(row.fact_status || "")) && row.starter === true).length;
  const provisionalBench = lineups.filter((row) => !["CONFIRMED", "SOURCE_CONFIRMED_IDENTITY_UNRESOLVED"].includes(String(row.fact_status || "")) && row.starter === false).length;
  const unresolvedRole = lineups.filter((row) => row.starter !== true && row.starter !== false).length;
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

      <div className="ft-article-ad" aria-label="Advertisement placeholder">
        <small>ADVERTISEMENT</small>
        <strong>728 × 90</strong>
        <span>Reserved between analysis sections</span>
      </div>

      <section className="ft-article-grid">
        <div><span>Bookmaker</span><strong>{quote.providerLabel || PROVIDERS.HKJC.label}</strong><small>{quote.providerKind || "BOOKMAKER"}</small></div>
        <div><span>Market / selection</span><strong>{safe(quote.market)} · {safe(quote.selection)}</strong><small>{quote.line === null ? "Line not applicable / unknown" : "Line " + quote.line}</small></div>
        <div><span>Observed price</span><strong>{quoteState.stale ? "Not current" : price(quote.decimalPrice)}</strong><small>As of {dateTime(quote.observedAt)}</small><small>
            Evidence: {safe(analysis?.evidence?.phase1Health?.evidenceKey, "Unavailable")}
            {analysis?.evidence?.phase1Health?.sourceUrl ? <> · <a href={analysis.evidence.phase1Health.sourceUrl} target="_blank" rel="noreferrer">source link</a></> : null}
          </small></div>
        <div><span>Decision state</span><strong>{action.replaceAll("_", " ")}</strong><small>{candidate.replaceAll("_", " ")}</small></div>
      </section>

      <div className="ft-article-safety-strip" aria-label="Article safety context">
        <div>
          <span>Price status</span>
          <strong>{quoteState.stale ? "Stale / reference only" : quote.decimalPrice === null ? "Current price unknown" : "Current observation"}</strong>
        </div>
        <div>
          <span>Lineup status</span>
          <strong>{lineup[1]}</strong>
        </div>
        <div>
          <span>Player-status coverage</span>
          <strong>{players.length ? players.length + " evidence row" + (players.length === 1 ? "" : "s") : "Unknown — not zero absences"}</strong>
        </div>
      </div>

      <details className="ft-article-deep">
        <summary>
          <span>Full evidence article</span>
          <small>Samples, player evidence, market boundaries, reasoning and provenance</small>
        </summary>
        <div className="ft-article-deep-body">

      <section className="ft-article-grid">
        <div>
          <span>Expected value</span>
          <strong>{decision.expectedValuePct == null ? "Unknown" : (decision.expectedValuePct >= 0 ? "+" : "") + Number(decision.expectedValuePct).toFixed(1) + "%"}</strong>
          <small>{decision.candidateEdgePp == null ? "Model-vs-market gap unavailable" : "Probability gap " + (decision.candidateEdgePp >= 0 ? "+" : "") + Number(decision.candidateEdgePp).toFixed(1) + "pp"}</small>
        </div>
        <div>
          <span>Independent evidence</span>
          <strong>{decision.evidenceFamilyCount == null ? "Unknown" : decision.evidenceFamilyCount + " model family" + (Number(decision.evidenceFamilyCount) === 1 ? "" : "ies")}</strong>
          <small>{decision.supportCount == null || decision.evidenceFamilyCount == null ? "Support count unavailable" : decision.supportCount + "/" + decision.evidenceFamilyCount + " support the selected side"}</small>
        </div>
        <div>
          <span>Model disagreement</span>
          <strong>{decision.dispersion == null ? (Number(decision.evidenceFamilyCount) < 2 ? "Not measurable with <2 families" : "Unavailable") : (Number(decision.dispersion) * 100).toFixed(1) + "pp"}</strong>
          <small>Cross-family probability spread for the selected side</small>
        </div>
        <div>
          <span>Source fetch</span>
          <strong>{dateTime(analysis?.evidence?.phase1Health?.fetchedAt || match?.health?.hkjcFetchedAt)}</strong>
          <small>Fetch time is separate from the market-price observation shown above</small>
        </div>
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
            <span>{lineups.length
              ? [
                  confirmedStarters + " confirmed starters",
                  confirmedBench ? confirmedBench + " confirmed substitutes/bench" : null,
                  provisionalStarters ? provisionalStarters + " provisional starters" : null,
                  provisionalBench ? provisionalBench + " provisional substitutes/bench" : null,
                  sourceConfirmedIdentityUnresolved ? sourceConfirmedIdentityUnresolved + " source-confirmed rows with unresolved player identity" : null,
                  unresolvedRole ? unresolvedRole + " rows with unresolved starter/bench role" : null,
                ].filter(Boolean).join(" · ")
              : "No lineup rows are currently available"}</span>
          </div>
          {players.length ? players.map((row) => (
            <div className="ft-article-evidence-row" key={row.key}>
              <span>{row.side} · {row.player}</span>
              <strong>{row.status}</strong>
              <small>{row.confirmed}</small>
              <small>Evidence: {row.evidenceKey} · Record group: {row.recordGroup}</small>
              <small>
                Source: {row.source}
                {row.sourceUrl ? <> · <a href={row.sourceUrl} target="_blank" rel="noreferrer">source link</a></> : " · source link unavailable"}
              </small>
            </div>
          )) : (
            <p className="ft-article-unknown">No verified player-status evidence is currently available. This is unknown coverage, not zero injuries.</p>
          )}
        </div>
      </section>

      <section className="ft-article-columns">
        <div>
          <h3>Market-specific recommendations</h3>
          {analysis?.marketAdvice?.goals ? (
            <div className="ft-article-evidence-row">
              <span>Goals {analysis.marketAdvice.goals.line == null ? "" : analysis.marketAdvice.goals.line}</span>
              <strong>
                {safe(analysis.marketAdvice.goals.action, "PASS").replaceAll("_", " ")}
                {analysis.marketAdvice.goals.selectionLabel ? " · " + analysis.marketAdvice.goals.selectionLabel : ""}
              </strong>
              <small>
                {analysis.marketAdvice.goals.currentOdds == null
                  ? (analysis.marketAdvice.goals.referenceOdds == null ? "No actionable current price" : "Reference price " + price(analysis.marketAdvice.goals.referenceOdds))
                  : "Current price " + price(analysis.marketAdvice.goals.currentOdds)}
                {" · "}
                As of {dateTime(analysis?.evidence?.phase1Health?.priceObservedAt || match?.oddsUpdatedAt)}
                {" · "}
                {analysis.marketAdvice.goals.evidenceFamilyCount ?? 0} independent market-specific family
                {Number(analysis.marketAdvice.goals.evidenceFamilyCount ?? 0) === 1 ? "" : "ies"}
              </small>
              <small>
                {analysis.marketAdvice.goals.models?.length
                  ? analysis.marketAdvice.goals.models.map((m) => safe(m.label) + " (" + safe(m.method) + " · " + safe(m.provenanceGroup, "provenance unknown") + ")").join(" · ")
                  : "No usable goals model evidence"}
              </small>
            </div>
          ) : <p className="ft-article-unknown">Goals analysis unavailable.</p>}
        </div>
        <div>
          <h3>Market evidence boundary</h3>
          {analysis?.evidence?.goalsModelContext?.dixonColes ? (
            <div className="ft-article-evidence-row">
              <span>Dixon-Coles goals input</span>
              <strong>
                Expected goals {price(analysis.evidence.goalsModelContext.dixonColes.expectedGoalsHome)}
                {" – "}
                {price(analysis.evidence.goalsModelContext.dixonColes.expectedGoalsAway)}
              </strong>
              <small>
                Training sample {analysis.evidence.goalsModelContext.dixonColes.trainingMatches || "unknown"} matches
                {" · "}Source: {safe(analysis.evidence.goalsModelContext.dixonColes.source, "Unknown")}
                {" · "}Evidence: {safe(analysis.evidence.goalsModelContext.dixonColes.evidenceKey, "Unavailable")}
                {analysis.evidence.goalsModelContext.dixonColes.sourceUrl ? <>{" · "}<a href={analysis.evidence.goalsModelContext.dixonColes.sourceUrl} target="_blank" rel="noreferrer">source link</a></> : null}
              </small>
              <small>
                Competition: {safe(analysis.evidence.goalsModelContext.dixonColes.league, "Unknown")}
                {" · "}Historical period: {analysis.evidence.goalsModelContext.dixonColes.period || "not recorded in the current model artifact"}
              </small>
            </div>
          ) : null}
          {analysis?.evidence?.goalsModelContext?.teamForm ? (
            <div className="ft-article-evidence-row">
              <span>Team Form goals input</span>
              <strong>
                Expected goals {price(analysis.evidence.goalsModelContext.teamForm.expectedGoalsHome)}
                {" – "}
                {price(analysis.evidence.goalsModelContext.teamForm.expectedGoalsAway)}
              </strong>
              <small>
                Sample {analysis.evidence.goalsModelContext.teamForm.homeGames ?? "unknown"} / {analysis.evidence.goalsModelContext.teamForm.awayGames ?? "unknown"} matches
                {" · "}Source: {safe(analysis.evidence.goalsModelContext.teamForm.source, "Unknown")}
                {" · "}Evidence: {safe(analysis.evidence.goalsModelContext.teamForm.evidenceKey, "Unavailable")}
                {analysis.evidence.goalsModelContext.teamForm.sourceUrl ? <>{" · "}<a href={analysis.evidence.goalsModelContext.teamForm.sourceUrl} target="_blank" rel="noreferrer">source link</a></> : null}
              </small>
              <small>Model expected goals are derived estimates, not observed xG.</small>
            </div>
          ) : (
            <p className="ft-article-unknown">No validated Team Form goals input is available for this snapshot.</p>
          )}
          <p className="ft-article-unknown">
            Goals, corners and handicap recommendations use only their own market-specific evidence. HDA consensus is not reused as a substitute.
          </p>
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

        </div>
      </details>
    </article>
  );
}
