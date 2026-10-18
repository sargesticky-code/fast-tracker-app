# Phase 49 — Form results must belong to the right Premier League

October 18 production audit:
- Flashscore's source label `Premier League` occurs across **multiple native competition IDs** worldwide.
- Verified English top-flight native competition is `SY30SsKF`. Examples with exact native ID: Leeds–Manchester Utd, Brighton–Crystal Palace, Bournemouth–Sunderland; other source IDs included BKMA–Ararat-Armenia (`lSrMnn3j`), Kairat–Ertis (`2oYmnYDd`), etc.
- Prior `ft_fast_flashscore_summary` passed `f.league='Premier League'` directly into `ft_historical_form_by_team`, which maps this label to Football-Data `E0`. This is **not enough** to prove a fixture belongs to English `E0`. Identical-looking team names can attach England form to foreign competition fixtures.
- The previous function also accepted native league ID independent of team identities; all five sampled real English fixtures' source names and oriented home/away agreed exactly with canonical, with ~60sec aligned kickoffs and recent source capture.

Bounded fail-closed fix: for only `Premier League` display label, require exact native Flashscore league `SY30SsKF`, `VERIFIED_IDENTITY` both canonical and shadow, source `FLASHSCORE`, orientation equality, kickoff alignment <=60 seconds, source fetched within seven days and raw exact authority `AB=1`. If not, show unknown (null) form. Do **not** invent league from team names or change form algorithm. Other already-supported labels retain existing behavior and will receive separately researched native ID guards in subsequent batches.

No new crawling, model outputs, paid services, row changes, or cron updates. Safety tests cover both home/away form gates. After applying, verify public summary returns English Premier League historical form for verified E0 teams (where 3+ actual results exist), and null form for foreign competitions also labeled Premier League. Ensure endpoints remain HTTP 200 and client not presenting unknown as 0.

**Additional underlying issue:** historical `model_predictions` and `form_predictions` are legacy HKJC-linked and stale as of October 5; this change does not promote them. Current Football-Data and independent native models remain experimental until prospective validation.
