"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ZoneMap from "@/components/Map";
import HeatmapLayer from "@/components/HeatmapLayer";
import VehicleMarkers from "@/components/VehicleMarkers";
import DispatchAnimator, { destinations, vehicleProgress } from "@/components/DispatchAnimator";
import StatTile from "@/components/StatTile";
import TimeSlider, { formatHour } from "@/components/TimeSlider";
import { predictWindow, zones } from "@/lib/demand-model";
import { FLEET_CLUSTERING, generateFleet } from "@/lib/fleet";
import { evaluate, optimizeDispatch, zoneCapacities, type Strategy } from "@/lib/solver";
import { maxTravelMinutes } from "@/lib/vehicle-value";

const DOW = 3; // Wednesday
const ANIM_MS = 2200;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export default function OptimizerPage() {
  const [nVehicles, setNVehicles] = useState(50);
  const [horizon, setHorizon] = useState(2);
  const [hour, setHour] = useState(21);
  const [strategy, setStrategy] = useState<Strategy>("optimized");
  const [ran, setRan] = useState<{ strategy: Strategy; key: string } | null>(null);
  const [progress, setProgress] = useState(0);

  const key = `${nVehicles}|${horizon}|${hour}`;

  const demand = useMemo(() => new Map(zones.map((z) => [z.id, predictWindow(z.id, hour, horizon, DOW)])), [hour, horizon]);
  const maxDemand = useMemo(() => Math.max(...demand.values()), [demand]);
  const vehicles = useMemo(() => {
    // idle cars sit where the previous window's rides ended, so positions lag demand
    const lagged = new Map(zones.map((z) => [z.id, predictWindow(z.id, hour - horizon + 24, horizon, DOW) ** FLEET_CLUSTERING]));
    return generateFleet(nVehicles, 11, lagged);
  }, [nVehicles, hour, horizon]);

  const plans = useMemo(() => {
    const naive = optimizeDispatch(vehicles, zones, demand, horizon, "naive");
    const optimized = optimizeDispatch(vehicles, zones, demand, horizon, "optimized");
    return {
      naive: { assignments: naive, outcome: evaluate(naive, demand, horizon) },
      optimized: { assignments: optimized, outcome: evaluate(optimized, demand, horizon) },
    };
  }, [vehicles, demand, horizon]);

  // Any control change invalidates a previous run.
  const active = ran && ran.key === key ? ran : null;
  const shown = active ? plans[active.strategy] : null;
  const dests = useMemo(() => (shown ? destinations(shown.assignments) : new Map()), [shown]);

  const rafRef = useRef<number | null>(null);
  const run = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setRan({ strategy, key });
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setProgress(1);
      return;
    }
    setProgress(0);
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ANIM_MS);
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => void (rafRef.current && cancelAnimationFrame(rafRef.current)), []);

  const badges = useMemo(() => {
    if (!shown || progress < 1) return undefined;
    const m = new Map<string, number>();
    shown.assignments.forEach((a) => m.set(a.zoneId, (m.get(a.zoneId) ?? 0) + 1));
    return m;
  }, [shown, progress]);

  const idleVehicles = useMemo(
    () => (shown ? vehicles.filter((_, i) => vehicleProgress(i, vehicles.length, progress) <= 0) : vehicles),
    [vehicles, shown, progress],
  );

  const naive = plans.naive.outcome;
  const opt = plans.optimized.outcome;
  const cur = shown?.outcome;
  const lift = ((opt.totalRevenue - naive.totalRevenue) / naive.totalRevenue) * 100;
  const curLift = cur ? ((cur.totalRevenue - naive.totalRevenue) / naive.totalRevenue) * 100 : 0;
  const cap = useMemo(() => zoneCapacities(demand, zones, horizon, nVehicles), [demand, horizon, nVehicles]);
  const done = progress >= 1 && !!shown;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dispatch Optimizer</h1>
        <p className="text-muted mt-1">
          Idle cars (orange) are scattered where the last wave of rides ended. Zones are shaded by forecast demand over the horizon. Run the solver to
          reposition the fleet.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <ZoneMap
          caption={
            <span>
              {nVehicles} idle vehicles · Wed {formatHour(hour)}–{formatHour((hour + horizon) % 24)} demand
            </span>
          }
        >
          <HeatmapLayer values={demand} max={maxDemand} formatValue={(v) => `${v.toFixed(0)} rides forecast`} badges={badges} />
          {shown && <DispatchAnimator vehicles={vehicles} assignments={shown.assignments} progress={progress} dests={dests} />}
          <VehicleMarkers vehicles={idleVehicles} />
        </ZoneMap>

        <aside className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-5 h-fit">
          <div>
            <div className="flex justify-between text-sm">
              <label htmlFor="nveh" className="text-muted">
                Idle vehicles
              </label>
              <span className="font-semibold tabular-nums">{nVehicles}</span>
            </div>
            <input id="nveh" type="range" min={10} max={100} step={5} value={nVehicles} onChange={(e) => setNVehicles(Number(e.target.value))} className="w-full mt-1" />
          </div>

          <TimeSlider value={hour} onChange={setHour} label="Dispatch time (Wednesday)" />

          <div>
            <label htmlFor="horizon" className="text-sm text-muted">
              Time horizon
            </label>
            <select
              id="horizon"
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm"
            >
              <option value={1}>Next 1 hour</option>
              <option value={2}>Next 2 hours</option>
              <option value={4}>Next 4 hours</option>
            </select>
            <p className="text-xs text-muted mt-1">Max repositioning trip: {maxTravelMinutes(horizon)} min</p>
          </div>

          <fieldset>
            <legend className="text-sm text-muted mb-1">Strategy</legend>
            <div className="grid grid-cols-2 rounded-md border border-line overflow-hidden text-sm">
              {(["naive", "optimized"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  aria-pressed={strategy === s}
                  className={`px-2 py-2 ${strategy === s ? "bg-accent text-white" : "text-muted hover:bg-panel-2"}`}
                >
                  {s === "naive" ? "Naive (nearest zone)" : "Optimized (max value)"}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            onClick={run}
            className="rounded-lg bg-accent text-white font-semibold py-3 hover:brightness-110 active:brightness-95 transition"
          >
            {done || (shown && progress > 0) ? "Run again" : "Run Optimizer"}
          </button>
          {!active && ran && <p className="text-xs text-muted">Controls changed — run again to refresh.</p>}
        </aside>
      </div>

      <section aria-live="polite" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total expected revenue" value={cur ? usd(cur.totalRevenue) : "—"} />
        <StatTile label="Avg pickup ETA" value={cur ? `${cur.avgPickupEtaMin.toFixed(1)} min` : "—"} />
        <StatTile label="Fleet utilization" value={cur ? `${cur.utilizationPct.toFixed(0)}%` : "—"} />
        <StatTile
          label="Revenue vs naive"
          value={cur ? pct(curLift) : "—"}
          delta={cur && active?.strategy === "naive" ? "baseline strategy" : undefined}
          deltaIsGood={undefined}
        />
      </section>

      <section className="rounded-xl border border-line bg-panel p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Before / after: same fleet, same forecast</h2>
        <table className="w-full text-sm min-w-[400px]">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="py-2 pr-2 font-medium">Metric</th>
              <th className="font-medium text-right">Naive</th>
              <th className="font-medium text-right">Optimized</th>
              <th className="font-medium text-right">Change</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <Row label="Expected revenue" a={usd(naive.totalRevenue)} b={usd(opt.totalRevenue)} change={pct(lift)} good={lift >= 0} />
            <Row
              label="Avg pickup ETA"
              a={`${naive.avgPickupEtaMin.toFixed(1)} min`}
              b={`${opt.avgPickupEtaMin.toFixed(1)} min`}
              change={pct(((opt.avgPickupEtaMin - naive.avgPickupEtaMin) / naive.avgPickupEtaMin) * 100)}
              good={opt.avgPickupEtaMin <= naive.avgPickupEtaMin}
            />
            <Row
              label="Fleet utilization"
              a={`${naive.utilizationPct.toFixed(1)}%`}
              b={`${opt.utilizationPct.toFixed(1)}%`}
              change={`${(opt.utilizationPct - naive.utilizationPct) >= 0 ? "+" : ""}${(opt.utilizationPct - naive.utilizationPct).toFixed(1)} pts`}
              good={opt.utilizationPct >= naive.utilizationPct}
            />
            <Row
              label="Avg repositioning trip"
              a={`${naive.avgTravelMin.toFixed(1)} min`}
              b={`${opt.avgTravelMin.toFixed(1)} min`}
              change={`${(opt.avgTravelMin - naive.avgTravelMin) >= 0 ? "+" : ""}${(opt.avgTravelMin - naive.avgTravelMin).toFixed(1)} min`}
              good={undefined}
            />
          </tbody>
        </table>
        <div className="mt-4 text-sm text-muted space-y-2">
          <p>
            <span className="text-fg font-medium">Objective:</span> maximize Σ expected value, where each vehicle-to-zone slot is worth
            (rides it can serve × avg fare) − deadhead cost, and later vehicles in the same zone only get the demand earlier ones left over.
          </p>
          <p>
            <span className="text-fg font-medium">Constraints:</span> every vehicle gets exactly one zone · zone capacity ∝ demand (total capacity{" "}
            {[...cap.values()].reduce((s, c) => s + c, 0)} slots for {nVehicles} vehicles) · repositioning trip ≤ {maxTravelMinutes(horizon)} min. Solved
            exactly with the Hungarian algorithm on a vehicle × zone-slot matrix. Naive greedily sends each car to its nearest zone with unmet demand.
          </p>
        </div>
      </section>
    </div>
  );
}

function Row({ label, a, b, change, good }: { label: string; a: string; b: string; change: string; good: boolean | undefined }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2 text-muted">{label}</td>
      <td className="text-right">{a}</td>
      <td className="text-right font-medium">{b}</td>
      <td className={`text-right ${good === undefined ? "text-muted" : good ? "text-good" : "text-bad"}`}>{change}</td>
    </tr>
  );
}
