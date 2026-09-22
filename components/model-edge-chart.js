"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SIDE_KEY = { H: "home", D: "draw", A: "away" };

function toPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n;
}

function labelForModel(row) {
  if (row.key === "FOREBET") return "Forebet";
  if (row.key === "DC") return "Dixon-Coles";
  if (row.key === "PI") return "Pi";
  if (row.key === "FORM") return "Team Form";
  if (row.key === "MULTI") return "Multi-source";
  return row.label || row.key;
}

function EdgeTooltip({ active, payload, marketPct }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="model-edge-tooltip">
      <strong>{row.model}</strong>
      <span>模型 {row.probability.toFixed(1)}%</span>
      <span>HKJC fair {marketPct == null ? "—" : marketPct.toFixed(1) + "%"}</span>
      <b>{row.edge == null ? "—" : (row.edge >= 0 ? "+" : "") + row.edge.toFixed(1) + "% edge"}</b>
    </div>
  );
}

export default function ModelEdgeChart({ rows = [], side, marketProbability }) {
  const sideKey = SIDE_KEY[side];
  const marketPct = toPct(marketProbability);

  const data = rows
    .filter((row) => row?.key !== "HKJC" && sideKey && row?.values)
    .map((row) => {
      const probability = toPct(row.values?.[sideKey]);
      return {
        model: labelForModel(row),
        probability,
        edge: probability == null || marketPct == null ? null : probability - marketPct,
      };
    })
    .filter((row) => Number.isFinite(row.probability));

  if (!sideKey || !data.length) {
    return (
      <div className="model-edge-empty">
        <span>MULTI-MODEL VIEW</span>
        <p>暫時未有足夠模型資料做 visual comparison。</p>
      </div>
    );
  }

  const support = data.filter((row) => row.edge != null && row.edge > 0).length;

  return (
    <div className="model-edge-chart">
      <div className="model-edge-chart-head">
        <div>
          <span>MULTI-MODEL VIEW</span>
          <h3>各模型對目前投注位嘅支持程度</h3>
        </div>
        <div className="model-support-score">
          <strong>{support}/{data.length}</strong>
          <span>高於 HKJC fair</span>
        </div>
      </div>

      <div className="model-edge-chart-frame">
        <ResponsiveContainer width="100%" height={Math.max(210, data.length * 42)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 22, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7ece9" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(value) => value + "%"}
              tick={{ fontSize: 10, fill: "#77847d" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="model"
              width={92}
              tick={{ fontSize: 10, fill: "#314d40", fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<EdgeTooltip marketPct={marketPct} />} cursor={{ fill: "#f5f8f6" }} />
            {marketPct != null ? (
              <ReferenceLine
                x={marketPct}
                stroke="#20372c"
                strokeDasharray="4 4"
                label={{ value: "HKJC fair", position: "insideTopRight", fill: "#596960", fontSize: 9 }}
              />
            ) : null}
            <Bar dataKey="probability" barSize={18} radius={[0, 5, 5, 0]}>
              {data.map((row) => (
                <Cell
                  key={row.model}
                  fill={row.edge != null && row.edge > 0 ? "#2b8a57" : "#bcc7c0"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="model-edge-legend">
        <span><i className="support"></i>高過市場 = 支持目前 Edge</span>
        <span><i className="against"></i>低過市場 = 唔支持</span>
      </div>
    </div>
  );
}
