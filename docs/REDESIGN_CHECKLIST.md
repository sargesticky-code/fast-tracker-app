# Raw dashboard acceptance

- [x] Forebet-inspired fixture-first homepage with competition groups, compact date navigation, team logos and 1/X/2 market columns; engineering/source metadata removed from fixture rows while stale prices remain explicitly marked
- [x] Verified score/probability/goals/corners appear only when exact-ID-linked evidence has complete numeric inputs; detailed stats remain on the match detail route
- [x] Flashscore team names display the matching Supabase sprite logo when the source name or a unique verified name variant resolves; ambiguous or missing assets remain text-only
- [x] Desktop/mobile regression verifies abbreviated Coventry and Newcastle names resolve to their correct logo tiles
- [x] Flashscore-only raw fixture flow
- [x] All discovered fixtures retained, including missing quotes/time
- [x] Source-only date/competition filters
- [x] No inferred UTC kickoff or model values
- [x] Native data preserved during provider schema removal
- [x] Static build and desktop/mobile/source-error checks
- [ ] Exact commit deployment and real public browser acceptance
- [ ] Physical removal of four remote retired Edge Functions (CLI login required)
