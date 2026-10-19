-- Review-only: preserves current columns, providers, identity, snapshot and fixture window.
-- Confirmed source observations precede complete predictions, including partial official XIs.
-- NOT APPLIED. Generate a CLI migration and review privileges before release.
CREATE OR REPLACE VIEW public.phase2_canonical_lineup_rows_current AS
 WITH upcoming AS (
         SELECT hkjc_upcoming_current.hkjc_event_id
           FROM hkjc_upcoming_current
          WHERE hkjc_upcoming_current.kickoff_hkt >= (now() - '02:00:00'::interval) AND hkjc_upcoming_current.kickoff_hkt < (now() + '48:00:00'::interval)
        ), latest_fetch AS (
         SELECT l_1.hkjc_event_id,
            l_1.source_name,
            max(l_1.fetched_at) AS fetched_at
           FROM phase2_match_lineup_evidence l_1
             JOIN upcoming u USING (hkjc_event_id)
          GROUP BY l_1.hkjc_event_id, l_1.source_name
        ), latest_rows AS (
         SELECT l_1.id,
            l_1.hkjc_event_id,
            l_1.team_side,
            l_1.team_key,
            l_1.player_key,
            l_1.player_name,
            l_1.role,
            l_1.starter,
            l_1.formation_slot,
            l_1.shirt_number,
            l_1.confirmed,
            l_1.confidence,
            l_1.source_name,
            l_1.source_url,
            l_1.source_updated_at,
            l_1.fetched_at,
            l_1.raw,
            l_1.created_at
           FROM phase2_match_lineup_evidence l_1
             JOIN latest_fetch f ON f.hkjc_event_id = l_1.hkjc_event_id AND f.source_name = l_1.source_name AND f.fetched_at = l_1.fetched_at
        ), stats AS (
         SELECT latest_rows.hkjc_event_id,
            latest_rows.source_name,
            max(latest_rows.fetched_at) AS fetched_at,
            count(*) FILTER (WHERE latest_rows.starter AND latest_rows.team_side = 'H'::text) AS home_starters,
            count(*) FILTER (WHERE latest_rows.starter AND latest_rows.team_side = 'A'::text) AS away_starters,
            count(*) FILTER (WHERE latest_rows.confirmed) AS confirmed_rows,
                CASE
                    WHEN latest_rows.source_name = 'API_FOOTBALL'::text THEN 400
                    WHEN latest_rows.source_name = 'FLASHSCORE_OFFICIAL'::text THEN 350
                    WHEN latest_rows.source_name ~~* '%PREDICTED%'::text THEN 150
                    ELSE 200
                END AS priority
           FROM latest_rows
          GROUP BY latest_rows.hkjc_event_id, latest_rows.source_name
        ), ranked AS (
         SELECT stats.hkjc_event_id,
            stats.source_name,
            stats.fetched_at,
            stats.home_starters,
            stats.away_starters,
            stats.confirmed_rows,
            stats.priority,
            row_number() OVER (PARTITION BY stats.hkjc_event_id ORDER BY (stats.confirmed_rows > 0) DESC, (
                CASE
                    WHEN stats.home_starters = 11 AND stats.away_starters = 11 THEN 1
                    ELSE 0
                END) DESC, stats.confirmed_rows DESC, stats.priority DESC, stats.fetched_at DESC) AS rn
           FROM stats
        ), chosen AS (
         SELECT ranked.hkjc_event_id,
            ranked.source_name,
            ranked.fetched_at,
            ranked.home_starters,
            ranked.away_starters,
            ranked.confirmed_rows,
            ranked.priority,
            ranked.rn
           FROM ranked
          WHERE ranked.rn = 1
        )
 SELECT l.id,
    l.hkjc_event_id,
    l.team_side,
    l.team_key,
    l.player_key,
    l.player_name,
    l.role,
    l.starter,
    l.formation_slot,
    l.shirt_number,
    l.confirmed,
    l.confidence,
    l.source_name,
    l.source_url,
    l.source_updated_at,
    l.fetched_at,
    l.raw,
    l.created_at,
        CASE
            WHEN c.home_starters = 11 AND c.away_starters = 11 AND c.confirmed_rows >= 22 THEN 'CONFIRMED'::text
            WHEN c.home_starters = 11 AND c.away_starters = 11 THEN 'PREDICTED_FULL'::text
            ELSE 'PARTIAL'::text
        END AS canonical_status,
        CASE
            WHEN c.home_starters = 11 AND c.away_starters = 11 AND count(*) FILTER (WHERE l.starter AND l.formation_slot IS NOT NULL) OVER (PARTITION BY l.hkjc_event_id) = 22 THEN 'FORMATION_READY'::text
            ELSE 'FORMATION_UNAVAILABLE'::text
        END AS formation_status
   FROM latest_rows l
     JOIN chosen c ON c.hkjc_event_id = l.hkjc_event_id AND c.source_name = l.source_name AND c.fetched_at = l.fetched_at;
