# Market Quote Migration and Deployment Review

Status: **REVIEWED / NOT APPLIED**  
Target project: `hekqxhgjexzxnecwhyao`  
PR: #2 (`homepage-forebet-v1`)

This is the production-change review artifact for the canonical provider/market quote contract. It is intentionally separate from implementation commits. Nothing in this document authorizes a production migration, Edge Function deployment, Railway deployment or PR merge.

## Change set under review

- Migration: `supabase/migrations/202610030530_market_provider_quote_contract.sql`
- Normalization contract: `lib/market-provider-contract.js`
- Ingestion implementation: `supabase/functions/sync-fast-tracker/index.ts`
- Analysis freshness hardening: `supabase/functions/app-match-analysis/index.ts`
- Public rendering safeguards: `components/match-detail-client.js`, `components/evidence-article.js`

## Production prerequisites

Before applying the migration:

1. PR build/contract/browser tests must be green on the exact reviewed code head.
2. Production migration history must still show no migration with this name/version.
3. `public.market_provider_registry`, `public.market_quote_observations`, and `public.market_quote_current` must still be absent, or any unexpected object must be reviewed before proceeding.
4. Existing source tables must remain readable by the service role:
   - `hkjc_odds_current`
   - upstream synchronized Bet365 artifact/table when rows exist
   - OddsMath synchronized artifact when rows exist
5. No claim of multi-bookmaker coverage is permitted unless two distinct `BOOKMAKER` providers have fresh, matched observations for the same canonical match/market/line/selection.
6. Production schema application must receive the project's explicit production-change approval. This review does not provide it.

## Access-policy review

The proposed new objects are internal canonical market data, not direct anonymous API surfaces.

Migration requirements already included:

- RLS enabled on `market_provider_registry`
- RLS enabled on `market_quote_observations`
- anon/authenticated direct privileges revoked on both tables
- anon/authenticated direct privileges revoked on `market_quote_current`
- service-role backend ingestion remains the intended writer/reader
- no permissive public policy is added by this migration

Existing Supabase security advisory is separate: RLS is currently disabled on `phase1_identity_deferred_queue`, `phase1_h2h_provider_event_map`, and `phase1_h2h_provider_meetings`. Do not bundle an unreviewed policy change for those tables into this market migration.

## Pre-apply read-only validation

Run/read the equivalents of:

```sql
select version, name
from supabase_migrations.schema_migrations
where name ilike '%market_provider%' or name ilike '%market_quote%';

select table_schema, table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('market_provider_registry','market_quote_observations');

select count(*) as bet365_rows from public.bet365_current;
select count(*) as bet365_event_map_rows from public.bet365_event_map;
```

Expected at the review snapshot:

- new market-provider tables absent
- Bet365 current rows = 0
- Bet365 event-map rows = 0

Any changed result requires re-review.

## Apply sequence after approval

1. Apply only `202610030530_market_provider_quote_contract.sql` using the normal Supabase migration mechanism.
2. Verify schema, constraints, RLS flags and privileges before deploying ingestion changes.
3. Do **not** backfill fabricated/missing fields. Unknown line, price, timestamp and identity confidence remain NULL.
4. Deploy the reviewed `sync-fast-tracker` version only after schema verification.
5. Run one synchronization cycle.
6. Query the normalized rows for one known HKJC event and compare every market/selection/line/price/as-of field to the source table.
7. Verify Bet365 inserts remain zero if the source artifact remains empty.
8. Verify OddsMath rows are classified `MARKET_AGGREGATOR` and are never counted as a second bookmaker.
9. Only then consider deploying analysis/public consumers. Railway/PR production deployment is a separate approval gate.

## Post-apply validation

Minimum validation queries:

```sql
select provider_key, provider_kind, is_bookmaker, identity_authority, price_authority
from public.market_provider_registry
order by provider_key;

select canonical_match_id, provider_key, market, selection, line,
       decimal_price, observed_at, identity_confidence, status
from public.market_quote_current
where canonical_match_id = '<reviewed FB event>'
order by provider_key, market, selection;

select provider_key, count(*)
from public.market_quote_current
group by provider_key
order by provider_key;
```

Validation conditions:

- HKJC source values equal their source snapshot.
- observation time is source time, not ingestion time.
- no missing value has become zero.
- no provider is marked bookmaker unless registry classification is `BOOKMAKER`.
- a best-price comparison remains unavailable with fewer than two distinct bookmaker providers for the same normalized market/line/selection.
- stale/post-kickoff prematch quotes remain reference-only and cannot produce actionable edge.

## Application/analysis validation

For a real match:

- compare canonical fixture id, teams and kickoff;
- compare source quote and observation timestamp;
- check independent evidence-family count;
- check goals/corners/Asian line-specific inputs;
- verify missing injury/player evidence remains unknown;
- verify lineup starters and substitutes are counted separately;
- verify stale/historical quote produces `DATA_RISK / NO_BET` or equivalent fail-closed public behavior.

## Recovery / rollback

The migration is additive. Preferred recovery is **disable consumers first**, not destructive schema rollback.

If ingestion or consumers misbehave:

1. stop/deactivate the new normalized quote ingestion path;
2. revert consumer code to existing HKJC/current-source reads;
3. preserve the newly created tables for forensic comparison;
4. do not drop observations during an incident;
5. if schema removal is later approved, export/retain rows and then use a separately reviewed destructive migration.

If an Edge Function deployment causes regressions, redeploy the previously recorded active function version/source. Do not solve a runtime regression by merging PR #2 or changing Railway production.

## Release gates still open

- Production migration approval.
- Exact-head CI success after the latest freshness/lineup fixes.
- Direct inspection of a real post-fix `app-match-analysis` response after that function is deployed; branch code alone does not change active production version 32.
- Real second-bookmaker matched rows before enabling multi-bookmaker UI.
- Production Railway/PR merge approval.
