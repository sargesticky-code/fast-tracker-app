# Source-record traceability and player identity audit — 2026-10-03

Status: **REVIEW-ONLY HARDENING IN PROGRESS**

No merge, deployment, migration application, wider scraping or paid access was performed.

## Scope

This bounded batch audits the path from stored player/injury evidence through canonical player identity, match detail, deterministic analysis, English article rendering and public-flow checks. It also extends source independence from provider labels to underlying record lineage.

## PR #34 validation boundary

Forebet outage PR #34 remains draft and unmerged.

Two validation facts must not be conflated:

1. Earlier branch validation run `37104736951` proved the zero-Forebet-model outage path could complete with explicit unresolved classifications. That run was on the earlier validation branch and was not the clean PR #34 exact head.
2. Clean PR #34 exact head `47aecdc653c44500d1fb1b85b4e7047197b11bb7` subsequently passed both:
   - Forebet Daily Feed run `37105406481`;
   - Graph Sandwich Phase 1 Shadow Validation run `37105408690`.

After removing the residual generated artifacts, final clean PR #34 exact head `ac6616828ca873e701aa648def42c85df97a9462` passed Forebet Daily Feed run `37106384758`. Its final diff is three files only: the Forebet workflow, reconciliation script and deterministic test. The workflow gates both feed-commit steps with `github.ref == 'refs/heads/main'`, so review-branch validations cannot publish generated data.

PR #33 is explicitly marked **SUPERSEDED BY PR #34 — do not merge**. It remains draft, open and unmerged.

## Stored player-identity reality

The Phase 2 evidence schema allows a source row to be marked `confirmed=true`, but neither `phase2_player_status_evidence.player_key` nor `phase2_match_lineup_evidence.player_key` has a foreign-key constraint to `phase2_players`.

That distinction matters in the current data.

### Player-status evidence

Current census at audit time:

| Source / state | Rows | Canonical player match | Unresolved canonical identity |
| --- | ---: | ---: | ---: |
| API_FOOTBALL · confirmed | 162 | 162 | 0 |
| FOTMOB · confirmed | 408 | 0 | 408 |
| FotMob · unconfirmed | 4 | 0 | 4 |
| other stored press/manual rows | 10 | 0 | 10 |
| **Total** | **584** | **162** | **422** |

A source's own `confirmed=true` flag therefore cannot be treated as proof that Fast Tracker has resolved the player identity.

### Lineup evidence

Current lineup census shows the same issue:

- API_FOOTBALL confirmed lineup rows: 3,238 canonical / 3,238;
- FLASHSCORE_OFFICIAL confirmed rows: 0 canonical / 8,827;
- FOTMOB_PREDICTED: 0 canonical / 9,135;
- SPORTS_MOLE_PREDICTED: 0 canonical / 44.

An “official” provider label is a statement about the source event, not proof that each stored player row has been reconciled to the canonical player registry.

## Real evidence cases

### Canonically resolved confirmed fact

Stored row `phase2_player_status_evidence:178`:

- event: FB5829;
- side: A;
- player key: `APIF:108643`;
- canonical player registry match: `APIF:108643`, G. Segal;
- status: `MISSING FIXTURE` / `Leg Injury`;
- source-confirmed: true;
- confidence: 0.95;
- source: API_FOOTBALL;
- source link is stored.

Under the review contract this can become `fact_status=CONFIRMED`, because source confirmation and canonical identity are both present.

This is historical stored evidence, not a claim that API_FOOTBALL is a current permitted upstream source.

### Source-confirmed but identity unresolved

A real current-table example from event FB6115 includes FOTMOB evidence for Nico O'Reilly:

- source-confirmed: true;
- confidence: 0.90;
- status: injury / doubtful;
- source link: stored FotMob match URL;
- player key has no corresponding canonical `phase2_players` row.

It therefore becomes `SOURCE_CONFIRMED_IDENTITY_UNRESOLVED`, never `CONFIRMED`.

### Ambiguous / unconfirmed

Stored event FB5749 includes Lukas Provod:

- source: FotMob;
- ankle-injury text with expected-return wording;
- `confirmed=false`;
- confidence 0.87;
- no canonical player match.

It remains `UNCONFIRMED` with unresolved identity.

### Missing evidence

Current upcoming fixtures such as FB6123 have no player-status rows. The correct article state is unknown coverage, not “zero injuries”.

## Review implementation

### Durable source-record traceability

`app-match-detail` now annotates player and lineup rows with:

- `evidence_key`, using the durable table row id when available;
- `source_link`, copied only when a stored source URL exists;
- `identity_status`: `CANONICAL` or `UNRESOLVED`;
- `fact_status`: `CONFIRMED`, `SOURCE_CONFIRMED_IDENTITY_UNRESOLVED`, or `UNCONFIRMED`;
- `canonical_player_identity` when resolved;
- `record_group`, representing the underlying canonical player/status claim rather than the provider label.

Material model/market claims also carry durable keys where the source record is known:

- `hkjc_odds_current:<event>`;
- `form_predictions:<event>`;
- `model_predictions:<event>`.

Source links are rendered only when actually stored. Missing URLs remain unavailable rather than being invented.

### Canonical identity gate

Both `app-match-detail` and `app-match-analysis` resolve evidence keys against `phase2_players` before treating a player fact as confirmed.

If the canonical-player lookup fails, the code fails closed: no row is upgraded to confirmed.

The detail UI and English article now distinguish:

- “Confirmed source + canonical player identity”;
- “Source reports status · player identity unresolved”;
- “Unconfirmed status · player identity unresolved”.

A source-confirmed lineup with unresolved player identities is rendered as partial identity reconciliation, not as a confirmed XI.

### Injury counts

The former H/A bug was found during the audit: stored `team_side` values are `H` / `A`, while older detail/analysis logic looked for `HOME` / `AWAY`.

Review code normalizes both forms and counts only canonically resolved confirmed player-status claims. Missing evidence stays null/unknown instead of becoming zero.

## Record-level independence

Provider names are not an independence key.

For human evidence, confirmed claims are de-duplicated by the underlying record group:

- fixture;
- side;
- canonical player identity;
- status type;
- status value.

Thus two providers repeating the same canonical player/status fact create one claim, not two independent facts.

For model evidence:

- known shared historical lineages collapse to one provenance family;
- unknown lineage is not allowed to count as independent evidence;
- the multi-source aggregate remains supplemental because its member record lineage is not explicit enough to prove independence;
- distinct provider labels alone do not add an evidence vote.

This rule is applied in both `app-match-analysis` and the public `lib/fast-tracker.js` path.

## Training-period boundary

Dixon-Coles training match counts and source/model league are recorded, but the current artifact does not contain exact training-period start/end dates.

The English article therefore continues to state:

> Historical period: not recorded in the current model artifact

No period is inferred or manufactured.

## Tests / acceptance

Review CI now includes:

- real-evidence safety contract;
- evidence-independence contract;
- player-evidence identity contract;
- static build;
- rendered public-flow tests.

Rendered cases cover:

1. a canonical confirmed player row with evidence key and source link;
2. a source-confirmed but canonically unresolved player;
3. an unconfirmed ambiguous injury row;
4. no player-status evidence;
5. an official-source lineup whose player identity is unresolved;
6. a fully canonical confirmed lineup.

The player-evidence identity contract also verifies that two provider-labelled records describing the same underlying player/status fingerprint collapse to one record group.

## Ingestion gap

The active repositories do not expose a current dedicated writer that reconciles FOTMOB/Flashscore player keys into `phase2_players` before inserting these evidence rows, and the database schema does not enforce a canonical-player FK.

Therefore this batch deliberately fixes the consumption boundary rather than inventing canonical mappings. The exact remaining dependency is a future bounded ingestion/identity-map path that can prove external player id → canonical player identity before promotion.

No database migration was applied in this batch.

## Remaining gaps

- Existing FOTMOB and FLASHSCORE_OFFICIAL rows remain mostly unresolved in the canonical registry; review code now displays that truth rather than promoting them.
- Source URLs are absent for some model/feed records, so an evidence key is available while a clickable external attribution is not.
- Dixon-Coles exact source period remains unknown.
- Live player-status changes do not yet have a separate record-lineage/freshness contract comparable to live market quotes.
- The article has source-record attribution for the audited claims, but other narrative claims still need a field-by-field provenance census.
- Public homepage/model-agreement logic has been hardened to provenance-distinct families in review, but production remains unchanged until a later release gate.

## Next bounded task

Audit **live and article claim provenance** without deployment:

1. trace every live score/stat/market and narrative claim to its durable source record + as-of time;
2. detect duplicate live records describing the same provider event/observation;
3. ensure stale or unresolved live identity can never appear as confirmed/current;
4. add rendered tests for one real live record, one duplicate/correlated record, one stale record and one absent record;
5. update the source-provenance matrix without widening scraping or applying migrations.
