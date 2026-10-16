# Overnight task history

## FT-OVERNIGHT-001 — Forebet accepted forecasts missing from cards

- Start: 2026-10-17 01:59 HKT
- End: 2026-10-17 02:04 HKT
- Defect: fresh raw fixture snapshots omitted canonical fixtures that carried current accepted/tentative Forebet forecasts.
- Evidence: 16/67 accepted and 4/14 tentative IDs absent from 360 raw discoveries but present in the 475-row canonical summary; all provisional data remained current and kickoff matched.
- Change: append only missing valid `FLASHSCORE_CANONICAL` fixture rows by exact ID, preserving raw row precedence.
- Verification: full production build passed; public-flow Playwright 63/63 passed (mocked endpoints; desktop and mobile cases included).
- Git: branch `codex/overnight-001-forebet`; PR pending.
- Production: unchanged.
- Data impact: the local corrected pipeline can render 16 additional accepted and 4 additional tentative rows in this measured snapshot. Production impact is not verified until deployment.
- Blocker: review/PR and separately authorized production deployment.
- Next: FT-OVERNIGHT-002, inspect one-team matching counterchecks and automatic revocation.
