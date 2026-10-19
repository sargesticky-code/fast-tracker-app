import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import {evaluateFootballDataWalkForward} from "./football-data-retrospective-evaluation.mjs";

// Phase 25: authenticated, one-league-at-a-time, read-only retrospective evaluation.
// No public CORS, writes, new cron, bookmaker usage or verified-model publication.
const LEAGUES=new Set(["E0","D1","SP1","I1","F1","N1","P1"]);
const MAX_ROWS=600;
const MAX_EVALUATIONS=20;
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
function serviceKey():string{
  const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(k)return k;
  try {return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}
  catch{return "";}
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const u=new URL(req.url),league=u.searchParams.get("league")||"";
  if(!LEAGUES.has(league)||[...u.searchParams.keys()].some(k=>k!=="league"))
    return response({ok:false,error:"UNSUPPORTED_LEAGUE_OR_PARAMETERS"},400);
  const baseUrl=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();
  if(!baseUrl||!key)return response({ok:false,error:"SERVER_CONFIG_UNAVAILABLE"},503);
  const secret=req.headers.get("x-ft-cron-key")||"";
  if(!secret)return response({ok:false,error:"UNAUTHORIZED"},401);
  const db=createClient(baseUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const authenticated=await db.rpc("ft_internal_cron_key_matches",{p_key:secret});
  if(authenticated.error||authenticated.data!==true)
    return response({ok:false,error:"UNAUTHORIZED"},401);
  const rows=await db.from("football_data_matches")
    .select("match_key,source_kind,league_code,match_date,home_team,away_team,fthg,ftag,first_seen_at")
    .eq("league_code",league).eq("source_kind","RESULTS")
    .not("fthg","is",null).not("ftag","is",null)
    .order("match_date",{ascending:true}).limit(MAX_ROWS);
  if(rows.error)return response({ok:false,error:"HISTORY_READ_FAILED"},503);
  if(!Array.isArray(rows.data))return response({ok:false,error:"HISTORY_FORMAT_ERROR"},503);
  if(rows.data.length>=MAX_ROWS)return response({ok:false,error:"HISTORY_BOUND_REACHED"},409);
  let rejected=0;
  const seen=new Set<string>();
  const history=[];
  for(const row of rows.data){
    const key=String(row.match_key||"");
    const playedAt=String(row.match_date||"");
    const capturedAt=String(row.first_seen_at||"");
    if(!key||seen.has(key)||!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)||
      !Number.isFinite(Date.parse(capturedAt))||
      typeof row.home_team!=="string"||typeof row.away_team!=="string"||
      !row.home_team.trim()||!row.away_team.trim()||row.home_team===row.away_team||
      ![row.fthg,row.ftag].every((x:unknown)=>Number.isInteger(x)&&x>=0&&x<=20)){
      rejected++;continue;
    }
    seen.add(key);
    history.push({source:"FOOTBALL_DATA",league,homeId:row.home_team,
      awayId:row.away_team,hg:row.fthg,ag:row.ftag,
      playedAt:playedAt+"T00:00:00Z",capturedAt});
  }
  const result=evaluateFootballDataWalkForward({
    history,league,holdoutFraction:0.2,maxFixtures:MAX_EVALUATIONS
  });
  return response({ok:true,dataSource:"SUPABASE_FOOTBALL_DATA_MATCHES",
    databaseRowCount:rows.data.length,validHistoryRows:history.length,
    excludedMalformedOrDuplicate:rejected,
    evaluation:result,
    warning:"RETROSPECTIVE_ONLY — previous-season results were imported after their kickoffs. Not an issued forecast or verified accuracy."});
});
