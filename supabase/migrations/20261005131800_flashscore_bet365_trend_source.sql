create or replace view public.bet365_trend_current as
 WITH ids AS (
         SELECT DISTINCT odds_snapshots.hkjc_event_id
           FROM odds_snapshots
          WHERE odds_snapshots.source = 'FLASHSCORE_BET365'::text AND odds_snapshots.market = 'ML'::text AND odds_snapshots.hkjc_event_id IS NOT NULL
        ), base AS (
         SELECT i.hkjc_event_id,
            m.kickoff_hkt,
            m.home_en,
            m.away_en,
            m.home_zh,
            m.away_zh,
            c.captured_at AS current_at,
            c.home_price AS current_home,
            c.draw_price AS current_draw,
            c.away_price AS current_away,
            o.captured_at AS opening_at,
            o.home_price AS opening_home,
            o.draw_price AS opening_draw,
            o.away_price AS opening_away,
            h1.home_price AS h1_home,
            h1.draw_price AS h1_draw,
            h1.away_price AS h1_away,
            h3.home_price AS h3_home,
            h3.draw_price AS h3_draw,
            h3.away_price AS h3_away,
            h6.home_price AS h6_home,
            h6.draw_price AS h6_draw,
            h6.away_price AS h6_away,
            h12.home_price AS h12_home,
            h12.draw_price AS h12_draw,
            h12.away_price AS h12_away,
            h24.home_price AS h24_home,
            h24.draw_price AS h24_draw,
            h24.away_price AS h24_away
           FROM ids i
             JOIN matches m ON m.hkjc_event_id = i.hkjc_event_id
             CROSS JOIN LATERAL ( SELECT s.id,
                    s.hkjc_event_id,
                    s.captured_at,
                    s.source,
                    s.market,
                    s.line,
                    s.home_price,
                    s.draw_price,
                    s.away_price,
                    s.over_price,
                    s.under_price,
                    s.raw
                   FROM odds_snapshots s
                  WHERE s.hkjc_event_id = i.hkjc_event_id AND s.source = 'FLASHSCORE_BET365'::text AND s.market = 'ML'::text
                  ORDER BY s.captured_at DESC
                 LIMIT 1) c
             CROSS JOIN LATERAL ( SELECT s.id,
                    s.hkjc_event_id,
                    s.captured_at,
                    s.source,
                    s.market,
                    s.line,
                    s.home_price,
                    s.draw_price,
                    s.away_price,
                    s.over_price,
                    s.under_price,
                    s.raw
                   FROM odds_snapshots s
                  WHERE s.hkjc_event_id = i.hkjc_event_id AND s.source = 'FLASHSCORE_BET365'::text AND s.market = 'ML'::text
                  ORDER BY s.captured_at
                 LIMIT 1) o
             LEFT JOIN LATERAL ( SELECT s.id,
                    s.hkjc_event_id,
                    s.captured_at,
                    s.source,
                    s.market,
                    s.line,
                    s.home_price,
                    s.draw_price,
                    s.away_price,
                    s.over_price,
                    s.under_price,
                    s.raw
                   FROM odds_snapshots s
                  WHERE s.hkjc_event_id = i.hkjc_event_id AND s.source = 'FLASHSCORE_BET365'::text AND s.market = 'ML'::text AND s.captured_at <= (c.captured_at - '01:00:00'::interval)
                  ORDER BY s.captured_at DESC
                 LIMIT 1) h1 ON true
             LEFT JOIN LATERAL ( SELECT s.id,
                    s.hkjc_event_id,
                    s.captured_at,
                    s.source,
                    s.market,
                    s.line,
                    s.home_price,
                    s.draw_price,
                    s.away_price,
                    s.over_price,
                    s.under_price,
                    s.raw
                   FROM odds_snapshots s
                  WHERE s.hkjc_event_id = i.hkjc_event_id AND s.source = 'FLASHSCORE_BET365'::text AND s.market = 'ML'::text AND s.captured_at <= (c.captured_at - '03:00:00'::interval)
                  ORDER BY s.captured_at DESC
                 LIMIT 1) h3 ON true
             LEFT JOIN LATERAL ( SELECT s.id,
                    s.hkjc_event_id,
                    s.captured_at,
                    s.source,
                    s.market,
                    s.line,
                    s.home_price,
                    s.draw_price,
                    s.away_price,
                    s.over_price,
                    s.under_price,
                    s.raw
                   FROM odds_snapshots s
                  WHERE s.hkjc_event_id = i.hkjc_event_id AND s.source = 'FLASHSCORE_BET365'::text AND s.market = 'ML'::text AND s.captured_at <= (c.captured_at - '06:00:00'::interval)
                  ORDER BY s.captured_at DESC
                 LIMIT 1) h6 ON true
             LEFT JOIN LATERAL ( SELECT s.id,
                    s.hkjc_event_id,
                    s.captured_at,
                    s.source,
                    s.market,
                    s.line,
                    s.home_price,
                    s.draw_price,
                    s.away_price,
                    s.over_price,
                    s.under_price,
                    s.raw
                   FROM odds_snapshots s
                  WHERE s.hkjc_event_id = i.hkjc_event_id AND s.source = 'FLASHSCORE_BET365'::text AND s.market = 'ML'::text AND s.captured_at <= (c.captured_at - '12:00:00'::interval)
                  ORDER BY s.captured_at DESC
                 LIMIT 1) h12 ON true
             LEFT JOIN LATERAL ( SELECT s.id,
                    s.hkjc_event_id,
                    s.captured_at,
                    s.source,
                    s.market,
                    s.line,
                    s.home_price,
                    s.draw_price,
                    s.away_price,
                    s.over_price,
                    s.under_price,
                    s.raw
                   FROM odds_snapshots s
                  WHERE s.hkjc_event_id = i.hkjc_event_id AND s.source = 'FLASHSCORE_BET365'::text AND s.market = 'ML'::text AND s.captured_at <= (c.captured_at - '24:00:00'::interval)
                  ORDER BY s.captured_at DESC
                 LIMIT 1) h24 ON true
        ), p AS (
         SELECT base.hkjc_event_id,
            base.kickoff_hkt,
            base.home_en,
            base.away_en,
            base.home_zh,
            base.away_zh,
            base.current_at,
            base.current_home,
            base.current_draw,
            base.current_away,
            base.opening_at,
            base.opening_home,
            base.opening_draw,
            base.opening_away,
            base.h1_home,
            base.h1_draw,
            base.h1_away,
            base.h3_home,
            base.h3_draw,
            base.h3_away,
            base.h6_home,
            base.h6_draw,
            base.h6_away,
            base.h12_home,
            base.h12_draw,
            base.h12_away,
            base.h24_home,
            base.h24_draw,
            base.h24_away,
                CASE
                    WHEN base.current_home > 0::numeric AND base.current_draw > 0::numeric AND base.current_away > 0::numeric THEN 1::numeric / base.current_home / (1::numeric / base.current_home + 1::numeric / base.current_draw + 1::numeric / base.current_away)
                    ELSE NULL::numeric
                END AS p_home,
                CASE
                    WHEN base.current_home > 0::numeric AND base.current_draw > 0::numeric AND base.current_away > 0::numeric THEN 1::numeric / base.current_draw / (1::numeric / base.current_home + 1::numeric / base.current_draw + 1::numeric / base.current_away)
                    ELSE NULL::numeric
                END AS p_draw,
                CASE
                    WHEN base.current_home > 0::numeric AND base.current_draw > 0::numeric AND base.current_away > 0::numeric THEN 1::numeric / base.current_away / (1::numeric / base.current_home + 1::numeric / base.current_draw + 1::numeric / base.current_away)
                    ELSE NULL::numeric
                END AS p_away,
                CASE
                    WHEN base.opening_home > 0::numeric AND base.opening_draw > 0::numeric AND base.opening_away > 0::numeric THEN 1::numeric / base.opening_home / (1::numeric / base.opening_home + 1::numeric / base.opening_draw + 1::numeric / base.opening_away)
                    ELSE NULL::numeric
                END AS op_home,
                CASE
                    WHEN base.opening_home > 0::numeric AND base.opening_draw > 0::numeric AND base.opening_away > 0::numeric THEN 1::numeric / base.opening_draw / (1::numeric / base.opening_home + 1::numeric / base.opening_draw + 1::numeric / base.opening_away)
                    ELSE NULL::numeric
                END AS op_draw,
                CASE
                    WHEN base.opening_home > 0::numeric AND base.opening_draw > 0::numeric AND base.opening_away > 0::numeric THEN 1::numeric / base.opening_away / (1::numeric / base.opening_home + 1::numeric / base.opening_draw + 1::numeric / base.opening_away)
                    ELSE NULL::numeric
                END AS op_away,
                CASE
                    WHEN base.h1_home > 0::numeric AND base.h1_draw > 0::numeric AND base.h1_away > 0::numeric THEN 1::numeric / base.h1_home / (1::numeric / base.h1_home + 1::numeric / base.h1_draw + 1::numeric / base.h1_away)
                    ELSE NULL::numeric
                END AS p1_home,
                CASE
                    WHEN base.h1_home > 0::numeric AND base.h1_draw > 0::numeric AND base.h1_away > 0::numeric THEN 1::numeric / base.h1_draw / (1::numeric / base.h1_home + 1::numeric / base.h1_draw + 1::numeric / base.h1_away)
                    ELSE NULL::numeric
                END AS p1_draw,
                CASE
                    WHEN base.h1_home > 0::numeric AND base.h1_draw > 0::numeric AND base.h1_away > 0::numeric THEN 1::numeric / base.h1_away / (1::numeric / base.h1_home + 1::numeric / base.h1_draw + 1::numeric / base.h1_away)
                    ELSE NULL::numeric
                END AS p1_away,
                CASE
                    WHEN base.h3_home > 0::numeric AND base.h3_draw > 0::numeric AND base.h3_away > 0::numeric THEN 1::numeric / base.h3_home / (1::numeric / base.h3_home + 1::numeric / base.h3_draw + 1::numeric / base.h3_away)
                    ELSE NULL::numeric
                END AS p3_home,
                CASE
                    WHEN base.h3_home > 0::numeric AND base.h3_draw > 0::numeric AND base.h3_away > 0::numeric THEN 1::numeric / base.h3_draw / (1::numeric / base.h3_home + 1::numeric / base.h3_draw + 1::numeric / base.h3_away)
                    ELSE NULL::numeric
                END AS p3_draw,
                CASE
                    WHEN base.h3_home > 0::numeric AND base.h3_draw > 0::numeric AND base.h3_away > 0::numeric THEN 1::numeric / base.h3_away / (1::numeric / base.h3_home + 1::numeric / base.h3_draw + 1::numeric / base.h3_away)
                    ELSE NULL::numeric
                END AS p3_away,
                CASE
                    WHEN base.h6_home > 0::numeric AND base.h6_draw > 0::numeric AND base.h6_away > 0::numeric THEN 1::numeric / base.h6_home / (1::numeric / base.h6_home + 1::numeric / base.h6_draw + 1::numeric / base.h6_away)
                    ELSE NULL::numeric
                END AS p6_home,
                CASE
                    WHEN base.h6_home > 0::numeric AND base.h6_draw > 0::numeric AND base.h6_away > 0::numeric THEN 1::numeric / base.h6_draw / (1::numeric / base.h6_home + 1::numeric / base.h6_draw + 1::numeric / base.h6_away)
                    ELSE NULL::numeric
                END AS p6_draw,
                CASE
                    WHEN base.h6_home > 0::numeric AND base.h6_draw > 0::numeric AND base.h6_away > 0::numeric THEN 1::numeric / base.h6_away / (1::numeric / base.h6_home + 1::numeric / base.h6_draw + 1::numeric / base.h6_away)
                    ELSE NULL::numeric
                END AS p6_away,
                CASE
                    WHEN base.h12_home > 0::numeric AND base.h12_draw > 0::numeric AND base.h12_away > 0::numeric THEN 1::numeric / base.h12_home / (1::numeric / base.h12_home + 1::numeric / base.h12_draw + 1::numeric / base.h12_away)
                    ELSE NULL::numeric
                END AS p12_home,
                CASE
                    WHEN base.h12_home > 0::numeric AND base.h12_draw > 0::numeric AND base.h12_away > 0::numeric THEN 1::numeric / base.h12_draw / (1::numeric / base.h12_home + 1::numeric / base.h12_draw + 1::numeric / base.h12_away)
                    ELSE NULL::numeric
                END AS p12_draw,
                CASE
                    WHEN base.h12_home > 0::numeric AND base.h12_draw > 0::numeric AND base.h12_away > 0::numeric THEN 1::numeric / base.h12_away / (1::numeric / base.h12_home + 1::numeric / base.h12_draw + 1::numeric / base.h12_away)
                    ELSE NULL::numeric
                END AS p12_away,
                CASE
                    WHEN base.h24_home > 0::numeric AND base.h24_draw > 0::numeric AND base.h24_away > 0::numeric THEN 1::numeric / base.h24_home / (1::numeric / base.h24_home + 1::numeric / base.h24_draw + 1::numeric / base.h24_away)
                    ELSE NULL::numeric
                END AS p24_home,
                CASE
                    WHEN base.h24_home > 0::numeric AND base.h24_draw > 0::numeric AND base.h24_away > 0::numeric THEN 1::numeric / base.h24_draw / (1::numeric / base.h24_home + 1::numeric / base.h24_draw + 1::numeric / base.h24_away)
                    ELSE NULL::numeric
                END AS p24_draw,
                CASE
                    WHEN base.h24_home > 0::numeric AND base.h24_draw > 0::numeric AND base.h24_away > 0::numeric THEN 1::numeric / base.h24_away / (1::numeric / base.h24_home + 1::numeric / base.h24_draw + 1::numeric / base.h24_away)
                    ELSE NULL::numeric
                END AS p24_away
           FROM base
        )
 SELECT hkjc_event_id,
    kickoff_hkt,
    home_en,
    away_en,
    home_zh,
    away_zh,
    current_at,
    current_home,
    current_draw,
    current_away,
    opening_at,
    opening_home,
    opening_draw,
    opening_away,
    h1_home,
    h1_draw,
    h1_away,
    h3_home,
    h3_draw,
    h3_away,
    h6_home,
    h6_draw,
    h6_away,
    h12_home,
    h12_draw,
    h12_away,
    h24_home,
    h24_draw,
    h24_away,
    p_home,
    p_draw,
    p_away,
    op_home,
    op_draw,
    op_away,
    p1_home,
    p1_draw,
    p1_away,
    p3_home,
    p3_draw,
    p3_away,
    p6_home,
    p6_draw,
    p6_away,
    p12_home,
    p12_draw,
    p12_away,
    p24_home,
    p24_draw,
    p24_away,
    round((p_home - op_home) * 100::numeric, 2) AS home_open_move_pp,
    round((p_draw - op_draw) * 100::numeric, 2) AS draw_open_move_pp,
    round((p_away - op_away) * 100::numeric, 2) AS away_open_move_pp,
    round((p_home - p1_home) * 100::numeric, 2) AS home_1h_move_pp,
    round((p_draw - p1_draw) * 100::numeric, 2) AS draw_1h_move_pp,
    round((p_away - p1_away) * 100::numeric, 2) AS away_1h_move_pp,
    round((p_home - p3_home) * 100::numeric, 2) AS home_3h_move_pp,
    round((p_draw - p3_draw) * 100::numeric, 2) AS draw_3h_move_pp,
    round((p_away - p3_away) * 100::numeric, 2) AS away_3h_move_pp,
    round((p_home - p6_home) * 100::numeric, 2) AS home_6h_move_pp,
    round((p_draw - p6_draw) * 100::numeric, 2) AS draw_6h_move_pp,
    round((p_away - p6_away) * 100::numeric, 2) AS away_6h_move_pp,
    round((p_home - p12_home) * 100::numeric, 2) AS home_12h_move_pp,
    round((p_draw - p12_draw) * 100::numeric, 2) AS draw_12h_move_pp,
    round((p_away - p12_away) * 100::numeric, 2) AS away_12h_move_pp,
    round((p_home - p24_home) * 100::numeric, 2) AS home_24h_move_pp,
    round((p_draw - p24_draw) * 100::numeric, 2) AS draw_24h_move_pp,
    round((p_away - p24_away) * 100::numeric, 2) AS away_24h_move_pp,
    round((1::numeric / current_home + 1::numeric / current_draw + 1::numeric / current_away - 1::numeric) * 100::numeric, 2) AS current_overround_pct
   FROM p;
