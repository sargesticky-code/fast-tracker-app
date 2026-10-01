"use client";

import { useEffect, useMemo, useState } from "react";
import { Pitch } from "@withqwerty/campos-stadia";

const DETAIL_FEED_URL = "https://hekqxhgjexzxnecwhyao.supabase.co/functions/v1/app-match-detail";

const palette = {
  home: "#195b42",
  away: "#7d3040",
  ink: "#18241d",
  muted: "#6f7e75",
  line: "#dbe5de",
  soft: "#f5f8f6",
  good: "#e7f5eb",
  warn: "#fff4d8",
};

function side(row) {
  const value = String(row?.team_side || row?.side || "").toUpperCase();
  if (["H", "HOME", "1"].includes(value)) return "H";
  if (["A", "AWAY", "2"].includes(value)) return "A";
  return value;
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

function getHumanFactors(payload) {
  return payload?.humanFactors
    || payload?.human_factors
    || payload?.data?.humanFactors
    || payload?.data?.human_factors
    || {};
}

function formation(rows) {
  return rows.find((r) => r?.raw?.formation)?.raw?.formation
    || rows.find((r) => r?.formation)?.formation
    || rows.find((r) => r?.formation_name)?.formation_name
    || null;
}

function normalizeFormation(value) {
  return String(value || "").replace(/^1-/, "") || null;
}

function playerSort(a, b) {
  const pa = Number(a?.raw?.flash_position ?? a?.raw?.position ?? 99);
  const pb = Number(b?.raw?.flash_position ?? b?.raw?.position ?? 99);
  if (pa !== pb) return pa - pb;
  const sa = String(a?.formation_slot || "");
  const sb = String(b?.formation_slot || "");
  if (sa !== sb) return sa.localeCompare(sb);
  return String(a?.player_name || "").localeCompare(String(b?.player_name || ""));
}

function avgConfidence(rows) {
  const values = rows.map((r) => Number(r?.confidence)).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function shortName(value, max = 12) {
  const text = String(value || "—");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function slotPoint(row) {
  const candidates = [
    row?.formation_slot, row?.grid, row?.slot,
    row?.raw?.formation_slot, row?.raw?.grid, row?.raw?.slot,
  ];
  for (const value of candidates) {
    const m = String(value || "").match(/(\d+)\s*[:.-]\s*(\d+)/);
    if (!m) continue;
    const line = Number(m[1]);
    const col = Number(m[2]);
    if (!Number.isInteger(line) || !Number.isInteger(col) || line < 1 || line > 5 || col < 1 || col > 5) continue;
    return { x: 8 + ((line - 1) / 4) * 84, y: 10 + ((col - 1) / 4) * 80 };
  }
  return null;
}

function playerFlags(row) {
  const role = String(row?.role || row?.raw?.flash_record?.LS || "");
  const flags = [];
  if (/goalkeeper/i.test(role)) flags.push("GK");
  if (/captain/i.test(role) || row?.raw?.flash_record?.LR === "(C)") flags.push("C");
  return flags;
}

function playerRole(row) {
  const raw = String(row?.role || row?.raw?.flash_record?.LS || "").trim();
  if (!raw) return null;
  if (/goalkeeper/i.test(raw) || raw === "GK") return "GK";
  if (/def/i.test(raw) || raw === "DEF") return "DEF";
  if (/mid/i.test(raw) || raw === "MID") return "MID";
  if (/att|forward|striker/i.test(raw) || raw === "ATT") return "ATT";
  if (/captain/i.test(raw)) return null;
  return raw.toUpperCase();
}

function playerCountry(row) {
  return row?.country
    || row?.country_name
    || row?.raw?.country
    || row?.raw?.country_name
    || row?.raw?.flash_record?.LQ
    || null;
}

function roleBadge(row) {
  const role = playerRole(row);
  if (role === "GK") return "🧤 GK";
  if (role) return role;
  return row?.starter === false ? "SUB" : "XI";
}

function sourceUpdated(rows) {
  const times = rows
    .map((r) => r?.source_updated_at || r?.fetched_at || r?.created_at)
    .filter(Boolean)
    .map((v) => new Date(v).getTime())
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function formatHkt(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusTone(status) {
  return status === "CONFIRMED"
    ? { bg: palette.good, fg: "#17643f", text: "CONFIRMED 11v11" }
    : status === "PREDICTED_FULL"
      ? { bg: palette.warn, fg: "#845b0a", text: "PREDICTED 11v11" }
      : status === "PARTIAL"
        ? { bg: "#fff1e5", fg: "#8a541c", text: "PARTIAL" }
        : { bg: "#eef1ef", fg: "#68736d", text: "WAITING" };
}

function statusLabel(row) {
  return String(
    row?.status_type
      || row?.status
      || row?.availability
      || row?.player_status
      || row?.classification
      || row?.reason
      || row?.raw?.unavailability?.type
      || "UNKNOWN"
  ).toUpperCase();
}

function statusDetail(row) {
  return row?.status_value
    || row?.expected_return
    || row?.raw?.unavailability?.expectedReturn
    || row?.raw?.unavailability?.reason
    || null;
}

function statusName(row) {
  return row?.player_name
    || row?.name
    || row?.player
    || row?.raw?.player_name
    || row?.player_key
    || "Unknown player";
}

function statusSide(row) {
  const s = String(row?.team_side || row?.side || "").toUpperCase();
  return s === "A" || s === "AWAY" ? "A" : s === "H" || s === "HOME" ? "H" : null;
}

function managerName(row) {
  return row?.manager_name
    || row?.evidence_value
    || row?.name
    || row?.manager
    || row?.coach_name
    || row?.coach
    || row?.raw?.manager_name
    || row?.raw?.name
    || null;
}

function managerSide(row) {
  const s = String(row?.team_side || row?.side || "").toUpperCase();
  return s === "A" || s === "AWAY" ? "A" : s === "H" || s === "HOME" ? "H" : null;
}

function Metric({ label, value, detail }) {
  return (
    <div style={{minWidth:0,padding:"10px 11px",border:"1px solid "+palette.line,borderRadius:12,background:"#fff"}}>
      <span style={{display:"block",fontSize:9,fontWeight:900,color:"#809087",letterSpacing:".04em"}}>{label}</span>
      <b style={{display:"block",marginTop:3,fontSize:16,color:palette.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</b>
      {detail ? <small style={{display:"block",marginTop:3,fontSize:9,color:palette.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{detail}</small> : null}
    </div>
  );
}

function PlayerMarker({ row, point, accent, predicted }) {
  const flags = playerFlags(row);
  const label = shortName(row?.player_name || row?.name, 11);
  const number = row?.shirt_number ?? row?.number ?? "•";
  return (
    <g transform={`translate(${point.x} ${point.y})`}>
      <circle r="4.25" fill="#ffffff" stroke={accent} strokeWidth="0.95" />
      <text x="0" y="1.35" textAnchor="middle" fontSize="3.25" fontWeight="950" fill={accent}>{number}</text>
      <rect x="-10" y="5.2" width="20" height="5.8" rx="2.2" fill="rgba(18,35,27,.88)" />
      <text x="0" y="9.15" textAnchor="middle" fontSize="2.7" fontWeight="850" fill="#fff">{label}</text>
      {flags.includes("C") ? (
        <>
          <circle cx="4.6" cy="-3.1" r="1.8" fill="#f2c94c" stroke="#fff" strokeWidth=".45" />
          <text x="4.6" y="-2.45" textAnchor="middle" fontSize="1.9" fontWeight="900" fill="#3d2e00">C</text>
        </>
      ) : null}
      {predicted ? <circle cx="-4.8" cy="-3.15" r="1.4" fill="#f2c94c" stroke="#fff" strokeWidth=".4" /> : null}
    </g>
  );
}

function TeamPitch({ teamName, rows, accent, status }) {
  const sorted = [...rows].filter((r) => r?.starter !== false).sort(playerSort);
  const formationValue = normalizeFormation(formation(sorted)) || "—";
  const predicted = status !== "CONFIRMED";
  return (
    <div style={{border:"1px solid "+palette.line,borderRadius:17,background:"#fff",overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"11px 13px",borderBottom:"1px solid "+palette.line}}>
        <div style={{minWidth:0}}>
          <b style={{display:"block",fontSize:15,color:palette.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{teamName}</b>
          <small style={{display:"block",marginTop:3,fontSize:10,color:palette.muted}}>Formation {formationValue}</small>
        </div>
        <span style={{fontSize:10,fontWeight:900,padding:"5px 7px",borderRadius:999,background:predicted?"#fff4d8":"#e7f5eb",color:predicted?"#845b0a":"#17643f"}}>
          {sorted.length}/11
        </span>
      </div>
      <div style={{padding:10,background:"#102f22"}}>
        <Pitch
          crop="full"
          attackingDirection="up"
          preset="green"
          grass={{ type: "stripes", opacity: 0.22 }}
          markings={{ thirds: true }}
          padding={2}
          interactive={false}
          role="img"
          ariaLabel={teamName + " lineup"}
        >
          {({ project }) => sorted.map((row, index) => {
            const rawPoint = slotPoint(row, index, sorted.length, formationValue);
            const point = project(rawPoint.x, rawPoint.y);
            return <PlayerMarker key={row?.id || row?.player_key || row?.player_name || index} row={row} point={point} accent={accent} predicted={predicted} />;
          })}
        </Pitch>
      </div>
      <div style={{padding:"7px 12px",display:"flex",gap:8,flexWrap:"wrap",borderTop:"1px solid #183b2d",background:"#102f22"}}>
        <small style={{fontSize:8.5,fontWeight:800,color:"#dce9e1"}}>🧤 GK</small>
        <small style={{fontSize:8.5,fontWeight:800,color:"#dce9e1"}}>C Captain</small>
        <small style={{fontSize:8.5,fontWeight:800,color:"#dce9e1"}}>{predicted ? "● yellow = predicted" : "✓ confirmed XI"}</small>
      </div>
      <div style={{padding:"10px 12px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:6}}>
          {sorted.map((row, index) => {
            const flags = playerFlags(row);
            const country = playerCountry(row);
            const role = playerRole(row);
            return (
              <div key={row?.id || row?.player_key || index} style={{display:"grid",gridTemplateColumns:"34px minmax(0,1fr) auto",gap:8,alignItems:"center",padding:"8px 9px",border:"1px solid #e3ebe6",borderRadius:11,background:"#fafcfb"}}>
                <span style={{display:"grid",placeItems:"center",width:32,height:32,borderRadius:10,background:accent,color:"#fff",fontSize:11,fontWeight:950,boxShadow:"inset 0 0 0 1px rgba(255,255,255,.22)"}}>{row?.shirt_number ?? "•"}</span>
                <div style={{minWidth:0}}>
                  <b style={{display:"block",fontSize:12,color:"#26362d",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{row?.player_name || "Unknown"}</b>
                  <small style={{display:"block",marginTop:2,fontSize:9,color:"#819087",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {[country, flags.includes("C") ? "Captain" : null].filter(Boolean).join(" · ") || "Starting XI"}
                  </small>
                </div>
                <span style={{fontSize:8.5,fontWeight:900,padding:"4px 6px",borderRadius:999,background:role==="GK"?"#eaf1ff":"#eef5f0",color:role==="GK"?"#315d9a":"#4f6b5d",whiteSpace:"nowrap"}}>
                  {roleBadge(row)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SquadList({ title, rows, accent, empty }) {
  return (
    <div style={{border:"1px solid "+palette.line,borderRadius:15,background:"#fff",padding:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:8}}>
        <b style={{fontSize:13,color:palette.ink}}>{title}</b>
        <span style={{fontSize:10,fontWeight:900,color:accent}}>{rows.length}</span>
      </div>
      {rows.length ? (
        <div style={{display:"grid",gap:6}}>
          {rows.map((row, i) => {
            const country = playerCountry(row);
            const captain = playerFlags(row).includes("C");
            return (
              <div key={row?.id || row?.player_key || i} style={{display:"grid",gridTemplateColumns:"36px minmax(0,1fr) auto",gap:8,alignItems:"center",padding:"8px 9px",border:"1px solid #e8eeea",borderRadius:11,background:"#f8faf8"}}>
                <span style={{display:"grid",placeItems:"center",width:32,height:32,borderRadius:10,background:accent,color:"#fff",fontSize:10,fontWeight:950}}>#{row?.shirt_number ?? "—"}</span>
                <div style={{minWidth:0}}>
                  <span style={{display:"block",fontSize:11.5,fontWeight:850,color:"#2f4036",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row?.player_name || "Unknown"}</span>
                  <small style={{display:"block",marginTop:2,fontSize:8.8,color:palette.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {[country, captain ? "Captain" : null].filter(Boolean).join(" · ") || (row?.starter === false ? "Substitute" : "Starting XI")}
                  </small>
                </div>
                <small style={{fontSize:8.5,fontWeight:900,color:"#52675b",padding:"4px 6px",borderRadius:999,background:"#eef4f0",whiteSpace:"nowrap"}}>{roleBadge(row)}</small>
              </div>
            );
          })}
        </div>
      ) : <div style={{padding:"12px 10px",borderRadius:10,background:"#f7f9f7",fontSize:10,color:"#7d8a83"}}>{empty}</div>}
    </div>
  );
}

function AvailabilityPanel({ rows, homeTeam, awayTeam }) {
  const meaningful = rows.filter(Boolean);
  if (!meaningful.length) {
    return (
      <div style={{padding:18,border:"1px dashed #cfdad3",borderRadius:14,background:"#fbfcfb"}}>
        <b style={{display:"block",fontSize:13,color:palette.ink}}>暫未捕捉到 verified 傷停 / 停賽 evidence</b>
        <small style={{display:"block",marginTop:5,fontSize:10,color:palette.muted}}>呢個意思係「資料未有」，唔代表兩隊一定冇傷停</small>
      </div>
    );
  }
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
      {["H","A"].map((s) => {
        const list = meaningful.filter((r) => statusSide(r) === s || statusSide(r) == null);
        return (
          <div key={s} style={{border:"1px solid "+palette.line,borderRadius:14,background:"#fff",padding:12}}>
            <b style={{fontSize:13,color:palette.ink}}>{s === "H" ? homeTeam : awayTeam}</b>
            <div style={{display:"grid",gap:6,marginTop:9}}>
              {list.length ? list.map((row, i) => (
                <div key={row?.id || i} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"8px 9px",borderRadius:10,background:"#fff7f4"}}>
                  <div style={{minWidth:0}}>
                    <span style={{display:"block",fontSize:10,fontWeight:800,color:"#3a443f",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{statusName(row)}</span>
                    {statusDetail(row) ? <small style={{display:"block",marginTop:2,fontSize:8.5,color:"#8b746d"}}>{statusDetail(row)}</small> : null}
                  </div>
                  <b style={{fontSize:9,color:"#a34d3e",whiteSpace:"nowrap"}}>{statusLabel(row)}</b>
                </div>
              )) : <small style={{fontSize:10,color:palette.muted}}>No team-specific status rows</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ManagersPanel({ managers, homeTeam, awayTeam }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
      {["H","A"].map((s) => {
        const manager = managers.find((m) => managerSide(m) === s) || null;
        return (
          <div key={s} style={{border:"1px solid "+palette.line,borderRadius:14,background:"#fff",padding:12}}>
            <span style={{display:"block",fontSize:9,fontWeight:900,color:"#819087"}}>{s === "H" ? homeTeam : awayTeam}</span>
            <b style={{display:"block",marginTop:4,fontSize:14,color:palette.ink}}>{managerName(manager) || "Manager data pending"}</b>
            <small style={{display:"block",marginTop:5,fontSize:9.5,color:palette.muted}}>
              {manager ? (manager?.source_name || manager?.source || "verified manager evidence") : "會由 Phase 2 manager lane 自動補上"}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function StrengthBar({ team, data }) {
  const pct = Number.isFinite(Number(data?.lineup_strength_pct)) ? Number(data.lineup_strength_pct) : null;
  const conf = Number.isFinite(Number(data?.lineup_confidence_pct)) ? Number(data.lineup_confidence_pct) : null;
  const label = data?.lineup_strength_label || "資料不足";
  return (
    <div style={{padding:"10px 12px",border:"1px solid #dce6df",borderRadius:13,background:"#fff"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"baseline"}}>
        <b style={{fontSize:12,color:palette.ink}}>{team}</b>
        <b style={{fontSize:18,color:palette.ink}}>{pct == null ? "—" : Math.round(pct) + "%"}</b>
      </div>
      <div style={{height:7,borderRadius:999,background:"#e8eeea",overflow:"hidden",marginTop:7}}>
        {pct != null ? <div style={{height:"100%",width:Math.max(0,Math.min(100,pct))+"%",background:"linear-gradient(90deg,#77a98b,#2a7753)",borderRadius:999}} /> : null}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:6,fontSize:9,color:palette.muted,fontWeight:800}}>
        <span>{label}</span>
        <span>{conf == null ? "可信度 —" : "可信度 " + Math.round(conf) + "%"}</span>
      </div>
    </div>
  );
}

export default function LineupPanel() {
  const [payload, setPayload] = useState(null);
  const [id, setId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("formation");

  useEffect(() => {
    const matchId = new URLSearchParams(window.location.search).get("id");
    setId(matchId);
    if (!matchId) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${DETAIL_FEED_URL}?id=${encodeURIComponent(matchId)}&_=${Date.now()}`, { cache: "no-store" });
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
    const hf = getHumanFactors(payload);
    const rows = findLineup(payload);
    const fixture = payload?.match || payload?.fixture || payload?.data?.match || payload?.data?.fixture || {};
    const meta = hf?.lineupMeta || hf?.lineup_meta || payload?.lineupMeta || payload?.lineup_meta || {};
    const home = rows.filter((r) => side(r) === "H");
    const away = rows.filter((r) => side(r) === "A");
    const confirmedRows = rows.filter((r) => r?.confirmed === true);
    const homeTeam = fixture.homeZh || fixture.home_zh || fixture.home || fixture.home_en || "主隊";
    const awayTeam = fixture.awayZh || fixture.away_zh || fixture.away || fixture.away_en || "客隊";
    const homeStarters = home.filter((r) => r?.starter !== false);
    const awayStarters = away.filter((r) => r?.starter !== false);
    const homeBench = home.filter((r) => r?.starter === false);
    const awayBench = away.filter((r) => r?.starter === false);
    const status = meta?.status
      || (homeStarters.length >= 11 && awayStarters.length >= 11
        ? (confirmedRows.length >= 22 ? "CONFIRMED" : "PREDICTED_FULL")
        : rows.length ? "PARTIAL" : "MISSING");
    const confidence = avgConfidence(rows);
    const source = meta?.source || rows[0]?.source_name || null;
    const sourceUrl = rows.find((r) => r?.source_url)?.source_url || null;
    const evidenceSources = meta?.evidenceSources || [...new Set(rows.map((r) => r?.source_name).filter(Boolean))];
    const playerStatus = Array.isArray(hf?.playerStatus) ? hf.playerStatus : Array.isArray(hf?.player_status) ? hf.player_status : [];
    const managers = Array.isArray(hf?.managers) ? hf.managers : [];
    const strengthRows = Array.isArray(hf?.lineupStrength) ? hf.lineupStrength
      : Array.isArray(hf?.lineup_strength) ? hf.lineup_strength : [];
    const homeStrength = strengthRows.find((r) => String(r?.team_side || "").toUpperCase() === "HOME") || null;
    const awayStrength = strengthRows.find((r) => String(r?.team_side || "").toUpperCase() === "AWAY") || null;

    const statusNames = new Set(playerStatus
      .filter((r) => ["OUT", "SUSPENDED", "SUSPENSION", "UNAVAILABLE"].includes(statusLabel(r)))
      .map((r) => String(statusName(r)).toLowerCase()));
    const conflicts = rows.filter((r) => statusNames.has(String(r?.player_name || "").toLowerCase()));

    return {
      rows, home, away, homeStarters, awayStarters, homeBench, awayBench,
      homeTeam, awayTeam, status, confidence, source, sourceUrl, evidenceSources,
      playerStatus, managers, conflicts, homeStrength, awayStrength,
      homeFormation: normalizeFormation(formation(homeStarters)),
      awayFormation: normalizeFormation(formation(awayStarters)),
      kickoff: fixture.kickoff || fixture.kickoff_hkt || null,
      tournament: fixture.league || fixture.tournament || null,
      updatedAt: sourceUpdated(rows),
    };
  }, [payload]);

  if (!id) return null;

  const tone = statusTone(view.status);
  const ready = view.homeStarters.length >= 11 && view.awayStarters.length >= 11;
  const tabs = [
    ["formation","陣型"],
    ["squad","名單"],
    ["availability","傷停"],
    ["source","來源"],
  ];

  return (
    <section style={{maxWidth:1180,margin:"14px auto 0",padding:"0 16px"}} aria-label="Professional lineup module">
      <div style={{border:"1px solid #d5e1d9",borderRadius:20,background:"#f7faf8",boxShadow:"0 12px 34px rgba(35,74,53,.07)",overflow:"hidden"}}>
        <div style={{padding:"15px 16px",background:"#fff",borderBottom:"1px solid "+palette.line}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
            <div>
              <span style={{display:"block",fontSize:9,fontWeight:950,color:"#2a7652",letterSpacing:".08em"}}>MATCH LINEUPS · CAMPOS UI</span>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:4}}>
                <h2 style={{margin:0,fontSize:20,color:palette.ink}}>{view.homeTeam} <span style={{color:"#9aa69f",fontWeight:700}}>vs</span> {view.awayTeam}</h2>
                <span style={{fontSize:10,fontWeight:950,padding:"5px 8px",borderRadius:999,background:tone.bg,color:tone.fg}}>{tone.text}</span>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6,fontSize:10,color:palette.muted,fontWeight:750}}>
                {view.tournament ? <span>{view.tournament}</span> : null}
                {view.kickoff ? <span>香港時間 {formatHkt(view.kickoff)}</span> : null}
                {view.source ? <span>{view.source}</span> : null}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(82px,1fr))",gap:7,minWidth:280}}>
              <Metric label="HOME XI" value={view.homeStarters.length + "/11"} detail={view.homeFormation || "formation pending"} />
              <Metric label="AWAY XI" value={view.awayStarters.length + "/11"} detail={view.awayFormation || "formation pending"} />
              <Metric label="CONFIDENCE" value={view.confidence == null ? "—" : Math.round(view.confidence * 100) + "%"} detail={view.status === "CONFIRMED" ? "official evidence" : "prediction evidence"} />
            </div>
          </div>

          <div className="lineup-strength-grid" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginTop:13}}>
            <StrengthBar team={view.homeTeam} data={view.homeStrength} />
            <StrengthBar team={view.awayTeam} data={view.awayStrength} />
          </div>

          <div style={{display:"flex",gap:6,overflowX:"auto",marginTop:13,paddingBottom:1}}>
            {tabs.map(([key,label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} style={{border:"1px solid "+(tab===key?"#2a7753":"#d9e3dc"),background:tab===key?"#2a7753":"#fff",color:tab===key?"#fff":"#63736a",borderRadius:999,padding:"7px 11px",fontSize:10,fontWeight:900,whiteSpace:"nowrap",cursor:"pointer"}}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && !payload ? <div style={{padding:24,fontSize:12,color:palette.muted}}>正在讀取陣容…</div> : null}
        {error && !payload ? <div style={{padding:24,fontSize:12,color:"#a04f43"}}>Lineup feed: {error}</div> : null}

        {!loading && !ready && view.rows.length === 0 ? (
          <div style={{padding:22}}>
            <div style={{padding:18,border:"1px dashed #cdd9d1",borderRadius:14,background:"#fff"}}>
              <b style={{display:"block",fontSize:14,color:palette.ink}}>等待可靠 11v11 陣容</b>
              <small style={{display:"block",marginTop:6,fontSize:10,color:palette.muted}}>有 predicted 或 official XI 後，呢個完整模組會自動切換；唔會用假球員補空位</small>
            </div>
          </div>
        ) : null}

        {view.rows.length > 0 && tab === "formation" ? (
          <div style={{padding:14}}>
            {view.conflicts.length ? (
              <div style={{marginBottom:10,padding:"9px 10px",border:"1px solid #efc8bf",borderRadius:11,background:"#fff4f1",fontSize:10,fontWeight:850,color:"#9a4d40"}}>
                ⚠ {view.conflicts.length} 個 XI 球員同傷停 evidence 有衝突，需要人工/下一輪 source refresh 核對
              </div>
            ) : null}
            <div className="pro-lineup-grid" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
              <TeamPitch teamName={view.homeTeam} rows={view.homeStarters} accent={palette.home} status={view.status} />
              <TeamPitch teamName={view.awayTeam} rows={view.awayStarters} accent={palette.away} status={view.status} />
            </div>
          </div>
        ) : null}

        {view.rows.length > 0 && tab === "squad" ? (
          <div style={{padding:14,display:"grid",gap:12}}>
            <div className="pro-lineup-grid" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
              <SquadList title={view.homeTeam + " · Starting XI"} rows={view.homeStarters.sort(playerSort)} accent={palette.home} empty="Starting XI pending" />
              <SquadList title={view.awayTeam + " · Starting XI"} rows={view.awayStarters.sort(playerSort)} accent={palette.away} empty="Starting XI pending" />
            </div>
            <div className="pro-lineup-grid" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
              <SquadList title={view.homeTeam + " · Bench"} rows={view.homeBench} accent={palette.home} empty="Bench/substitutes not captured from current source" />
              <SquadList title={view.awayTeam + " · Bench"} rows={view.awayBench} accent={palette.away} empty="Bench/substitutes not captured from current source" />
            </div>
          </div>
        ) : null}

        {view.rows.length > 0 && tab === "availability" ? (
          <div style={{padding:14,display:"grid",gap:12}}>
            <AvailabilityPanel rows={view.playerStatus} homeTeam={view.homeTeam} awayTeam={view.awayTeam} />
            <ManagersPanel managers={view.managers} homeTeam={view.homeTeam} awayTeam={view.awayTeam} />
          </div>
        ) : null}

        {view.rows.length > 0 && tab === "source" ? (
          <div style={{padding:14}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
              <Metric label="LINEUP STATUS" value={view.status} detail={view.status === "CONFIRMED" ? "official XI overrides predictions" : "will upgrade automatically when official XI arrives"} />
              <Metric label="PRIMARY SOURCE" value={view.source || "—"} detail={(view.evidenceSources || []).join(", ") || "no evidence source"} />
              <Metric label="AVG CONFIDENCE" value={view.confidence == null ? "—" : (view.confidence * 100).toFixed(0) + "%"} detail={view.rows.length + " player evidence rows"} />
              <Metric label="SOURCE UPDATED" value={formatHkt(view.updatedAt)} detail="Hong Kong time" />
            </div>
            <div style={{marginTop:10,padding:12,border:"1px solid "+palette.line,borderRadius:13,background:"#fff"}}>
              <b style={{display:"block",fontSize:12,color:palette.ink}}>Data provenance</b>
              <p style={{margin:"6px 0 0",fontSize:10,lineHeight:1.55,color:palette.muted}}>
                HKJC fixture identity is the master key. External lineup evidence is matched through the one-for-all alias layer, stored in Supabase, then canonicalized so confirmed XI outranks predicted XI.
              </p>
              {view.sourceUrl ? <a href={view.sourceUrl} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:8,fontSize:10,fontWeight:900,color:"#287650"}}>Open source evidence ↗</a> : null}
            </div>
          </div>
        ) : null}

        <div style={{padding:"10px 14px",borderTop:"1px solid "+palette.line,background:"#fff",display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <small style={{fontSize:9.5,color:palette.muted}}>Match {id} · refresh 60s · Campos pitch layer</small>
          <small style={{fontSize:9.5,fontWeight:850,color:ready?"#26724f":"#8a6b21"}}>{ready ? "完整 11v11 已可用" : "等待完整 11v11"}</small>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .pro-lineup-grid, .lineup-strength-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 520px) {
          .pro-lineup-grid { gap: 9px !important; }
        }
      `}</style>
    </section>
  );
}
