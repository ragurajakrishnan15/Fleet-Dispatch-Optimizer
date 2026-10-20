"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ZoneMap from "@/components/Map";
import HeatmapLayer from "@/components/HeatmapLayer";
import TimeSlider, { formatHour } from "@/components/TimeSlider";
import { predictAll, predictDemand, zones, zoneById } from "@/lib/demand-model";
import { demandColor } from "@/lib/colors";

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
                    className={`px-2.5 py-1.5 text-xs ${dow === i ? "bg-accent text-white" : "text-muted hover:bg-panel-2"}`}
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
              </>
            )}
          </section>

          <section className="rounded-xl border border-line bg-panel p-4 text-sm">
            <h2 className="font-semibold mb-2">About the model</h2>
            <p className="text-muted">
              A transparent rate model, not a trained ML model: the curves are hand-specified and the 1,000 rides in the dataset are sampled from it.
              Expected requests are a zone base rate scaled by an hour-of-day curve that depends on zone type (rush-hour direction flips between residential and commercial / tech zones,
              entertainment spikes late at night) and a day-of-week factor.
            </p>
            <p className="mt-2 font-mono text-xs bg-panel-2 rounded-md p-2 overflow-x-auto">
              demand = base_rate[zone] × hour_curve[zone_type, weekday|weekend][hour] × dow_factor[dow]
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
