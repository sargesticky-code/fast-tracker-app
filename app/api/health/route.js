export const dynamic = "force-static";

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "fast-tracker-public",
      build: "FAST-TRACKER-PUBLIC",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "cache-control": "public, max-age=60",
      },
    }
  );
}
