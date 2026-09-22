"use client";

const MODEL_NAME = {
  HKJC: "HKJC",
  FOREBET: "Forebet",
  DC: "Dixon-Coles",
  PI: "Pi Rating",
  FORM: "Team Form",
  MULTI: "Multi-source",
};

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return (Math.abs(n) <= 1.5 ? n * 100 : n);
}

function pick(values) {
  if (!values) return null;
  const rows = [
    ["H", pct(values.home)],
    ["D", pct(values.draw)],
    ["A", pct(values.away)],
  ].filter(([,value]) => Number.isFinite(value));
  if (!rows.length) return null;
  rows.sort((a,b) => b[1] - a[1]);
  return rows[0][0];
}

export default function ModelScoreboard({ rows = [], targetSide, market }) {
  const targetKey = targetSide === "H" ? "home" : targetSide === "D" ? "draw" : targetSide === "A" ? "away" : null;
  const marketTarget = targetKey ? pct(market?.[targetKey]) : null;

  const models = rows
    .filter((row) => row?.key !== "HKJC")
    .map((row) => {
      const available = ["home","draw","away"].every((key) => Number.isFinite(Number(row.values?.[key])));
      const targetProbability = targetKey ? pct(row.values?.[targetKey]) : null;
      const edge = targetProbability != null && marketTarget != null ? targetProbability - marketTarget : null;
      return {
        key: row.key,
        name: MODEL_NAME[row.key] || row.label || row.key,
        available,
        selection: available ? pick(row.values) : null,
        home: pct(row.values?.home),
        draw: pct(row.values?.draw),
        away: pct(row.values?.away),
        targetProbability,
        edge,
      };
    });

  return (
    <div className="model-scoreboard">
      <div className="model-scoreboard-head model-scoreboard-row">
        <span>MODEL</span>
        <span>PICK</span>
        <span>H</span>
        <span>D</span>
        <span>A</span>
        <span>{targetSide ? targetSide + " EDGE" : "EDGE"}</span>
      </div>

      {models.map((row) => (
        <div className={"model-scoreboard-row " + (row.available ? "" : "is-empty")} key={row.key}>
          <strong>{row.name}</strong>
          <b className={"model-pick model-pick-" + String(row.selection || "none").toLowerCase()}>
            {row.selection || "—"}
          </b>
          <span>{row.home == null ? "" : row.home.toFixed(1) + "%"}</span>
          <span>{row.draw == null ? "" : row.draw.toFixed(1) + "%"}</span>
          <span>{row.away == null ? "" : row.away.toFixed(1) + "%"}</span>
          <em className={row.edge != null && row.edge > 0 ? "supports" : row.edge != null ? "against" : ""}>
            {row.edge == null ? "" : (row.edge >= 0 ? "+" : "") + row.edge.toFixed(1) + "%"}
          </em>
        </div>
      ))}
    </div>
  );
}
