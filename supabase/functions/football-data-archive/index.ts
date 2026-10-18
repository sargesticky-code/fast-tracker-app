import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

// Phase 22: deliberately separate from the live Football-Data collector.
// No cron, writes to model tables, or automatic historical downloads.
const BUCKET = "fast-tracker-ingest";
const SEASONS = new Set(["2223", "2324", "2425", "2526"]);
const LEAGUES = new Set(["E0","E1","E2","E3","EC","SC0","SC1","SC2","SC3","D1","D2","I1","I2","SP1","SP2","F1","F2","N1","B1","P1","T1","G1"]);
const MAX_BYTES = 4_500_000; // existing private bucket is limited to 5 MiB per object

function serviceKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; }
  catch { return ""; }
}
function bad(message: string, status = 400): Response {
  return Response.json({ok:false,error:message}, {status});
}
function sha256(data: Uint8Array): Promise<string> {
  return crypto.subtle.digest("SHA-256", data).then(buf =>
    [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join(""));
}
async function sourceCsv(season: string, league: string): Promise<{bytes:Uint8Array,hash:string,rows:number,url:string}> {
  const url = "https://www.football-data.co.uk/mmz4281/" + season + "/" + league + ".csv";
  const response = await fetch(url, {
    headers: {"Accept":"text/csv,text/plain;q=0.9,*/*;q=0.1","User-Agent":"FastTrackerPrivateHistoricalArchive/1.0"},
    signal: AbortSignal.timeout(18000)
  });
  if (!response.ok) throw new Error("source_http_" + response.status);
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_BYTES) throw new Error("source_too_large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 80 || bytes.byteLength > MAX_BYTES) throw new Error("invalid_size");
  const value = new TextDecoder("utf-8", {fatal:true}).decode(bytes).replace(/^\uFEFF/,"");
  if (/^\s*</.test(value)) throw new Error("html_not_csv");
  const lines = value.split(/\r?\n/).filter(x=>x.trim().length>0);
  const cols = lines[0].split(",").map(s=>s.replace(/^"|"$/g,"").trim());
  for (const name of ["Div","Date","HomeTeam","AwayTeam","FTHG","FTAG"]) {
    if (!cols.includes(name)) throw new Error("required_csv_column_missing_" + name);
  }
  if (lines.length < 2) throw new Error("no_csv_rows");
  const divPosition = cols.indexOf("Div");
  const firstRow = lines[1].split(",");
  if (firstRow[divPosition]?.trim().replace(/^"|"$/g,"") !== league) throw new Error("league_mismatch");
  return {bytes,hash:await sha256(bytes),rows:lines.length-1,url};
}

Deno.serve(async req => {
  if (req.method !== "GET") return bad("method_not_allowed",405);
  const u = new URL(req.url);
  const season = u.searchParams.get("season") || "";
  const league = u.searchParams.get("league") || "";
  // No arbitrary hosts, filenames, provider codes, or unbounded season loops.
  if (!SEASONS.has(season) || !LEAGUES.has(league)) return bad("unsupported_archive_selection");
  const key = serviceKey();
  const endpoint = Deno.env.get("SUPABASE_URL") || "";
  if (!key || !endpoint) return bad("server_config_missing",500);
  const db = createClient(endpoint,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const cronKey = req.headers.get("x-ft-cron-key");
  if (!cronKey) return bad("unauthorized",401);
  const authorization = await db.rpc("ft_internal_cron_key_matches",{p_key:cronKey});
  if (authorization.error || authorization.data !== true) return bad("unauthorized",401);
  try {
    const source = await sourceCsv(season,league);
    const dir = "football-data/history/" + season;
    const csvName = league + ".csv";
    const objectPath = dir + "/" + csvName;
    const folder = await db.storage.from(BUCKET).list(dir,{limit:100,search:csvName});
    if (folder.error) throw new Error("storage_list_failed");
    const exists = (folder.data || []).some(item=>item.name === csvName);
    let status: "UPLOADED" | "EXISTS_VERIFIED" = "UPLOADED";
    if (exists) {
      const current = await db.storage.from(BUCKET).download(objectPath);
      if (current.error || !current.data) throw new Error("storage_read_failed");
      const currentHash = await sha256(new Uint8Array(await current.data.arrayBuffer()));
      if (currentHash !== source.hash) return bad("archived_source_changed_review_required",409);
      status = "EXISTS_VERIFIED";
    } else {
      const upload = await db.storage.from(BUCKET).upload(objectPath,source.bytes,{
        contentType:"text/csv",cacheControl:"3600",upsert:false
      });
      if (upload.error) throw new Error("storage_upload_failed");
    }
    const manifest = {
      source:"FOOTBALL_DATA_UK",season,league,source_url:source.url,
      object_path:objectPath,content_sha256:source.hash,bytes:source.bytes.byteLength,
      raw_line_count:source.rows,archived_at:new Date().toISOString(),
      use:"PRIVATE_HISTORICAL_RESEARCH",retrospective_only:true
    };
    const manifestObject = new TextEncoder().encode(JSON.stringify(manifest,null,2)+"\n");
    const written = await db.storage.from(BUCKET).upload(dir+"/"+league+".manifest.json",manifestObject,{
      contentType:"text/plain",cacheControl:"3600",upsert:true
    });
    if (written.error) throw new Error("manifest_upload_failed");
    return Response.json({ok:true,status,season,league,rows:source.rows,bytes:source.bytes.byteLength,
      sha256:source.hash,object_path:objectPath,manifest_path:dir+"/"+league+".manifest.json"});
  } catch (e) {
    const message = e instanceof Error ? e.message : "archive_failure";
    console.error("football_data_archive_failure",season,league,message);
    return bad(message,502);
  }
});
