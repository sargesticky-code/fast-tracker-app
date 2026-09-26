"use client";

import { useEffect, useMemo, useState } from "react";
import FormationPitch from "@/components/formation-pitch";

const DETAIL_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-detail";

function side(row) {
  const value = String(row?.team_side || row?.side || "").toUpperCase();
  if (["H", "HOME", "1"].includes(value)) return "H";
  if (["A", "AWAY", "2"].includes(value)) return "A";
  return value;
}

function formation(rows) {
  return rows.find((r) => r?.formation)?.formation || rows.find((r) => r?.formation_name)?.formation_name || null;
}

function findLineup(payload) {
  const candidates = [
    payload?.humanFactors?.lineup,
    payload?.human_factors?.lineup,
    payload?.data?.humanFactors?.lineup,
    payload?.data?.human_factors?.lineup,
    payload?.match?.humanFactors?.lineup,
    payload?.match?.human_factors?.lineup,
    payload?.lineup,
    payload?.lineups,
    payload?.phase2?.lineup,
    payload?.phase2?.lineups,
  ];
  return candidates.find(Array.isArray) || [];
}

export default function LineupPanel() {
  const [payload, setPayload] = useState(null);
  const [id, setId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const matchId = new URLSearchParams(window.location.search).get("id");
    setId(matchId);
    if (!matchId) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${DETAIL_FEED_URL}?id=${encodeURIComponent(matchId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) { setPayload(json); setError(""); }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Lineup feed unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const view = useMemo(() => {
    const hf = payload?.humanFactors || payload?.human_factors || payload?.data?.humanFactors || payload?.data?.human_factors || payload?.match?.humanFactors || payload?.match?.human_factors || {};
    const rows = findLineup(payload);
    const home = rows.filter((r) => side(r) === "H");
    const away = rows.filter((r) => side(r) === "A");
    const confirmedRows = rows.filter((r) => r?.confirmed === true);
    const match = payload?.match || payload?.data?.match || {};
    return {
      rows,
      home,
      away,
      confirmed: rows.length >= 20 && confirmedRows.length >= Math.min(20, rows.length),
      homeFormation: formation(home),
      awayFormation: formation(away),
      homeTeam: match.homeZh || match.home_zh || match.home || hf?.homeTeam || hf?.home_team || "主隊",
      awayTeam: match.awayZh || match.away_zh || match.away || hf?.awayTeam || hf?.away_team || "客隊",
    };
  }, [payload]);

  if (!id) return null;

  return (
    <section style={{maxWidth:1180,margin:"14px auto 0",padding:"0 16px"}} aria-label="Lineup">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:8}}>
        <div>
          <div style={{fontSize:18,fontWeight:900}}>⚽ LINEUP · 陣容</div>
          <div style={{fontSize:12,color:"#68736c",marginTop:2}}>預計陣容會清楚標示；官方正選公布後自動切換 CONFIRMED</div>
        </div>
        {view.rows.length > 0 && <div style={{fontSize:12,fontWeight:800,padding:"5px 8px",borderRadius:999,background:view.confirmed?"#e4f5e9":"#fff4d8",color:view.confirmed?"#166534":"#8a5a00"}}>{view.confirmed?"CONFIRMED":"預計陣容"}</div>}
      </div>

      {view.home.length || view.away.length ? (
        <FormationPitch home={view.home} away={view.away} homeTeam={view.homeTeam} awayTeam={view.awayTeam} homeFormation={view.homeFormation} awayFormation={view.awayFormation} confirmed={view.confirmed} />
      ) : (
        <div style={{border:"1px solid #d9e3dc",borderRadius:16,background:"#fff",padding:"18px 16px",minHeight:92,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
          <div>
            <div style={{fontWeight:850,color:"#243029"}}>{loading ? "正在讀取陣容…" : error ? "陣容資料暫時未能讀取" : "等待可靠預計陣容 / 官方正選"}</div>
            <div style={{fontSize:12,color:"#6c766f",marginTop:5}}>{error ? `Feed: ${error}` : "有可信 11v11 資料後，呢度會自動畫出足球場陣型；NO DATA 不會當作沒有傷停。"}</div>
          </div>
          <div style={{fontSize:12,fontWeight:800,color:"#66736b"}}>Match {id}</div>
        </div>
      )}
    </section>
  );
}
