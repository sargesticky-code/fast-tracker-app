# Flashscore-native identity cutover

The owner authorized removing HKJC identity from all current matching paths, accepting unavailable mappings rather than continuing legacy joins. The release base is `3d9755a95e24b2e060dae5853829a26eee8d5f80` on `release/ft-advisers-fotmob-20261011`.

The migration rebuilds the existing team entities, source identity view and alias supertable with `FS_TEAM:<provider team ID>` keys from raw Flashscore event/team/league IDs and provider kickoff epochs. It seeds provider aliases only from exact, oriented, time-qualified source-to-Flashscore event evidence. Ambiguous names cannot become global identities. The existing five-argument adviser matcher now resolves verified provider aliases directly to the same Flashscore fixture team IDs.

Old current identity rows are archived privately; historical predictions/results remain intact. Ancillary lineup/player facts retain their data while their retired team link is separately archived by stable primary key and detached. Constraints reject old/non-native keys. Name-only/legacy seeders and Forebet alias learners are retired; Forebet collection and forecast publication are preserved. The existing 15-minute scout job maintains the new identity graph without any additional provider request.

Verification before cutover: full application build passed; Playwright public-flow suite passed 62/62 desktop/mobile tests. An actual-database BEGIN/ROLLBACK integration test passed native backfill, legacy-key rejection, exact archive count, replay idempotence, same-name/different-ID ambiguity, reversed home/away learning rejection, native alias event matching, missing kickoff rejection and supplied-provider-ID gating. Initial slow trial operations were cancelled or timed out and verified rolled back. The optimized migration uses bounded per-table detachment for ancillary evidence.

Production baseline: compact feed returned 229 fixtures, 15 external adviser records and 47 Forebet records. Odds coverage was already zero in that snapshot. Original dirty worktrees are untouched. No recurring automation has been resumed.

Rollout: apply the core migration transaction once, reconcile its catalog state before retrying an uncertain response, then invoke the private bounded detachment function once per remaining ancillary table. Verify zero retired keys across all current key columns, all source identities Flashscore-native, provider lookup and full/compact/browser outputs. Do not restore HKJC keys on rollback: stop the new refresher and leave missing identity unmapped while correcting the native migration.

Status: source implementation and integration verification complete; production cutover pending.
