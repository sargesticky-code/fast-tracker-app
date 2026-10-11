# Dashboard snapshot in Supabase Storage

The dashboard's rich `app-phase1-feed?hours=24` response is published as the single object `fast-tracker-dashboard/current.json`. A GitHub Actions workflow runs every five minutes and authenticates to the publisher Edge Function with GitHub OIDC. The function accepts only this repository's `main` workflow, fetches the public feed, validates its shape and 900 KB size limit, then overwrites the object.

The bucket is public because the payload is already served to anonymous dashboard visitors. It is separate from the private `fast-tracker-ingest` bucket. The publisher's service key stays in the Edge Function; the workflow receives only a short-lived OIDC token. No archive is kept, so the snapshot object does not grow over time. A one-megabyte bucket object limit is a second guardrail.

The site accepts only schema version 1 snapshots whose feed and publication timestamps are both no more than 12 minutes old. Missing, invalid or stale snapshots fall back to the existing public feed endpoint. Live match overlays continue to use their current endpoint and cadence.

## Production activation order

1. Apply the bucket migration.
2. Deploy `publish-dashboard-snapshot` with platform JWT verification disabled; the function verifies the GitHub OIDC signature, audience, repository, branch, workflow path and event itself.
3. Merge the workflow and frontend changes to `main`; wait for the first scheduled publish and confirm its returned byte count is below 900 KB.
4. Release the frontend and verify `current.json` is public, fresh, and the app falls back to the feed endpoint if the object is unavailable.

Do not publish raw collector payloads or credentials in this bucket. Track Storage/API log volume after release: moving repeated database-backed feed assembly to one scheduled publish should reduce fan-out, but Storage requests still produce platform traffic and the actual log-ingest change must be measured.
