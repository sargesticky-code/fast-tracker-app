// Bet365 browser-feed adapter for joe-bring/bet365-scraper.
// Consumes the scraper as an external service; no upstream source is vendored here.
// Unknown or encoded values stay null. Canonical IDs are never allocated here.

const clean = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
const norm = (v) => String(v ?? "").normalize("NFKC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function splitEventName(value) {
  const s = clean(value);
  if (!s) return { home: null, away: null };
  for (const sep of [" v ", " vs ", " - "]) {
    const parts = s.split(sep);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) return { home: parts[0].trim(), away: parts[1].trim() };
  }
  return { home: null, away: null };
}
function parseScore(value) {
  const m = /^(\d+)\s*[-:]\s*(\d+)$/.exec(clean(value) ?? "");
  return m ? { homeScore:Number(m[1]), awayScore:Number(m[2]) } : { homeScore:null, awayScore:null };
}
function parseClock(value) {
  const m = /^(\d{1,3}):(\d{2})$/.exec(clean(value) ?? "");
  if (!m) return { minute:null, second:null };
  const minute=Number(m[1]), second=Number(m[2]);
  return minute >= 0 && minute <= 180 && second >= 0 && second <= 59 ? { minute,second } : { minute:null,second:null };
}

export function bet365DecimalOdds(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 1) return value;
  const s=clean(value); if(!s) return null;
  const f=/^(\d+)\/(\d+)$/.exec(s);
  if(f){ const n=Number(f[1]),d=Number(f[2]); if(d<=0)return null; const out=1+n/d; return out>1?Number(out.toFixed(6)):null; }
  if(/^\d+\.\d+$/.test(s)){ const n=Number(s); return Number.isFinite(n)&&n>1?n:null; }
  return null;
}
function marketKind(market){
  const n=norm(market?.name); if(!n)return "UNKNOWN";
  if(/full ?time result|match result|1x2|money line 3 way|3 way money line/.test(n)) return "HDA";
  if(/corner/.test(n)&&/total|over|under|line/.test(n)) return "CORNERS";
  if(/asian handicap|handicap/.test(n)) return "ASIAN_HANDICAP";
  if(/total goals|goal line|goals.*over.*under|over.*under.*goals/.test(n)) return "GOALS";
  return "UNKNOWN";
}
function numericLine(value){
  const m=/[+-]?\d+(?:\.\d+)?/.exec(clean(value)??""); if(!m)return null;
  const n=Number(m[0]); return Number.isFinite(n)?n:null;
}
function selectionFor(kind,odd,fixture){
  const n=norm(odd?.na);
  if(kind==="HDA"){
    if(n==="draw")return "D";
    if(n&&n===norm(fixture.home))return "H";
    if(n&&n===norm(fixture.away))return "A";
    const order=Number(odd?.or); return order===0?"H":order===1?"D":order===2?"A":null;
  }
  if(kind==="GOALS"||kind==="CORNERS"){ if(/^over\b/.test(n))return "OVER"; if(/^under\b/.test(n))return "UNDER"; return null; }
  if(kind==="ASIAN_HANDICAP"){ if(n&&n===norm(fixture.home))return "HOME"; if(n&&n===norm(fixture.away))return "AWAY"; const order=Number(odd?.or); return order===0?"HOME":order===1?"AWAY":null; }
  return null;
}

export function normalizeBet365Markets(row,fixture,fetchedAt){
  const quotes=[],rejected=[];
  for(const market of Array.isArray(row?.markets)?row.markets:[]){
    const kind=marketKind(market);
    for(const odd of Array.isArray(market?.odds)?market.odds:[]){
      const rawOd=clean(odd?.od), suspended=String(odd?.su??market?.su??"0")==="1";
      const decimalPrice=suspended?null:bet365DecimalOdds(rawOd);
      const selection=selectionFor(kind,odd,fixture);
      let line=numericLine(odd?.ha);
      if(kind==="ASIAN_HANDICAP"&&selection==="AWAY"&&line!==null)line=-line;
      const quote={providerKey:"BET365_BROWSER",bookmakerKey:"bet365",providerEventId:fixture.providerEventId,fixtureId:fixture.fixtureId,
        marketKey:kind,marketId:clean(market?.id)??clean(market?.ma),marketName:clean(market?.name),selectionKey:selection,
        selectionName:clean(odd?.na),line,rawOd,decimalPrice,suspended,fetchedAt,raw:{market,odd}};
      quote.quoteKey=[quote.providerEventId,quote.marketId??quote.marketName??"UNKNOWN",quote.selectionKey??quote.selectionName??clean(odd?.id)??"UNKNOWN",quote.line??""].join("|");
      quotes.push(quote);
      if(!selection||kind==="UNKNOWN") rejected.push({providerEventId:fixture.providerEventId,reason:"UNREVIEWED_MARKET_OR_SELECTION",quoteKey:quote.quoteKey});
      else if(!suspended&&decimalPrice===null) rejected.push({providerEventId:fixture.providerEventId,reason:"UNDECODABLE_ODDS",quoteKey:quote.quoteKey,rawOd});
    }
  }
  return {quotes,rejected};
}

export function bet365BrowserLive(payload,fetchedAt){
  if(!Array.isArray(payload))throw new Error("BET365_BROWSER_INVALID_RESPONSE");
  const fetched=new Date(fetchedAt); if(!Number.isFinite(fetched.getTime()))throw new Error("BET365_BROWSER_INVALID_FETCH_TIME");
  const fixtures=[],quotes=[],rejected=[];
  for(const row of payload){
    if(String(row?.sportId??"1")!=="1")continue;
    const providerEventId=clean(row?.id),fixtureId=clean(row?.fixtureId),competition=clean(row?.league),period=clean(row?.period);
    const competitionNorm=norm(competition);
    const eventNorm=norm(row?.event);
    const isVirtual=/\besoccer\b|\be soccer\b|\bvirtual\b|\bsimulated\b/.test(competitionNorm)||/\([^)]{1,32}\)\s+v\s+[^()]+\([^)]{1,32}\)/.test(String(row?.event??""));
    if(isVirtual){rejected.push({providerEventId,reason:"VIRTUAL_OR_ESOCCER_EXCLUDED",competition,event:clean(row?.event)});continue;}
    const {home,away}=splitEventName(row?.event),{homeScore,awayScore}=parseScore(row?.score),{minute,second}=parseClock(row?.time);
    if(!providerEventId||!competition||!home||!away){rejected.push({providerEventId,reason:"INCOMPLETE_LIVE_IDENTITY"});continue;}
    const fixture={providerKey:"BET365_BROWSER",bookmakerKey:"bet365",providerEventId,fixtureId,competition,home,away,period,minute,second,
      homeScore,awayScore,stats:row?.stats&&typeof row.stats==="object"?row.stats:{},markets:Array.isArray(row?.markets)?row.markets:[],
      fetchedAt:fetched.toISOString(),canonicalMatchId:null,identityStatus:"UNRESOLVED",raw:row};
    fixtures.push(fixture);
    const normalized=normalizeBet365Markets(row,fixture,fixture.fetchedAt); quotes.push(...normalized.quotes); rejected.push(...normalized.rejected);
  }
  return {fixtures,quotes,rejected};
}

export function resolveBet365Fixture(fixture,canonicalRows,nowIso,toleranceBeforeMinutes=300,toleranceAfterMinutes=90){
  const now=Date.parse(nowIso); if(!Number.isFinite(now))throw new Error("BET365_BROWSER_INVALID_MATCH_TIME");
  const candidates=(canonicalRows??[]).filter(m=>{
    const kickoff=Date.parse(m?.kickoff_hkt??m?.kickoff??""); if(!Number.isFinite(kickoff))return false;
    if(kickoff<now-toleranceBeforeMinutes*60000||kickoff>now+toleranceAfterMinutes*60000)return false;
    return norm(m?.home_en??m?.home)===norm(fixture.home)&&norm(m?.away_en??m?.away)===norm(fixture.away);
  });
  const ids=[...new Set(candidates.map(m=>String(m?.hkjc_event_id??m?.id??"").trim()).filter(Boolean))];
  return ids.length===1?{canonicalMatchId:ids[0],status:"VERIFIED"}:{canonicalMatchId:null,status:ids.length>1?"AMBIGUOUS":"UNRESOLVED"};
}

export function completeHdaBoard(quotes){
  const live=(quotes??[]).filter(q=>q.marketKey==="HDA"&&!q.suspended&&q.decimalPrice>1),by=new Map();
  for(const q of live){if(!["H","D","A"].includes(q.selectionKey))continue;if(by.has(q.selectionKey)&&by.get(q.selectionKey).decimalPrice!==q.decimalPrice)return null;by.set(q.selectionKey,q);}
  return by.size===3?{H:by.get("H"),D:by.get("D"),A:by.get("A")}:null;
}
