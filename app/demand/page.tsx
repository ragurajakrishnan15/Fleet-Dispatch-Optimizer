"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ZoneMap from "@/components/Map";
import HeatmapLayer from "@/components/HeatmapLayer";
import TimeSlider, { formatHour } from "@/components/TimeSlider";
import { predictAll, predictDemand, zones, zoneById } from "@/lib/demand-model";
import { demandColor } from "@/lib/colors";
import rides from "@/lib/data/synthetic-rides.json";
import gbt from "@/lib/data/gbt-metrics.json";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_LABEL: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  airport: "Airport",
  entertainment: "Entertainment",
  tech_campus: "Tech campus",
};

export default function DemandPage() {
  const [hour, setHour] = useState(8);
  const [dow, setDow] = useState(3);
  const [selected, setSelected] = useState<string | null>("sunset");

  const values = useMemo(() => predictAll(hour, dow), [hour, dow]);
  // fixed colour scale across the whole day/week so scrubbing is comparable
  const max = useMemo(() => {
    let m = 0;
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) for (const z of zones) m = Math.max(m, predictDemand(z.id, h, d));
    return m;
  }, []);
  const top = useMemo(
    () => [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    [values],
  );
  const rideStats = useMemo(() => {
    const rs = selected ? rides.filter((r) => r.pickup_zone === selected) : [];
    if (!rs.length) return null;
    const avg = (f: (r: (typeof rs)[number]) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    return { n: rs.length, fare: avg((r) => r.fare), km: avg((r) => r.distance_km), wait: avg((r) => r.pickup_wait_min) };
  }, [selected]);
  const total = useMemo(() => [...values.values()].reduce((s, v) => s + v, 0), [values]);
  const profile = useMemo(
    () => (selected ? Array.from({ length: 24 }, (_, h) => ({ hour: h, demand: +predictDemand(selected, h, dow).toFixed(1) })) : []),
    [selected, dow],
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demand Heatmap</h1>
        <p className="text-muted mt-1">Predicted ride requests per hour for each zone. Scrub the hour and day to see rush-hour flows shift.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <div className="flex flex-col gap-4">
          <ZoneMap caption={<span>Predicted requests/hr · {DAYS[dow]} {formatHour(hour)}</span>}>
            <HeatmapLayer values={values} max={max} selectedId={selected} onSelect={setSelected} formatValue={(v) => `${v.toFixed(1)} req/hr`} />
          </ZoneMap>

          <div className="rounded-xl border border-line bg-panel p-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <TimeSlider value={hour} onChange={setHour} />
            <div>
              <div className="text-sm text-muted mb-2">Day of week</div>
              <div className="inline-flex rounded-md border border-line overflow-hidden" role="group" aria-label="Day of week">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setDow(i)}
                    aria-pressed={dow === i}
                    className={`px-2.5 py-1.5 text-xs ${dow === i ? "bg-accent-btn text-white" : "text-muted hover:bg-panel-2"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span>Low</span>
            <div className="h-2 flex-1 max-w-xs rounded-full" style={{ background: `linear-gradient(90deg, ${demandColor(0)}, ${demandColor(0.5)}, ${demandColor(1)})` }} />
            <span>High ({max.toFixed(0)} req/hr)</span>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-line bg-panel p-4">
            <h2 className="font-semibold">Top 5 zones · {formatHour(hour)}</h2>
            <p className="text-xs text-muted mb-3">Citywide: {total.toFixed(0)} requests/hr</p>
            <ol className="flex flex-col gap-2">
              {top.map(([id, v], i) => (
                <li key={id}>
                  <button className="w-full text-left" onClick={() => setSelected(id)}>
                    <div className="flex justify-between text-sm">
                      <span>
                        <span className="text-muted tabular-nums mr-2">{i + 1}</span>
                        {zoneById[id].name}
                      </span>
                      <span className="tabular-nums">{v.toFixed(1)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-panel-2 mt-1">
                      <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${(v / top[0][1]) * 100}%` }} />
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl border border-line bg-panel p-4">
            <h2 className="font-semibold">{selected ? zoneById[selected].name : "Select a zone"}</h2>
            {selected && (
              <>
                <p className="text-xs text-muted mb-2">
                  {TYPE_LABEL[zoneById[selected].type]} zone · 24h profile on {DAYS[dow]}
                </p>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={profile} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="hour" tickFormatter={(h) => (h % 6 === 0 ? formatHour(h) : "")} interval={0} tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={34} />
                      <Tooltip
                        contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                        labelFormatter={(h) => formatHour(Number(h))}
                        formatter={(v) => [`${v} req/hr`, "Demand"]}
                      />
                      <ReferenceLine x={hour} stroke="var(--accent-2)" strokeDasharray="4 3" />
                      <Area type="monotone" dataKey="demand" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {rideStats && (
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center border-t border-line pt-3">
                    {[
                      ["Sample rides", String(rideStats.n)],
                      ["Avg fare", `$${rideStats.fare.toFixed(2)}`],
                      ["Avg trip", `${rideStats.km.toFixed(1)} km`],
                      ["Avg wait", `${rideStats.wait.toFixed(1)} min`],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dd className="font-semibold tabular-nums text-sm">{v}</dd>
                        <dt className="text-[11px] text-muted">{k}</dt>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="text-[11px] text-muted mt-2">Pickups from the 1,000-ride synthetic sample (all hours and days).</p>
              </>
            )}
          </section>

          <section className="rounded-xl border border-line bg-panel p-4 text-sm">
            <h2 className="font-semibold mb-2">About the model</h2>
            <p className="text-muted">
              The map above is driven by a transparent rate model: its curves are hand-specified, and the 1,000 rides in the dataset are sampled from it.
              Expected requests are a zone base rate scaled by an hour-of-day curve that depends on zone type (rush-hour direction flips between residential and commercial / tech zones,
              entertainment spikes late at night) and a day-of-week factor.
            </p>
            <p className="mt-2 font-mono text-xs bg-panel-2 rounded-md p-2 overflow-x-auto">
              demand = base_rate[zone] × hour_curve[zone_type, weekday|weekend][hour] × dow_factor[dow]
            </p>
            <h3 className="font-medium mt-3 mb-1">Trained model check (Python)</h3>
            <p className="text-muted">
              A gradient-boosted model (scikit-learn, Poisson loss) was trained on a SQL-built feature table of {gbt.zones} zones × {gbt.weeks} weeks of synthetic hourly
              requests and scored on the last {gbt.test_days} days. Lower is better.
            </p>
            <table className="w-full text-xs mt-2 tabular-nums">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-1 font-medium">Model</th>
                  <th className="font-medium text-right">MAE</th>
                  <th className="font-medium text-right">Poisson dev.</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["True rate (noise floor)", gbt.metrics.oracle_true_rate],
                    ["Gradient boosting", gbt.metrics.gradient_boosting],
                    ["Seasonal average", gbt.metrics.seasonal_average],
                  ] as const
                ).map(([name, m]) => (
                  <tr key={name} className="border-b border-line last:border-0">
                    <td className="py-1">{name}</td>
                    <td className="text-right">{m.mae.toFixed(2)}</td>
                    <td className="text-right">{m.poisson_deviance.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted mt-2">
              On this synthetic data the boosted model roughly ties a simple seasonal average (both near the noise floor): the data contain no structure beyond the
              rate, so there is little to learn. It is a pipeline demonstration, not evidence of real-world forecasting skill.
            </p>
            <h3 className="font-medium mt-3 mb-1">Features</h3>
            <ul className="text-muted list-disc pl-5 space-y-0.5">
              <li>hour_of_day</li>
              <li>day_of_week (weekday vs weekend curve)</li>
              <li>zone_id → base rate and avg fare</li>
              <li>zone_type (residential, commercial, airport, entertainment, tech campus)</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
