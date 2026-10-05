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
    .select("observed_at")
    .eq("source", SOURCE)
    .eq("metric", "cloud_ingest")
    .maybeSingle();

  if (previous?.observed_at) {
    const prior = Date.parse(previous.observed_at);
    if (Number.isFinite(prior) && now - prior < MIN_INTERVAL_MS) {
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

  if (!Number.isFinite(capturedMs) || now - capturedMs > MAX_AGE_MS) {
    await db.from("source_health").upsert({
      source: SOURCE, metric: "cloud_ingest", value_text: "STALE", status: "ERROR",
      notes: "Cloud snapshot missing or older than 20 minutes.",
      observed_at: new Date().toISOString(),
      raw: { captured_at: capturedAt, fixture_count: fixtures.length },
    }, { onConflict: "source,metric" });
    return Response.json({ error: "stale_snapshot", captured_at: capturedAt }, { status: 409 });
  }

  const from = new Date(now - 18 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString();
  const { data: matches, error: matchError } = await db
    .from("matches")
    .select("hkjc_event_id,kickoff_hkt,tournament,home_en,away_en")
    .gte("kickoff_hkt", from)
    .lt("kickoff_hkt", to);

  if (matchError) return Response.json({ error: "canonical_read_failed", detail: matchError.message }, { status: 500 });

  const observedNames = [...new Set(
    fixtures.flatMap((row:any) => [String(row?.home ?? "").trim(), String(row?.away ?? "").trim()]).filter(Boolean)
  )];

  const [flashAliasResult, consensusAliasResult] = await Promise.all([
    observedNames.length
      ? db.from("team_name_master")
          .select("source,source_name,team_key,hkjc_name_en,status")
          .eq("source", "FLASHSCORE")
          .eq("status", "VERIFIED")
          .in("source_name", observedNames)
      : Promise.resolve({ data:[], error:null } as any),
    observedNames.length
      ? db.from("team_name_master")
          .select("source,source_name,team_key,hkjc_name_en,status")
          .eq("status", "VERIFIED")
          .in("source_name", observedNames)
      : Promise.resolve({ data:[], error:null } as any),
  ]);

  if (flashAliasResult.error) return Response.json({ error: "flash_alias_read_failed", detail: flashAliasResult.error.message }, { status: 500 });
  if (consensusAliasResult.error) return Response.json({ error: "consensus_alias_read_failed", detail: consensusAliasResult.error.message }, { status: 500 });

  const flashTargets = new Map<string, Map<string, string>>();
  for (const a of flashAliasResult.data ?? []) {
    const keyName = norm(a?.source_name);
    const teamKey = String(a?.team_key ?? "").trim();
    const canonicalName = String(a?.hkjc_name_en ?? "").trim();
    if (!keyName || !teamKey || !canonicalName) continue;
    const targets = flashTargets.get(keyName) ?? new Map<string,string>();
    targets.set(teamKey, canonicalName);
    flashTargets.set(keyName, targets);
  }

  const consensusTargets = new Map<string, Map<string, { canonicalName:string; sources:Set<string> }>>();
  for (const a of consensusAliasResult.data ?? []) {
    const keyName = norm(a?.source_name);
    const teamKey = String(a?.team_key ?? "").trim();
    const canonicalName = String(a?.hkjc_name_en ?? "").trim();
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
    const candidates = (matches ?? []).filter((m: any) => {
      if (norm(m.home_en) !== norm(resolvedHome) || norm(m.away_en) !== norm(resolvedAway)) return false;
      const mk = Date.parse(m.kickoff_hkt ?? "");
      return Number.isFinite(koMs) && Number.isFinite(mk) && Math.abs(mk - koMs) <= KICKOFF_TOLERANCE_MS;
    });

    let identity = "UNRESOLVED";
    let canonical: string | null = null;
    if (candidates.length === 1) {
      identity = "VERIFIED";
      canonical = String(candidates[0].hkjc_event_id);
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
    movement_refresh: movementRefreshError ? { status:"ERROR", message:movementRefreshError.message } : movementRefresh,
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
        hkjc_event_id: canonical,
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

  if (stage.length) {
    const { error } = await db.from("flashscore_bet365_current").upsert(stage, { onConflict: "provider_event_id" });
    if (error) return Response.json({ error: "stage_write_failed", detail: error.message }, { status: 500 });
  }

  const currentIds = stage.map((x) => x.provider_event_id);
  if (currentIds.length) {
    const { data: existing } = await db.from("flashscore_bet365_current").select("provider_event_id");
    const stale = (existing ?? []).map((x: any) => x.provider_event_id).filter((id: string) => !currentIds.includes(id));
    if (stale.length) await db.from("flashscore_bet365_current").delete().in("provider_event_id", stale);
  }

  const verifiedIds = verified.map((x) => x.hkjc_event_id);
  const { data: oldPromoted } = await db.from("bet365_current").select("hkjc_event_id").eq("source", SOURCE);
  const removeIds = (oldPromoted ?? []).map((x: any) => x.hkjc_event_id).filter((id: string) => !verifiedIds.includes(id));
  if (removeIds.length) await db.from("bet365_current").delete().eq("source", SOURCE).in("hkjc_event_id", removeIds);

  if (verified.length) {
    const { error } = await db.from("bet365_current").upsert(verified, { onConflict: "hkjc_event_id" });
    if (error) return Response.json({ error: "promotion_failed", detail: error.message }, { status: 500 });

    const snapshots = verified.map((x: any) => ({
      hkjc_event_id: x.hkjc_event_id,
      captured_at: capturedAt,
      source: SOURCE,
      market: "ML",
      line: "FT",
      home_price: x.bet365_home,
      draw_price: x.bet365_draw,
      away_price: x.bet365_away,
      over_price: null,
      under_price: null,
      raw: x.raw,
    }));
    const { error: snapshotError } = await db.from("odds_snapshots").upsert(snapshots, {
      onConflict: "hkjc_event_id,captured_at,source,market,line",
      ignoreDuplicates: true,
    });
    if (snapshotError) return Response.json({ error: "snapshot_write_failed", detail: snapshotError.message }, { status: 500 });
  }

  const { data: movementRefresh, error: movementRefreshError } = await db.rpc("ft_refresh_cloud_odds_movement");
  if (movementRefreshError) {
    console.error("cloud_odds_movement_refresh_failed", movementRefreshError);
  }

  const healthRaw = {
    cloud_complete_hda: fixtures.length,
    staged: stage.length,
    verified: verified.length,
    unresolved,
    ambiguous,
    alias_resolved: aliasResolved,
    consensus_resolved: consensusResolved,
    captured_at: capturedAt,
  };
  await db.from("source_health").upsert({
    source: SOURCE, metric: "cloud_ingest",
    value_text: String(verified.length),
    status: verified.length ? "OK" : "ATTENTION",
    notes: verified.length ? "Cloud snapshot ingested; only strict unique canonical matches promoted." : "Cloud snapshot healthy but no strict canonical fixture matches promoted.",
    observed_at: new Date().toISOString(),
    raw: healthRaw,
  }, { onConflict: "source,metric" });

  return Response.json({ ok: true, source: SOURCE, ...healthRaw });
});
