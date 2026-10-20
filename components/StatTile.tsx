interface StatTileProps {
  label: string;
  value: string;
  delta?: string; // "+12.3%" or "-1.8 min"
  deltaDirection?: "up" | "down";
  deltaIsGood?: boolean; // green if good, red if bad
  deltaNote?: string;
  sparklineData?: number[]; // ~12 points
}

export default function StatTile({ label, value, delta, deltaDirection, deltaIsGood, deltaNote, sparklineData }: StatTileProps) {
  const deltaColor = deltaIsGood === undefined ? "text-muted" : deltaIsGood ? "text-good" : "text-bad";
  return (
    <div className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-2">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        {sparklineData && sparklineData.length > 1 && <Sparkline data={sparklineData} />}
      </div>
      {delta && (
        <div className={`text-sm tabular-nums ${deltaColor}`}>
          {deltaDirection === "up" ? "▲" : deltaDirection === "down" ? "▼" : ""} {delta}
          {deltaNote && <span className="text-muted"> {deltaNote}</span>}
        </div>
      )}
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 96;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill="var(--accent)" />
    </svg>
  );
}
