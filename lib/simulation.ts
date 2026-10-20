import { predictDemand, predictWindow, zones } from "./demand-model";
import { FLEET_CLUSTERING, generateFleet } from "./fleet";
import { createRng } from "./rng";
import { optimizeDispatch, riderEta, type Strategy } from "./solver";
import { COST_PER_KM, RIDES_PER_VEHICLE_HR, WAIT_COST_PER_MIN, travelKm } from "./vehicle-value";
import { model } from "./demand-model";
import type { DailyMetrics } from "./types";

export const SIM_DAYS = 30;
export const SIM_FLEET = 200;
export const WINDOW_HOURS = 4;
/** 2025-01-05 is a Sunday; day 0 of the simulation. */
const START_DOW = 0;

export interface SimulationResult {
  days: { control: DailyMetrics; treatment: DailyMetrics }[];
  /** averaged over days, per hour of day */
  hourly: { hour: number; demand: number; fulfilledControl: number; fulfilledTreatment: number; utilControl: number; utilTreatment: number }[];
  /** average daily net revenue per zone, treatment arm */
  zoneRevenue: { zoneId: string; control: number; treatment: number }[];
}

interface ArmAcc {
  revenue: number;
  deadheadCost: number;
  served: number;
  demand: number;
  etaWeighted: number;
  servedHour: number[];
  zoneRevenue: Map<string, number>;
}
const newAcc = (): ArmAcc => ({
  revenue: 0,
  deadheadCost: 0,
  served: 0,
  demand: 0,
  etaWeighted: 0,
  servedHour: new Array(24).fill(0),
  zoneRevenue: new Map(),
});

export interface SimOptions {
  seed?: number;
  days?: number;
  /** exponent on previous-window demand when placing idle cars; 0 = uniformly scattered */
  clustering?: number;
  /** scales all demand (forecast and realised), 1 = baseline market */
  demandMultiplier?: number;
  /** $ per rider-minute in the optimized objective */
  waitCostPerMin?: number;
}

export function runSimulation(opts: SimOptions = {}): SimulationResult {
  const { seed = 42, days: nDays = SIM_DAYS, clustering = FLEET_CLUSTERING, demandMultiplier = 1, waitCostPerMin = WAIT_COST_PER_MIN } = opts;
  const rng = createRng(seed);
  const days: SimulationResult["days"] = [];
  const hourDemand = new Array(24).fill(0);
  const hourServed = { naive: new Array(24).fill(0), optimized: new Array(24).fill(0) };
  const zoneRev = { naive: new Map<string, number>(), optimized: new Map<string, number>() };

  for (let day = 0; day < nDays; day++) {
    const dow = (START_DOW + day) % 7;
    const dayShock = Math.exp(rng.normal() * 0.07); // shared demand shock: both arms see identical demand
    const acc: Record<Strategy, ArmAcc> = { naive: newAcc(), optimized: newAcc() };

    for (let startHour = 0; startHour < 24; startHour += WINDOW_HOURS) {
      // idle cars sit where the previous window's rides ended, so positions lag demand
      const lagged = new Map(
        zones.map((z) => [z.id, predictWindow(z.id, startHour - WINDOW_HOURS + 24, WINDOW_HOURS, dow) ** clustering]),
      );
      const vehicles = generateFleet(SIM_FLEET, Math.floor(rng.next() * 2 ** 31), lagged);
      const forecast = new Map(zones.map((z) => [z.id, predictWindow(z.id, startHour, WINDOW_HOURS, dow) * demandMultiplier]));

      // realised hourly demand per zone, identical for both arms
      const realised = new Map<string, number[]>();
      for (const z of zones) {
        const hrs: number[] = [];
        for (let i = 0; i < WINDOW_HOURS; i++) {
          hrs.push(rng.poisson(predictDemand(z.id, startHour + i, dow) * dayShock * demandMultiplier));
        }
        realised.set(z.id, hrs);
      }

      for (const strategy of ["naive", "optimized"] as const) {
        const a = acc[strategy];
        const assignments = optimizeDispatch(vehicles, zones, forecast, WINDOW_HOURS, strategy, waitCostPerMin);
        const capacity = new Map<string, number>();
        const vById = new Map(vehicles.map((v) => [v.id, v]));
        for (const asg of assignments) {
          const usable = Math.max(0, WINDOW_HOURS - asg.travelTimeMinutes / 60);
          capacity.set(asg.zoneId, (capacity.get(asg.zoneId) ?? 0) + RIDES_PER_VEHICLE_HR * usable);
          a.deadheadCost += COST_PER_KM * travelKm(vById.get(asg.vehicleId)!, asg.zoneId);
        }
        for (const z of zones) {
          const hrs = realised.get(z.id)!;
          // a parked car cannot bank capacity: each hour serves at most (cars in zone) x rides/hr
          const hourlyCap = (capacity.get(z.id) ?? 0) / WINDOW_HOURS;
          let servedZ = 0;
          let demandZ = 0;
          hrs.forEach((r, i) => {
            const s = Math.min(r, hourlyCap);
            servedZ += s;
            demandZ += r;
            a.servedHour[(startHour + i) % 24] += s;
            if (strategy === "naive") hourDemand[(startHour + i) % 24] += r; // count demand once
          });
          a.revenue += servedZ * model.avg_fare_by_zone[z.id];
          a.served += servedZ;
          a.demand += demandZ;
          // ETA is demand-weighted: riders in poorly covered zones count even when few get served
          a.etaWeighted += demandZ * riderEta(demandZ, hourlyCap * WINDOW_HOURS);
          a.zoneRevenue.set(z.id, (a.zoneRevenue.get(z.id) ?? 0) + servedZ * model.avg_fare_by_zone[z.id]);
        }
      }
    }

    const toMetrics = (a: ArmAcc): DailyMetrics => ({
      day: day + 1,
      revenuePerVehicleHr: (a.revenue - a.deadheadCost) / (SIM_FLEET * 24),
      pickupEtaMin: a.etaWeighted / Math.max(1, a.demand),
      utilizationPct: (a.served / (SIM_FLEET * RIDES_PER_VEHICLE_HR * 24)) * 100,
      ridesCompleted: Math.round(a.served),
    });
    days.push({ control: toMetrics(acc.naive), treatment: toMetrics(acc.optimized) });
    acc.naive.servedHour.forEach((v, h) => (hourServed.naive[h] += v));
    acc.optimized.servedHour.forEach((v, h) => (hourServed.optimized[h] += v));
    for (const s of ["naive", "optimized"] as const)
      for (const [zid, r] of acc[s].zoneRevenue) zoneRev[s].set(zid, (zoneRev[s].get(zid) ?? 0) + r);
  }

  const hourlyCap = SIM_FLEET * RIDES_PER_VEHICLE_HR;
  return {
    days,
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      demand: hourDemand[hour] / nDays,
      fulfilledControl: hourServed.naive[hour] / nDays,
      fulfilledTreatment: hourServed.optimized[hour] / nDays,
      utilControl: (hourServed.naive[hour] / nDays / hourlyCap) * 100,
      utilTreatment: (hourServed.optimized[hour] / nDays / hourlyCap) * 100,
    })),
    zoneRevenue: zones
      .map((z) => ({
        zoneId: z.id,
        control: (zoneRev.naive.get(z.id) ?? 0) / nDays,
        treatment: (zoneRev.optimized.get(z.id) ?? 0) / nDays,
      }))
      .sort((a, b) => b.treatment - a.treatment),
  };
}
