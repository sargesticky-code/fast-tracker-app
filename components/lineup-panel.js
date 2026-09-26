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

export default function LineupPanel() {
  const [payload, setPayload] = useState(null);
  const [id, setId] = useState(null);

  useEffect(() => {
    const matchId = new URLSearchParams(window.location.search).get("id");
    setId(matchId);
    if (!matchId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${DETAIL_FEED_URL}?id=${encodeURIComponent(matchId)}&_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setPayload(json);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const view = useMemo(() => {
    const hf = payload?.humanFactors || payload?.data?.humanFactors || payload?.match?.humanFactors || {};
    const rows = Array.isArray(hf?.lineup) ? hf.lineup : Array.isArray(payload?.lineup) ? payload.lineup : [];
    const home = rows.filter((r) => side(r) === "H");
    const away = rows.filter((r) => side(r) === "A");
    const confirmedRows = rows.filter((r) => r?.confirmed === true);
    const match = payload?.match || payload?.data?.match || {};
    return {
      home,
      away,
      confirmed: rows.length >= 20 && confirmedRows.length >= Math.min(20, rows.length),
      homeFormation: formation(home),
      awayFormation: formation(away),
      homeTeam: match.homeZh || match.home_zh || match.home || hf?.homeTeam || "主隊",
      awayTeam: match.awayZh || match.away_zh || match.away || hf?.awayTeam || "客隊",
    };
  }, [payload]);

  if (!id || (!view.home.length && !view.away.length)) return null;

  return (
    <div style={{maxWidth: 1180, margin: "0 auto", padding: "0 16px"}}>
      <FormationPitch
        home={view.home}
        away={view.away}
        homeTeam={view.homeTeam}
        awayTeam={view.awayTeam}
        homeFormation={view.homeFormation}
        awayFormation={view.awayFormation}
        confirmed={view.confirmed}
      />
    </div>
  );
}
