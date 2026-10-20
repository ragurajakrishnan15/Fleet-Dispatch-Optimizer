"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ExperimentChart from "@/components/ExperimentChart";
import raw from "@/lib/data/experiment-results.json";
import { column, formatP, mean, pairedTTest, tQuantile, variance, welchTTest, type MetricKey } from "@/lib/ab-stats";
import type { DailyMetrics } from "@/lib/types";

const days = raw.days as { control: DailyMetrics; treatment: DailyMetrics }[];
const control = days.map((d) => d.control);
const treatment = days.map((d) => d.treatment);

const METRICS: { key: MetricKey; label: string; fmt: (v: number) => string; lowerIsBetter?: boolean }[] = [
  { key: "revenuePerVehicleHr", label: "Revenue / vehicle / hr", fmt: (v) => `$${v.toFixed(2)}` },
  { key: "pickupEtaMin", label: "Avg pickup ETA (min)", fmt: (v) => v.toFixed(2), lowerIsBetter: true },
  { key: "utilizationPct", label: "Fleet utilization %", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "ridesCompleted", label: "Rides completed / day", fmt: (v) => Math.round(v).toLocaleString("en-US") },
];

// Running mean of revenue/vehicle/hr by day (static simulation output)
const cumulative = days.map((_, i) => {
  const upto = days.slice(0, i + 1);
  return {
    day: i + 1,
    Control: +mean(upto.map((d) => d.control.revenuePerVehicleHr)).toFixed(3),
    Treatment: +mean(upto.map((d) => d.treatment.revenuePerVehicleHr)).toFixed(3),
  };
});

type Analysis = "paired" | "welch";
const sign = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

export default function ExperimentPage() {
  const [analysis, setAnalysis] = useState<Analysis>("paired");

  const rows = useMemo(
    () =>
      METRICS.map((m) => {
        const c = column(control, m.key);
        const t = column(treatment, m.key);
        const r = analysis === "paired" ? pairedTTest(c, t) : welchTTest(c, t);
        return { ...m, c: mean(c), t: mean(t), r };
      }),
    [analysis],
  );

  const mde = useMemo(() => {
    const c = column(control, "revenuePerVehicleHr");
    const t = column(treatment, "revenuePerVehicleHr");
    const diffs = t.map((x, i) => x - c[i]);
    const n = diffs.length;
    return ((tQuantile(0.975, n - 1) + tQuantile(0.8, n - 1)) * Math.sqrt(variance(diffs) / n)) / mean(c);
  }, []);


  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dispatch Strategy A/B Test — 30-Day Simulation</h1>
        <p className="text-muted mt-1">
          Both arms run every day on the same demand: a fleet of 200 vehicles is dispatched in six 4-hour windows per day, once with the naive
          policy and once with the optimizer.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Control</div>
          <h2 className="font-semibold text-lg">Naive Dispatch</h2>
          <p className="text-sm text-muted mt-1">Each vehicle goes to the nearest zone that still has unmet forecast demand.</p>
        </div>
        <div className="rounded-xl border border-accent bg-panel p-4">
          <div className="text-xs uppercase tracking-wide text-accent">Treatment</div>
          <h2 className="font-semibold text-lg">Optimized Dispatch</h2>
          <p className="text-sm text-muted mt-1">Value-maximizing assignment solved exactly with capacity and travel-time constraints.</p>
        </div>
      </div>

      <section className="rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">Results</h2>
          <div className="inline-flex rounded-md border border-line overflow-hidden text-xs" role="group" aria-label="Analysis method">
            {(
              [
                ["paired", "Paired by day (recommended)"],
                ["welch", "Welch (independent)"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setAnalysis(k)}
                aria-pressed={analysis === k}
                className={`px-3 py-1.5 ${analysis === k ? "bg-accent text-white" : "text-muted hover:bg-panel-2"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px] tabular-nums">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="py-2 font-medium">Metric</th>
                <th className="font-medium text-right">Control</th>
                <th className="font-medium text-right">Treatment</th>
                <th className="font-medium text-right">Lift</th>
                <th className="font-medium text-right">95% CI (lift)</th>
                <th className="font-medium text-right">p-value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const good = m.lowerIsBetter ? m.r.lift < 0 : m.r.lift > 0;
                return (
                  <tr key={m.key} className="border-b border-line last:border-0">
                    <td className="py-2.5">{m.label}</td>
                    <td className="text-right text-muted">{m.fmt(m.c)}</td>
                    <td className="text-right">{m.fmt(m.t)}</td>
                    <td className={`text-right font-medium ${good ? "text-good" : "text-bad"}`}>{sign(m.r.lift)}</td>
                    <td className="text-right text-muted">
                      [{sign(m.r.liftCi95[0])}, {sign(m.r.liftCi95[1])}]
                    </td>
                    <td className={`text-right ${m.r.pValue < 0.05 ? "" : "text-accent-2"}`}>{formatP(m.r.pValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-3">
          {analysis === "paired"
            ? "Paired t-test on per-day differences. Both arms see the same days, so weekday/weekend swings cancel out of the comparison."
            : "Welch t-test treats the 30 control days and 30 treatment days as unrelated samples. Weekday/weekend variance swamps the effect, so it is much less sensitive here — compare the p-values."}
        </p>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-semibold mb-1">95% confidence intervals · relative lift</h2>
          <p className="text-xs text-muted mb-2">Green: significant change in the desired direction. Amber: interval crosses zero.</p>
          <ExperimentChart
            rows={rows.map((m) => ({ label: m.label.replace(" / vehicle / hr", " /veh/hr"), lift: m.r.lift, lo: m.r.liftCi95[0], hi: m.r.liftCi95[1], lowerIsBetter: m.lowerIsBetter }))}
          />
        </section>

        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-semibold mb-1">Revenue / vehicle / hr · running average</h2>
          <p className="text-xs text-muted mb-2">Cumulative mean over the 30-day test (x-axis: day).</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulative} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" interval={4} tickLine={false} axisLine={false} />
                <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => `$${Number(v).toFixed(2)}`}
                  labelFormatter={(d) => `Day ${d}`}
                />
                <Legend verticalAlign="top" height={28} />
                <Line type="monotone" dataKey="Control" stroke="var(--muted)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Treatment" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-line bg-panel p-4 text-sm text-muted space-y-2">
        <p>
          <span className="text-fg font-medium">Design:</span> N = 30 days × 200 vehicles · α = 0.05 (two-sided) · power target 0.80. With 30 paired days the
          minimum detectable lift in revenue/vehicle/hr is about <span className="text-fg">{(mde * 100).toFixed(1)}%</span>; the observed lift is{" "}
          <span className="text-fg">{sign(rows[0].r.lift)}</span>.
        </p>
        <p>
          <span className="text-fg font-medium">Caveat:</span> this is a simulation. Effect sizes come from the demand and fleet-positioning assumptions in
          the model (idle cars lag demand), not from real operations — the point is the method: a controlled comparison, the right test for the
          design and intervals alongside p-values.
        </p>
      </section>
    </div>
  );
}
