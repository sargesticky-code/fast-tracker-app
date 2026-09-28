export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "fast-tracker-public",
      build: "DASH-STABLE-20260928-1",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    }
  );
}
