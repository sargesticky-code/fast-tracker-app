# Raw dashboard acceptance

- [x] Flashscore team names display the matching Supabase sprite logo when the source name or a unique verified name variant resolves; ambiguous or missing assets remain text-only
- [x] Desktop/mobile regression verifies abbreviated Coventry and Newcastle names resolve to their correct logo tiles
- [x] Flashscore-only raw fixture flow
- [x] All discovered fixtures retained, including missing quotes/time
- [x] Raw fixture records retained for direct detail and audit, while homepage alone suppresses provider-finished/cancelled/abandoned fixtures
- [x] Exact canonical kickoff older than 5h and raw source calendar dates older than yesterday are suppressed from homepage; never interpret unverified time_text as UTC
- [x] Forecasts and result archives remain untouched and independent of the active dashboard
- [x] Source-only date/competition filters
- [x] No inferred UTC kickoff or model values
- [x] Native data preserved during provider schema removal
- [x] Static build and desktop/mobile/source-error checks
- [ ] Fixture-visibility PR CI and rendered desktop/mobile acceptance
- [ ] Exact commit deployment and real public browser acceptance
- [ ] Physical removal of four remote retired Edge Functions (CLI login required)
