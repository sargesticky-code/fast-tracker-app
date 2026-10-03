-- Canonical provider / market quote contract for Fast Tracker.
-- This migration stores observed market prices without turning model/prediction
-- providers into bookmakers. Missing values stay NULL and never become zero.

create table if not exists public.market_provider_registry (
  provider_key text primary key,
  display_name text not null,
  provider_kind text not null check (provider_kind in (
    'BOOKMAKER','MARKET_AGGREGATOR','PREDICTION_PROVIDER',
    'STRENGTH_PROVIDER','RESULTS_PROVIDER','STATS_PROVIDER','INTERNAL_MODEL'
  )),
  is_bookmaker boolean not null default false,
  identity_authority boolean not null default false,
  price_authority boolean not null default false,
  credential_mode text,
  source_repo text,
  enabled boolean not null default true,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.market_provider_registry
  (provider_key,display_name,provider_kind,is_bookmaker,identity_authority,price_authority,credential_mode,source_repo,notes)
values
  ('HKJC','Hong Kong Jockey Club','BOOKMAKER',true,true,true,'PUBLIC_ENDPOINT','sargesticky-code/football-fast-tracker','Canonical fixture identity and primary price source'),
  ('BET365','Bet365','BOOKMAKER',true,false,false,'PLAYWRIGHT_PUBLIC_WEB','sargesticky-code/football-fast-tracker','Validated pipeline currently covers full-time HDA only'),
  ('ODDSMATH','OddsMath','MARKET_AGGREGATOR',false,false,false,'PUBLIC_HTML','sargesticky-code/football-fast-tracker','Aggregate/reference HDA signal; constituent bookmaker identities are not inferred'),
  ('FOREBET','Forebet','PREDICTION_PROVIDER',false,false,false,'PUBLIC_RENDERED_PAGE','sargesticky-code/football-fast-tracker','Prediction/model evidence, not bookmaker prices'),
  ('FOTMOB','FotMob','STATS_PROVIDER',false,false,false,'PUBLIC_REQUESTS','sargesticky-code/football-fast-tracker','Stats/H2H/identity enrichment'),
  ('SOFASCORE','SofaScore','STATS_PROVIDER',false,false,false,'PUBLIC_REQUESTS','sargesticky-code/football-fast-tracker','Stats/H2H enrichment')
on conflict (provider_key) do update set
  display_name=excluded.display_name,
  provider_kind=excluded.provider_kind,
  is_bookmaker=excluded.is_bookmaker,
  identity_authority=excluded.identity_authority,
  price_authority=excluded.price_authority,
  credential_mode=excluded.credential_mode,
  source_repo=excluded.source_repo,
  notes=excluded.notes,
  updated_at=now();

create table if not exists public.market_quote_observations (
  id bigint generated always as identity primary key,
  quote_key text not null unique,
  canonical_match_id text not null,
  provider_key text not null references public.market_provider_registry(provider_key),
  market text not null check (market in ('HDA','ASIAN_HANDICAP','GOALS','BTTS','CORNERS')),
  selection text not null,
  line numeric,
  decimal_price numeric check (decimal_price is null or decimal_price > 1),
  observed_at timestamptz,
  source_record_id text,
  identity_confidence numeric check (identity_confidence is null or (identity_confidence >= 0 and identity_confidence <= 1)),
  status text not null default 'UNKNOWN',
  source_payload jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

create index if not exists ix_market_quote_match_market
on public.market_quote_observations(canonical_match_id,market,observed_at desc);

-- Internal canonical market data is service-role only until a reviewed public API
-- contract explicitly exposes selected fields.
alter table public.market_provider_registry enable row level security;
alter table public.market_quote_observations enable row level security;
revoke all on table public.market_provider_registry from anon, authenticated;
revoke all on table public.market_quote_observations from anon, authenticated;

create or replace view public.market_quote_current as
select distinct on (canonical_match_id,provider_key,market,selection,coalesce(line,-999999::numeric))
  id,
  quote_key,
  canonical_match_id,
  provider_key,
  market,
  selection,
  line,
  decimal_price,
  observed_at,
  source_record_id,
  identity_confidence,
  status,
  source_payload,
  ingested_at
from public.market_quote_observations
order by
  canonical_match_id,
  provider_key,
  market,
  selection,
  coalesce(line,-999999::numeric),
  observed_at desc nulls last,
  ingested_at desc;

revoke all on table public.market_quote_current from anon, authenticated;

comment on table public.market_quote_observations is
'Canonical observed market quotes. Provider classification comes from market_provider_registry; model/prediction sources are not bookmaker quotes. NULL means unknown/missing, never zero.';
