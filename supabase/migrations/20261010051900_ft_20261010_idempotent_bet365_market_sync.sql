-- Mirror applied production optimization: avoid repeated writes of identical bookmaker captures.
CREATE OR REPLACE FUNCTION phase4.refresh_bet365_quotes()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'phase4', 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  -- Only deactivate an existing Bet365 row when its valid source
  -- selection has disappeared; unchanged snapshots are not rewritten.
  update phase4.market_quotes_current q
     set active=false,updated_at=now()
   where q.provider_id='BET365' and q.market_key='HAD_1X2' and q.active=true
     and not exists (
       select 1 from public.bookmaker_odds_current b
       where b.match_id=q.match_id
         and coalesce(nullif(b.bet365_fixture_id,''),b.match_id)=q.external_event_id
         and b.kickoff_hkt>=now()-interval '6 hours'
         and b.kickoff_hkt<now()+interval '72 hours'
         and case q.selection_key
           when 'HOME' then b.bet365_home
           when 'DRAW' then b.bet365_draw
           when 'AWAY' then b.bet365_away
           else null end > 1
     );

  insert into phase4.market_quotes_current(
    provider_id,external_event_id,match_id,market_key,period_key,line_key,
    selection_key,odds_decimal,effective_odds_decimal,liquidity,currency,
    commission_rate,settlement_key,compatibility_verified,source_ts,fetched_at,
    active,metadata,updated_at
  )
  select
    'BET365',
    coalesce(nullif(b.bet365_fixture_id,''),b.match_id),
    b.match_id,
    'HAD_1X2','FULL_TIME','',
    v.selection_key,v.odds,v.odds,null,'HKD',0,
    'SOCCER_90M_1X2',
    coalesce(b.match_quality,0)>=0.90,
    b.fetched_at,b.fetched_at,true,
    jsonb_build_object(
      'match_quality',b.match_quality,
      'league',b.league,
      'home',b.home,
      'away',b.away,
      'source',b.source
    ),
    now()
  from public.bookmaker_odds_current b
  cross join lateral (values
    ('HOME',b.bet365_home),
    ('DRAW',b.bet365_draw),
    ('AWAY',b.bet365_away)
  ) as v(selection_key,odds)
  where b.match_id is not null
    and v.odds is not null and v.odds>1
    and b.kickoff_hkt>=now()-interval '6 hours'
    and b.kickoff_hkt<now()+interval '72 hours'
  on conflict(provider_id,external_event_id,market_key,period_key,line_key,selection_key)
  do update set
    match_id=excluded.match_id,
    odds_decimal=excluded.odds_decimal,
    effective_odds_decimal=excluded.effective_odds_decimal,
    settlement_key=excluded.settlement_key,
    compatibility_verified=excluded.compatibility_verified,
    source_ts=excluded.source_ts,
    fetched_at=excluded.fetched_at,
    active=true,
    metadata=excluded.metadata,
    updated_at=now()
  where (
    market_quotes_current.match_id,
    market_quotes_current.odds_decimal,
    market_quotes_current.effective_odds_decimal,
    market_quotes_current.settlement_key,
    market_quotes_current.compatibility_verified,
    market_quotes_current.source_ts,
    market_quotes_current.fetched_at,
    market_quotes_current.active,
    market_quotes_current.metadata
  ) is distinct from (
    excluded.match_id,
    excluded.odds_decimal,
    excluded.effective_odds_decimal,
    excluded.settlement_key,
    excluded.compatibility_verified,
    excluded.source_ts,
    excluded.fetched_at,
    true,
    excluded.metadata
  );

  get diagnostics n=row_count;
  return n;
end
$function$
;
