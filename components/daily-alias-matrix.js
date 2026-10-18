"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";

const URL="https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/daily-alias-matrix";
const providers=[
 ["FOREBET","Forebet"],["PRIMATIPS","PrimaTips"],["STATAREA","Statarea"],
 ["BETCLAN","BetClan"],["SPORTYTRADER","SportyTrader"]
];
const todayHkt=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const pad=(v)=>String(v).padStart(2,"0");
const dateText=(raw)=>{const date=new Date(raw);
 if(!Number.isFinite(date.getTime()))return "—";
 const t=new Date(date.getTime()+8*3600000);
 return pad(t.getUTCHours())+":"+pad(t.getUTCMinutes());
};
const norm=(text)=>String(text||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
export function looksDifferent(source,canonical){
 const a=norm(source),b=norm(canonical);
 return Boolean(a&&b&&a!==b);
}
export default function DailyAliasMatrix(){
 const [date,setDate]=useState(todayHkt);
 const [data,setData]=useState(null);
 const [error,setError]=useState("");
 const [search,setSearch]=useState("");
 const [filter,setFilter]=useState("all");
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
   // Preserve a dated daily report link when it is opened on a later HKT day.
   const query=new URLSearchParams(window.location.search);
   const requested=query.get("date");
   if(requested&&/^\\d{4}-\\d{2}-\\d{2}$/.test(requested)){
     const value=Date.parse(requested+"T00:00:00Z");
     const today=Date.parse(todayHkt()+"T00:00:00Z");
     if(Number.isFinite(value)&&Math.abs(value-today)<=7*86400000){
       setDate(requested);
     }
   }
 },[]);
 useEffect(()=>{
  let disposed=false;const controller=new AbortController();
  setLoading(true);setError("");setData(null);
  fetch(URL+"?"+new URLSearchParams({date}),{
    signal:controller.signal,cache:"no-store"
  }).then(async r=>{if(!r.ok)throw Error("Daily source unavailable");
    const x=await r.json();
    if(x?.source!=="FAST_TRACKER_DAILY_ALIAS_MATRIX_V1"||x?.hktDate!==date
       ||!Array.isArray(x.rows)||x.rows.length>800)throw Error("Invalid daily source");
    return x;
  }).then(x=>{if(!disposed)setData(x);})
  .catch(e=>{if(!disposed)setError(e.message||"Daily source unavailable");})
  .finally(()=>{if(!disposed)setLoading(false);});
  return ()=>{disposed=true;controller.abort();};
 },[date]);
 const rows=useMemo(()=>{
   const list=Array.isArray(data?.rows)?data.rows:[];
   return list.filter(row=>{
     const providersList=providers.flatMap(([id])=>row?.advisers?.[id]||[]);
     const hasAny=providersList.length>0;
     const hasVariant=providersList.some(p=>
       looksDifferent(p.home,row.home)||looksDifferent(p.away,row.away));
     if(filter==="linked"&&!hasAny)return false;
     if(filter==="variants"&&!hasVariant)return false;
     const q=search.trim().toLowerCase();
     if(!q)return true;
     return [row.id,row.league,row.home,row.away,...providersList.flatMap(p=>[p.home,p.away])]
       .some(x=>String(x||"").toLowerCase().includes(q));
   });
 },[data,filter,search]);
 const copyRows=()=>{
  const flat=[["HKT Date","Time","League","Flashscore Home","Flashscore Away","Fixture ID",
    ...providers.map(x=>x[1]+" Home / Away / Source State")].join("\t")];
  for(const r of rows){
   flat.push([date,dateText(r.kickoff),r.league,r.home,r.away,r.id,...providers.map(([id])=>
     (r.advisers?.[id]||[]).map(p=>[p.home,p.away,p.state].join(" / ")).join(" | ")||"—"
   )].map(v=>String(v??"").replaceAll("\t"," ").replaceAll("\n"," ")).join("\t"));
  }
  navigator.clipboard?.writeText(flat.join("\n")).catch(()=>{});
 };
 const matchedCount=Array.isArray(data?.rows)?data.rows.filter(r=>
  providers.some(([id])=>(r.advisers?.[id]||[]).length>0)).length:0;
 const today=todayHkt(),offset=n=>new Date(Date.parse(today+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
 return <main className="ft-home ft-alias-page" data-testid="daily-alias-matrix">
   <header className="ft-alias-header">
     <Link href="/">← Dashboard</Link>
     <h1>Daily match alias table</h1>
     <p>One row per Flashscore fixture · all recorded adviser names in one place · Hong Kong date</p>
     <p>No per-match verification required. If any pair is incorrect, send its fixture link and the correct team names in the project chat.</p>
     <div className="ft-alias-toolbar">
       <label>Date (HKT) <input type="date" value={date} min={offset(-7)} max={offset(7)}
           onChange={e=>setDate(e.target.value)}/></label>
       <label>Search <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
         placeholder="Team, league, fixture ID"/></label>
       <label>Show <select value={filter} onChange={e=>setFilter(e.target.value)}>
         <option value="all">All matches</option>
         <option value="linked">At least one adviser</option>
         <option value="variants">Different source spelling</option>
       </select></label>
       <button type="button" onClick={copyRows} disabled={!rows.length}>Copy visible table</button>
     </div>
     {data&&<p className="ft-alias-summary">HKT {date} · {data.rows.length} Flashscore fixtures · {matchedCount} with an adviser pairing · {rows.length} displayed</p>}
     <small>Names with different spelling are not necessarily mismatches. The table accepts displayed pairings by default; source verification and prediction accuracy remain separate.</small>
   </header>
   {loading&&<p role="status">Loading today's recorded aliases…</p>}
   {error&&<p role="alert">Unable to read today's aliases: {error}</p>}
   {!loading&&!error&&data&&<div className="ft-alias-table-wrap">
     <table className="ft-alias-table">
       <thead><tr><th>HKT</th><th>League</th><th>Flashscore</th>
         {providers.map(([id,name])=><th key={id}>{name}</th>)}
       </tr></thead>
       <tbody>{rows.map(row=><tr key={row.id}>
         <td><time dateTime={row.kickoff}>{dateText(row.kickoff)}</time></td>
         <td>{row.league||"—"}</td>
         <td><Link href={"/details?id="+encodeURIComponent(row.id)}>
           <strong>{row.home||"Unknown"}</strong><span className="ft-alias-divider"> vs </span>
           <strong>{row.away||"Unknown"}</strong></Link>
           <small>{row.id}</small></td>
         {providers.map(([id])=>{
           const matches=Array.isArray(row.advisers?.[id])?row.advisers[id]:[];
           return <td key={id} className="ft-alias-source-cell">{matches.length===0?<span className="ft-alias-missing">—</span>
             :matches.map((p,index)=><div key={p.url+index} className="ft-alias-source">
                 {p.url?.startsWith("https://")?<a target="_blank" rel="noopener noreferrer" href={p.url}>
                   <span>{p.home||"Unknown"} / {p.away||"Unknown"}</span></a>
                   :<span>{p.home||"Unknown"} / {p.away||"Unknown"}</span>}
                 <small>{p.state==="SOURCE_LINKED"?"Source-linked":"Provisional"}</small>
               </div>)}</td>;
         })}</tr>)}</tbody>
     </table>
     {rows.length===0&&<p>No matching records for the chosen filters.</p>}
   </div>}
   <footer><small>Source: stored matches and adviser observations only. No new scraper, duplicate daily database copies, or automatic alias confidence promotion.</small></footer>
 </main>;
}
