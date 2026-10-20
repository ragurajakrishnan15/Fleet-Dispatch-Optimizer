export interface CiRow {
  label: string;
  lift: number; // fraction, e.g. 0.034
  lo: number;
  hi: number;
  /** true when a decrease is the desired direction (e.g. pickup ETA) */
  lowerIsBetter?: boolean;
}

/** Horizontal 95% confidence-interval plot of relative lift per metric. */
export default function ExperimentChart({ rows }: { rows: CiRow[] }) {
  const W = 640;
  const rowH = 46;
  const left = 150;
  const right = 24;
  const H = rows.length * rowH + 44;
  const all = rows.flatMap((r) => [r.lo, r.hi, 0]).map((v) => v * 100);
  const pad = 1;
  const min = Math.floor(Math.min(...all) - pad);
  const max = Math.ceil(Math.max(...all) + pad);
  const x = (v: number) => left + ((v * 100 - min) / (max - min)) * (W - left - right);
  const ticks: number[] = [];
  const step = max - min > 16 ? 4 : max - min > 8 ? 2 : 1;
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="95% confidence intervals for relative lift by metric">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t / 100)} x2={x(t / 100)} y1={8} y2={H - 28} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "3 3"} strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={x(t / 100)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {t > 0 ? "+" : ""}
            {t}%
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = 28 + i * rowH;
        const good = r.lowerIsBetter ? r.hi < 0 : r.lo > 0;
        const color = good ? "var(--good)" : "var(--accent-2)";
        return (
          <g key={r.label}>
            <text x={left - 12} y={y + 4} textAnchor="end" fontSize="12" fill="var(--fg)">
              {r.label}
            </text>
            <line x1={x(r.lo)} x2={x(r.hi)} y1={y} y2={y} stroke={color} strokeWidth={3} strokeLinecap="round" />
            <line x1={x(r.lo)} x2={x(r.lo)} y1={y - 6} y2={y + 6} stroke={color} strokeWidth={2} />
            <line x1={x(r.hi)} x2={x(r.hi)} y1={y - 6} y2={y + 6} stroke={color} strokeWidth={2} />
            <circle cx={x(r.lift)} cy={y} r={5} fill={color} stroke="var(--panel)" strokeWidth={2} />
            <text x={x(r.lift)} y={y - 11} textAnchor="middle" fontSize="11" fill="var(--muted)" className="tabular-nums">
              {(r.lift * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
