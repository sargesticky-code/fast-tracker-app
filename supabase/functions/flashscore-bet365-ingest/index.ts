import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SOURCE = "FLASHSCORE_BET365";
const SNAPSHOT_URL = "https://fast-tracker-dashboard-production.up.railway.app/snapshot";
const MAX_AGE_MS = 20 * 60 * 1000;
const KICKOFF_TOLERANCE_MS = 120 * 60 * 1000;
const MIN_INTERVAL_MS = 5 * 60 * 1000;

function norm(v: unknown): string {
  return String(v ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function kickoffUtc(row: any): string | null {
  const d = typeof row?.fixture_date === "string" ? row.fixture_date : "";
  const t = typeof row?.time_text === "string" ? row.time_text.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const iso = `${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ error: "server_config_missing" }, { status: 500 });

  const db = createClient(url, key, { auth: { persistSession: false } });
  const now = Date.now();

  const { data: previous } = await db
    .from("source_health")
    .select("observed_at,status,raw")
    .eq("source", SOURCE)
    .eq("metric", "cloud_ingest")
    .maybeSingle();

  // A failed ingest records an error heartbeat. It must NEVER rate-limit
  // recovery when a new verified Flashscore snapshot is available.
  // Suppress repeats only for a genuinely recent successful publication.
  if (previous?.status === "OK" && previous?.observed_at) {
    const prior = Date.parse(previous.observed_at);
    const lastCapturedMs = Date.parse(String(previous?.raw?.captured_at ?? ""));
    if (Number.isFinite(prior) && Number.isFinite(lastCapturedMs)
      && now - prior < MIN_INTERVAL_MS && now - lastCapturedMs < MAX_AGE_MS) {
      return Response.json({ ok: true, status: "THROTTLED", source: SOURCE });
    }
  }

  let payload: any;
  try {
    const r = await fetch(SNAPSHOT_URL, {
      headers: { "accept": "application/json", "user-agent": "fast-tracker-supabase-ingest/1.0" },
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) throw new Error(`snapshot_http_${r.status}`);
    payload = await r.json();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("source_health").upsert({
      source: SOURCE, metric: "cloud_ingest", value_text: "FETCH_FAILED", status: "ERROR",
      notes: message, observed_at: new Date().toISOString(), raw: { snapshot_url: SNAPSHOT_URL },
    }, { onConflict: "source,metric" });
    return Response.json({ error: "snapshot_fetch_failed", detail: message }, { status: 502 });
  }

  const capturedAt = typeof payload?.captured_at === "string" ? payload.captured_at : null;
  const capturedMs = capturedAt ? Date.parse(capturedAt) : NaN;
  const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
  const discovered = Array.isArray(payload?.discovered) ? payload.discovered : [];

  if (!Number.isFinite(capturedMs) || now - capturedMs > MAX_AGE_MS) {
    await db.from("source_health").upsert({
      source: SOURCE, metric: "cloud_ingest", value_text: "STALE", status: "ERROR",
      notes: "Cloud snapshot missing or older than 20 minutes.",
      observed_at: new Date().toISOString(),
      raw: { captured_at: capturedAt, fixture_count: fixtures.length, discovered_count: discovered.length },
    }, { onConflict: "source,metric" });
    return Response.json({ error: "stale_snapshot", captured_at: capturedAt }, { status: 409 });
  }

  // A snapshot already committed successfully cannot provide newer odds;
  // avoid rewriting hundreds of bookmaker/market rows on each cron retry.
  if (previous?.status === "OK" && previous?.raw?.captured_at === capturedAt) {
    return Response.json({
      ok: true, status: "UNCHANGED", source: SOURCE, captured_at: capturedAt,
      reason: "already_published_exact_capture",
    });
  }

  const from = new Date(now - 18 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString();
  const observedNames = [...new Set(
    [...fixtures, ...discovered]
      .flatMap((row:any) => [String(row?.home ?? "").trim(), String(row?.away ?? "").trim()])
      .filter(Boolean)
  )];
  const pricedNames = [...new Set(
    fixtures
      .flatMap((row:any) => [String(row?.home ?? "").trim(), String(row?.away ?? "").trim()])
      .filter(Boolean)
  )];

  // Collapse independent preflight reads into one latency phase.
  const [matchResult,flashAliasResult,consensusAliasResult] = await Promise.all([
    db.from("canonical_fixture_current")
      .select("match_id,kickoff_hkt,tournament:league,home_en,away_en")
      .gte("kickoff_hkt", from)
      .lt("kickoff_hkt", to),
    observedNames.length
      ? db.from("team_identity_current")
          .select("source,source_name,team_key,canonical_name_en,status")
          .eq("source", "FLASHSCORE")
          .eq("status", "VERIFIED")
          .in("source_name", observedNames)
      : Promise.resolve({ data:[], error:null } as any),
    pricedNames.length
      ? db.from("team_identity_current")
          .select("source,source_name,team_key,canonical_name_en,status")
          .eq("status", "VERIFIED")
          .neq("source", "CANONICAL_EN")
          .in("source_name", pricedNames)
      : Promise.resolve({ data:[], error:null } as any),
  ]);

  if (matchResult.error) return Response.json({ error: "canonical_read_failed", detail: matchResult.error.message }, { status: 500 });
  if (flashAliasResult.error) return Response.json({ error: "flash_alias_read_failed", detail: flashAliasResult.error.message }, { status: 500 });
  if (consensusAliasResult.error) return Response.json({ error: "consensus_alias_read_failed", detail: consensusAliasResult.error.message }, { status: 500 });
  const matches=matchResult.data||[];

  const flashTargets = new Map<string, Map<string, string>>();
  for (const a of flashAliasResult.data ?? []) {
    const keyName = norm(a?.source_name);
    const teamKey = String(a?.team_key ?? "").trim();
    const canonicalName = String(a?.canonical_name_en ?? "").trim();
    if (!keyName || !teamKey || !canonicalName) continue;
    const targets = flashTargets.get(keyName) ?? new Map<string,string>();
    targets.set(teamKey, canonicalName);
    flashTargets.set(keyName, targets);
  }

  const consensusTargets = new Map<string, Map<string, { canonicalName:string; sources:Set<string> }>>();
  for (const a of consensusAliasResult.data ?? []) {
    const keyName = norm(a?.source_name);
    const teamKey = String(a?.team_key ?? "").trim();
    const canonicalName = String(a?.canonical_name_en ?? "").trim();
    const source = String(a?.source ?? "").trim();
    if (!keyName || !teamKey || !canonicalName || !source) continue;
    const allTargets = consensusTargets.get(keyName) ?? new Map<string, { canonicalName:string; sources:Set<string> }>();
    const target = allTargets.get(teamKey) ?? { canonicalName, sources:new Set<string>() };
    target.sources.add(source);
    allTargets.set(teamKey, target);
    consensusTargets.set(keyName, allTargets);
  }

  const resolveAlias = (name: string) => {
    const keyName = norm(name);
    const flash = flashTargets.get(keyName);
    if (flash?.size === 1) {
      return { canonicalName:[...flash.values()][0] ?? null, method:"VERIFIED_FLASHSCORE_ALIAS", sourceCount:1 };
    }
    const consensus = consensusTargets.get(keyName);
    if (!consensus || consensus.size !== 1) return { canonicalName:null, method:null, sourceCount:0 };
    const target = [...consensus.values()][0];
    if (!target || target.sources.size < 2) return { canonicalName:null, method:null, sourceCount:target?.sources.size ?? 0 };
    return { canonicalName:target.canonicalName, method:"VERIFIED_CROSS_SOURCE_CONSENSUS", sourceCount:target.sources.size };
  };

  const pricedIds = new Set(
    fixtures.map((row:any) => String(row?.provider_event_id ?? "").trim()).filter(Boolean)
  );
  const canonicalPool:any[] = [...(matches ?? [])];
  const fixtureStage:any[] = [];
  const canonicalCreates:any[] = [];
  const redirects:any[] = [];
  let fixtureExactExisting = 0;
  let fixtureCreated = 0;
  let fixtureDeferredNearby = 0;
  let fixtureDiscoveredOnly = 0;
  let fixtureInvalidTime = 0;
  let fixtureAmbiguous = 0;

  for (const row of discovered) {
    const providerEventId = String(row?.provider_event_id ?? "").trim();
    const home = String(row?.home ?? "").trim();
    const away = String(row?.away ?? "").trim();
    if (!providerEventId || !home || !away) continue;

    const ko = kickoffUtc(row);
    const koMs = ko ? Date.parse(ko) : NaN;
    const homeAlias = resolveAlias(home);
    const awayAlias = resolveAlias(away);
    const resolvedHome = homeAlias.canonicalName ?? home;
    const resolvedAway = awayAlias.canonicalName ?? away;
    const fsId = "FS:" + providerEventId;

    let identity = "DISCOVERED_ONLY";
    let canonical:string|null = null;

    const directProviderMatch = canonicalPool.find((m:any) => String(m?.match_id ?? "") === fsId);
    const exactCandidates = Number.isFinite(koMs)
      ? canonicalPool.filter((m:any) => {
          const mk = Date.parse(m?.kickoff_hkt ?? "");
          return norm(m?.home_en) === norm(resolvedHome)
            && norm(m?.away_en) === norm(resolvedAway)
            && Number.isFinite(mk)
            && Math.abs(mk - koMs) <= KICKOFF_TOLERANCE_MS;
        })
      : [];

    const strictRedirectCandidates = Number.isFinite(koMs)
      ? exactCandidates.filter((m:any) => {
          if(String(m?.match_id||"")===fsId)return false;
          const mk=Date.parse(m?.kickoff_hkt??"");
          return Number.isFinite(mk) && Math.abs(mk-koMs)<=10*60*1000;
        })
      : [];

    if (directProviderMatch && strictRedirectCandidates.length === 1) {
      const target=strictRedirectCandidates[0];
      identity = "EXACT_EXISTING";
      canonical = String(target.match_id);
      fixtureExactExisting++;
      redirects.push({
        source_match_id:fsId,
        target_match_id:canonical,
        source_name:SOURCE,
        confidence:0.995,
        evidence:{
          provider_event_id:providerEventId,
          provider_home:home,
          provider_away:away,
          resolved_home:resolvedHome,
          resolved_away:resolvedAway,
          provider_kickoff:ko,
          target_kickoff:target.kickoff_hkt,
          home_method:homeAlias.method,
          away_method:awayAlias.method,
          home_source_count:homeAlias.sourceCount,
          away_source_count:awayAlias.sourceCount,
          rule:"UNIQUE_TWO_TEAM_IDENTITY_PLUS_10M_KICKOFF"
        },
        active:true,
        updated_at:new Date().toISOString()
      });
    } else if (directProviderMatch) {
      identity = "EXACT_EXISTING";
      canonical = fsId;
      fixtureExactExisting++;
    } else if (!Number.isFinite(koMs)) {
      identity = "INVALID_TIME";
      fixtureInvalidTime++;
    } else if (exactCandidates.length === 1) {
      identity = "EXACT_EXISTING";
      canonical = String(exactCandidates[0].match_id);
      fixtureExactExisting++;
    } else if (exactCandidates.length > 1) {
      identity = "AMBIGUOUS";
      fixtureAmbiguous++;
    } else {
      const sourceTeams = new Set([norm(resolvedHome), norm(resolvedAway)].filter(Boolean));
      const nearby = canonicalPool.filter((m:any) => {
        const mk = Date.parse(m?.kickoff_hkt ?? "");
        if (!Number.isFinite(mk) || Math.abs(mk - koMs) > 20 * 60 * 1000) return false;
        const targetTeams = [norm(m?.home_en), norm(m?.away_en)].filter(Boolean);
        return targetTeams.some((name:string) => sourceTeams.has(name));
      });

      const canCreate = pricedIds.has(providerEventId) && koMs >= now;
      if (nearby.length) {
        identity = "DEFERRED_NEARBY";
        fixtureDeferredNearby++;
      } else if (canCreate) {
        identity = "CREATED";
        canonical = fsId;
        fixtureCreated++;
        const created = {
          match_id: fsId,
          provider_match_id: providerEventId,
          kickoff_hkt: ko,
          status: "PREEVENT",
          tournament: row?.competition ?? null,
          home_en: resolvedHome,
          away_en: resolvedAway,
          home_zh: null,
          away_zh: null,
          pools: "HAD",
          pool_status: "CLOUD_BET365",
          in_play: false,
          selling: true,
          fetched_at: capturedAt,
          source_updated_at: capturedAt,
          raw: {
            source: "FLASHSCORE",
            provider_event_id: providerEventId,
            identity_origin: "PROVIDER_CANONICAL_CREATED",
            source_home: home,
            source_away: away,
            resolved_home: resolvedHome,
            resolved_away: resolvedAway,
            home_method: homeAlias.method,
            away_method: awayAlias.method,
          },
          updated_at: new Date().toISOString(),
        };
        canonicalCreates.push(created);
        canonicalPool.push(created);
      } else {
        identity = "DISCOVERED_ONLY";
        fixtureDiscoveredOnly++;
      }
    }

    fixtureStage.push({
      provider_event_id: providerEventId,
      captured_at: capturedAt,
      fixture_date: row?.fixture_date ?? null,
      kickoff_utc: ko,
      league: row?.competition ?? null,
      home,
      away,
      canonical_match_id: canonical,
      identity_status: identity,
      raw: {
        ...row,
        priced_complete_hda: pricedIds.has(providerEventId),
        identity_resolution: {
          resolved_home: resolvedHome,
          resolved_away: resolvedAway,
          home_method: homeAlias.method,
          away_method: awayAlias.method,
        }
      },
      updated_at: new Date().toISOString(),
    });
  }

  const stage: any[] = [];
  const verified: any[] = [];
  let ambiguous = 0;
  let unresolved = 0;
  let aliasResolved = 0;
  let consensusResolved = 0;

  for (const row of fixtures) {
    const providerEventId = String(row?.provider_event_id ?? "").trim();
    const home = String(row?.home ?? "").trim();
    const away = String(row?.away ?? "").trim();
    const hda = row?.hda ?? {};
    const hp = Number(hda?.home), dp = Number(hda?.draw), ap = Number(hda?.away);
    if (!providerEventId || !home || !away || !(hp > 1) || !(dp > 1) || !(ap > 1)) continue;

    const ko = kickoffUtc(row);
    const koMs = ko ? Date.parse(ko) : NaN;
    const homeAlias = resolveAlias(home);
    const awayAlias = resolveAlias(away);
    const resolvedHome = homeAlias.canonicalName ?? home;
    const resolvedAway = awayAlias.canonicalName ?? away;
    const usedAlias = norm(resolvedHome) !== norm(home) || norm(resolvedAway) !== norm(away);
    const usedConsensus = homeAlias.method === "VERIFIED_CROSS_SOURCE_CONSENSUS" || awayAlias.method === "VERIFIED_CROSS_SOURCE_CONSENSUS";
    const candidates = canonicalPool.filter((m: any) => {
      if (norm(m.home_en) !== norm(resolvedHome) || norm(m.away_en) !== norm(resolvedAway)) return false;
      const mk = Date.parse(m.kickoff_hkt ?? "");
      return Number.isFinite(koMs) && Number.isFinite(mk) && Math.abs(mk - koMs) <= KICKOFF_TOLERANCE_MS;
    });

    let identity = "UNRESOLVED";
    let canonical: string | null = null;
    if (candidates.length === 1) {
      identity = "VERIFIED";
      canonical = String(candidates[0].match_id);
      if (usedAlias) aliasResolved++;
      if (usedConsensus) consensusResolved++;
    } else if (candidates.length > 1) {
      identity = "AMBIGUOUS";
      ambiguous++;
    } else {
      unresolved++;
    }

    stage.push({
      provider_event_id: providerEventId,
      captured_at: capturedAt,
      fixture_date: row?.fixture_date ?? null,
      kickoff_utc: ko,
      league: row?.competition ?? null,
      home, away,
      home_price: hp, draw_price: dp, away_price: ap,
      opening_home: Number(hda?.opening_home) > 1 ? Number(hda.opening_home) : null,
      opening_draw: Number(hda?.opening_draw) > 1 ? Number(hda.opening_draw) : null,
      opening_away: Number(hda?.opening_away) > 1 ? Number(hda.opening_away) : null,
      canonical_match_id: canonical,
      identity_status: identity,
      raw: { ...row, identity_resolution: {
        resolved_home: resolvedHome,
        resolved_away: resolvedAway,
        used_verified_alias: usedAlias,
        used_cross_source_consensus: usedConsensus,
        home_method: homeAlias.method,
        away_method: awayAlias.method,
        home_source_count: homeAlias.sourceCount,
        away_source_count: awayAlias.sourceCount
      } },
      updated_at: new Date().toISOString(),
    });

    if (identity === "VERIFIED" && canonical) {
      const m = candidates[0];
      verified.push({
        match_id: canonical,
        fetched_at: capturedAt,
        match_date: row?.fixture_date ?? null,
        kickoff_hkt: m.kickoff_hkt,
        league: row?.competition ?? m.tournament ?? null,
        home: m.home_en ?? home,
        away: m.away_en ?? away,
        bet365_home: hp,
        bet365_draw: dp,
        bet365_away: ap,
        bet365_fixture_id: providerEventId,
        match_quality: 1,
        source: SOURCE,
        raw: row,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const genericRows=canonicalCreates.map((row:any)=>({
    match_id:row.match_id,
    provider_match_id:row.provider_match_id,
    kickoff_hkt:row.kickoff_hkt,
    status:row.status,
    league:row.tournament,
    home_en:row.home_en,
    away_en:row.away_en,
    home_zh:row.home_zh,
    away_zh:row.away_zh,
    pools:row.pools,
    pool_status:row.pool_status,
    in_play:row.in_play,
    selling:row.selling,
    fetched_at:row.fetched_at,
    source_updated_at:row.source_updated_at,
    raw:row.raw,
    updated_at:row.updated_at
  }));
  const bookmakerRows=verified.map((x:any)=>({
    match_id:x.match_id,
    fetched_at:x.fetched_at,
    match_date:x.match_date,
    kickoff_hkt:x.kickoff_hkt,
    league:x.league,
    home:x.home,
    away:x.away,
    home_odds:x.bet365_home,
    draw_odds:x.bet365_draw,
    away_odds:x.bet365_away,
    provider_fixture_id:x.bet365_fixture_id,
    match_quality:x.match_quality,
    raw:x.raw,
    updated_at:x.updated_at
  }));
  const snapshots=bookmakerRows.map((x:any)=>({
    match_id:x.match_id,
    captured_at:capturedAt,
    source:SOURCE,
    market:"ML",
    line:"FT",
    home_price:x.home_odds,
    draw_price:x.draw_odds,
    away_price:x.away_odds,
    over_price:null,
    under_price:null,
    raw:x.raw
  }));
  const healthRaw = {
    discovered_count: discovered.length,
    fixture_staged: fixtureStage.length,
    fixture_exact_existing: fixtureExactExisting,
    canonical_created: fixtureCreated,
    fixture_deferred_nearby: fixtureDeferredNearby,
    fixture_discovered_only: fixtureDiscoveredOnly,
    fixture_invalid_time: fixtureInvalidTime,
    fixture_ambiguous: fixtureAmbiguous,
    fixture_redirected: redirects.length,
    cloud_complete_hda: fixtures.length,
    staged: stage.length,
    verified: verified.length,
    unresolved,
    ambiguous,
    alias_resolved: aliasResolved,
    consensus_resolved: consensusResolved,
    captured_at: capturedAt,
  };

  // Commit all database writes, stale-row reconciliation, market refreshes and health
  // evidence in one transaction to avoid a long chain of PostgREST round trips.
  const {data:commitResult,error:commitError}=await db.rpc("ft_commit_flashscore_bet365_ingest",{
    p_fixture_stage:fixtureStage,
    p_canonical_creates:genericRows,
    p_redirects:redirects,
    p_stage:stage,
    p_bookmaker_rows:bookmakerRows,
    p_snapshots:snapshots,
    p_health:healthRaw
  });
  if(commitError){
    await db.from("source_health").upsert({
      source:SOURCE,metric:"cloud_ingest",value_text:"COMMIT_FAILED",status:"ERROR",
      notes:commitError.message,observed_at:new Date().toISOString(),
      raw:{captured_at:capturedAt,stage:stage.length,verified:verified.length}
    },{onConflict:"source,metric"});
    return Response.json({error:"ingest_commit_failed",detail:commitError.message},{status:500});
  }

  return Response.json({ ok: true, source: SOURCE, ...healthRaw, commit:commitResult });

});
