import { formatPct } from "@/lib/fast-tracker";

const OUTCOMES = [
  { key: "H", field: "home", label: "主勝", color: "#2f80ed" },
  { key: "D", field: "draw", label: "和", color: "#f2b134" },
  { key: "A", field: "away", label: "客勝", color: "#e05a5a" },
];

export default function ProbabilityRow({ label, values, strong = false }) {
  const raw = OUTCOMES.map((item) => {
    const value = Number(values?.[item.field]);
    return { ...item, value: Number.isFinite(value) && value > 0 ? value : 0 };
  });
  const total = raw.reduce((sum, item) => sum + item.value, 0);
  const cells = raw.map((item) => ({
    ...item,
    share: total > 0 ? (item.value / total) * 100 : 0,
  }));

  return (
    <div className={`prob-row ${strong ? "prob-row-strong" : ""}`}>
      <div className="prob-label">{label}</div>
      <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
        <div
          aria-label={cells.map((item) => `${item.label} ${formatPct(item.value)}`).join("，")}
          style={{
            display: "flex",
            width: "100%",
            height: 12,
            overflow: "hidden",
            borderRadius: 999,
            background: "#e9eeeb",
            boxShadow: "inset 0 0 0 1px rgba(25,45,35,.06)",
          }}
        >
          {cells.map((item) => (
            <span
              key={item.key}
              title={`${item.label} ${formatPct(item.value)}`}
              style={{
                width: `${item.share}%`,
                minWidth: item.share > 0 ? 2 : 0,
                background: item.color,
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,minmax(0,1fr))",
            gap: 6,
            fontSize: 10,
            lineHeight: 1.1,
          }}
        >
          {cells.map((item) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: item.key === "H" ? "flex-start" : item.key === "A" ? "flex-end" : "center",
                gap: 4,
                minWidth: 0,
              }}
            >
              <i
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  flex: "0 0 7px",
                  borderRadius: 2,
                  background: item.color,
                }}
              />
              <span style={{ fontWeight: 800, color: "#5f6f67" }}>{item.key}</span>
              <b style={{ color: "#1d2d27", whiteSpace: "nowrap" }}>{formatPct(item.value)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
