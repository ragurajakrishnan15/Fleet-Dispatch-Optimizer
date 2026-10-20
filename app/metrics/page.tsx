"use client";

import { CartesianGrid, Legend, Line, ComposedChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import StatTile from "@/components/StatTile";
import UtilizationChart from "@/components/UtilizationChart";
import RevenueChart from "@/components/RevenueChart";
import { formatHour } from "@/components/TimeSlider";
import raw from "@/lib/data/experiment-results.json";
import { mean } from "@/lib/ab-stats";
import { zoneById } from "@/lib/demand-model";
import type { DailyMetrics } from "@/lib/types";

const days = raw.days as { control: DailyMetrics; treatment: DailyMetrics }[];
const trt = days.map((d) => d.treatment);
const ctl = days.map((d) => d.control);
const avg = (rows: DailyMetrics[], k: keyof DailyMetrics) => mean(rows.map((r) => r[k]));
const last12 = (k: keyof DailyMetrics) => trt.slice(-12).map((r) => r[k]);

const util = { t: avg(trt, "utilizationPct"), c: avg(ctl, "utilizationPct") };
const eta = { t: avg(trt, "pickupEtaMin"), c: avg(ctl, "pickupEtaMin") };
const rev = { t: avg(trt, "revenuePerVehicleHr"), c: avg(ctl, "revenuePerVehicleHr") };

const utilData = raw.hourly.map((h) => ({ hour: h.hour, Optimized: h.utilTreatment, Naive: h.utilControl }));
const gapData = raw.hourly.map((h) => ({
  hour: h.hour,
  Demand: +h.demand.toFixed(0),
  Fulfilled: +h.fulfilledTreatment.toFixed(0),
  gap: [+h.fulfilledTreatment.toFixed(0), +h.demand.toFixed(0)],
}));
const zoneData = raw.zoneRevenue.slice(0, 10).map((z) => ({ name: zoneById[z.zoneId].name, revenue: z.treatment }));

const rides = { t: avg(trt, "ridesCompleted"), c: avg(ctl, "ridesCompleted") };

export default function MetricsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fleet Metrics</h1>
        <p className="text-muted mt-1">
          30-day average for the optimized policy on a 200-vehicle simulated fleet. Deltas compare against the naive-dispatch control over the same days.
        </p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Fleet utilization"
          value={`${util.t.toFixed(1)}%`}
          delta={`${(util.t - util.c) >= 0 ? "+" : ""}${(util.t - util.c).toFixed(1)} pts`}
          deltaDirection={util.t >= util.c ? "up" : "down"}
          deltaIsGood={util.t >= util.c}
          deltaNote="vs naive"
          sparklineData={last12("utilizationPct")}
        />
        <StatTile
          label="Avg pickup ETA"
          value={`${eta.t.toFixed(1)} min`}
          delta={`${(eta.t - eta.c) >= 0 ? "+" : ""}${(eta.t - eta.c).toFixed(2)} min`}
          deltaDirection={eta.t >= eta.c ? "up" : "down"}
          deltaIsGood={eta.t <= eta.c}
          deltaNote="vs naive"
          sparklineData={last12("pickupEtaMin")}
        />
        <StatTile
          label="Revenue / vehicle / hr"
          value={`$${rev.t.toFixed(2)}`}
          delta={`${(rev.t - rev.c) >= 0 ? "+$" : "-$"}${Math.abs(rev.t - rev.c).toFixed(2)}`}
          deltaDirection={rev.t >= rev.c ? "up" : "down"}
          deltaIsGood={rev.t >= rev.c}
          deltaNote="vs naive"
          sparklineData={last12("revenuePerVehicleHr")}
        />
        <StatTile
          label="Rides completed / day"
          value={Math.round(rides.t).toLocaleString("en-US")}
          delta={`${rides.t >= rides.c ? "+" : "-"}${Math.abs(((rides.t - rides.c) / rides.c) * 100).toFixed(1)}%`}
          deltaDirection={rides.t >= rides.c ? "up" : "down"}
          deltaIsGood={rides.t >= rides.c}
          deltaNote="vs naive"
          sparklineData={last12("ridesCompleted")}
        />
      </section>

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="font-semibold">Utilization by hour of day</h2>
        <p className="text-xs text-muted mb-2">Share of fleet ride capacity used, averaged across the 30 days. Peaks at the rush hours, dips overnight.</p>
        <div className="h-72">
          <UtilizationChart data={utilData} />
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-semibold">Top 10 zones by fare revenue</h2>
          <p className="text-xs text-muted mb-2">Average gross fares per day, optimized policy.</p>
          <div className="h-80">
            <RevenueChart data={zoneData} />
          </div>
        </section>

        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-semibold">Demand vs fulfilled rides</h2>
          <p className="text-xs text-muted mb-2">Shaded band = unmet demand (fleet-wide rides per hour).</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={gapData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h) => (h % 3 === 0 ? formatHour(h) : "")} interval={0} tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(h) => formatHour(Number(h))}
                />
                <Legend verticalAlign="top" height={28} />
                <Area type="monotone" dataKey="gap" name="Unmet demand" stroke="none" fill="var(--bad)" fillOpacity={0.25} />
                <Line type="monotone" dataKey="Demand" stroke="var(--accent-2)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Fulfilled" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
