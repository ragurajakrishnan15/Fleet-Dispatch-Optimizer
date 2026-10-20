import { zones as allZones } from "./demand-model";
import { RIDES_PER_VEHICLE_HR, WAIT_COST_PER_MIN, maxTravelMinutes, riderEta, slotValue, travelKm, travelMinutes, waitSavedRiderMin } from "./vehicle-value";

export { riderEta };
import type { Assignment, Vehicle, Zone } from "./types";

export type Strategy = "naive" | "optimized";

/**
 * Rectangular Hungarian algorithm (potentials formulation).
 * Assigns each of n rows to a distinct one of m >= n columns minimising total cost.
 * Returns colOfRow[i].
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const m = n ? cost[0].length : 0;
  if (n > m) throw new Error("hungarian: need columns >= rows");
  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1); // p[j] = row matched to column j (1-indexed, 0 = none)
  const way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const colOfRow = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) colOfRow[p[j] - 1] = j - 1;
  return colOfRow;
}

/** Per-zone vehicle capacity proportional to horizon demand; topped up so total >= fleet size. */
export function zoneCapacities(demand: Map<string, number>, zones: Zone[], horizonHours: number, fleet: number) {
  const cap = new Map<string, number>();
  let total = 0;
  for (const z of zones) {
    const c = Math.max(1, Math.ceil((demand.get(z.id) ?? 0) / (RIDES_PER_VEHICLE_HR * horizonHours)));
    cap.set(z.id, c);
    total += c;
  }
  const byDemand = [...zones].sort((a, b) => (demand.get(b.id) ?? 0) - (demand.get(a.id) ?? 0));
  for (let i = 0; total < fleet; i = (i + 1) % byDemand.length, total++) {
    cap.set(byDemand[i].id, cap.get(byDemand[i].id)! + 1);
  }
  return cap;
}

function toAssignment(v: Vehicle, zoneId: string, slot: number, demand: Map<string, number>, horizon: number): Assignment {
  const km = travelKm(v, zoneId);
  const min = travelMinutes(km);
  return {
    vehicleId: v.id,
    zoneId,
    travelTimeMinutes: min,
    expectedValue: slotValue({
      zoneId,
      slot,
      zoneDemand: demand.get(zoneId) ?? 0,
      travelMin: min,
      travelKm: km,
      horizonHours: horizon,
    }),
  };
}

/**
 * demand: expected requests per zone over the whole horizon.
 * horizon: hours.
 *
 * naive     : each vehicle (in id order) goes to its nearest zone that still has unmet demand.
 * optimized : max sum of (slot revenue + wait-cost saving) s.t. every vehicle gets exactly one zone, zone capacity,
 *             and travel time <= maxTravelMinutes(horizon). Solved exactly with the Hungarian method
 *             on a vehicle x zone-slot matrix.
 */
export function optimizeDispatch(
  vehicles: Vehicle[],
  zones: Zone[],
  demand: Map<string, number>,
  horizon: number,
  strategy: Strategy = "optimized",
  waitCostPerMin: number = WAIT_COST_PER_MIN,
): Assignment[] {
  return strategy === "naive"
    ? naiveDispatch(vehicles, zones, demand, horizon)
    : valueDispatch(vehicles, zones, demand, horizon, waitCostPerMin);
}

function naiveDispatch(vehicles: Vehicle[], zones: Zone[], demand: Map<string, number>, horizon: number) {
  const filled = new Map<string, number>();
  const perVeh = RIDES_PER_VEHICLE_HR * horizon;
  return vehicles.map((v) => {
    const ranked = zones.map((z) => ({ z, km: travelKm(v, z.id) })).sort((a, b) => a.km - b.km);
    const open = ranked.find(({ z }) => (demand.get(z.id) ?? 0) - (filled.get(z.id) ?? 0) * perVeh > 0);
    const pick = (open ?? ranked[0]).z.id;
    const slot = filled.get(pick) ?? 0;
    filled.set(pick, slot + 1);
    return toAssignment(v, pick, slot, demand, horizon);
  });
}

export interface AssignmentProblem {
  slots: { zoneId: string; slot: number }[];
  /** cost[vehicle][slot] = -(slot revenue + wait-cost saving); out-of-range trips carry a large penalty */
  cost: number[][];
  /** vehicle x slot is a reachable pairing within the travel limit */
  feasible: boolean[][];
}

/** Builds the vehicle x zone-slot cost matrix that the optimized strategy minimises. */
export function buildAssignmentProblem(
  vehicles: Vehicle[],
  zones: Zone[],
  demand: Map<string, number>,
  horizon: number,
  waitCostPerMin: number,
): AssignmentProblem {
  const cap = zoneCapacities(demand, zones, horizon, vehicles.length);
  const limit = maxTravelMinutes(horizon);
  const slots: { zoneId: string; slot: number }[] = [];
  for (const z of zones) for (let k = 0; k < cap.get(z.id)!; k++) slots.push({ zoneId: z.id, slot: k });

  const INFEASIBLE = 1e6;
  const km = vehicles.map((v) => new Map(zones.map((z) => [z.id, travelKm(v, z.id)])));
  const feasible: boolean[][] = [];
  const cost = vehicles.map((_, i) => {
    const frow: boolean[] = [];
    const row = slots.map(({ zoneId, slot }) => {
      const k = km[i].get(zoneId)!;
      const min = travelMinutes(k);
      // travel limit is a soft wall: keeps the matrix solvable if a vehicle truly cannot reach anything
      frow.push(min <= limit);
      if (min > limit) return INFEASIBLE + min;
      const zoneDemand = demand.get(zoneId) ?? 0;
      const revenue = slotValue({ zoneId, slot, zoneDemand, travelMin: min, travelKm: k, horizonHours: horizon });
      const waitSaving = waitCostPerMin * waitSavedRiderMin({ slot, zoneDemand, travelMin: min, horizonHours: horizon });
      return -(revenue + waitSaving);
    });
    feasible.push(frow);
    return row;
  });
  return { slots, cost, feasible };
}

function valueDispatch(vehicles: Vehicle[], zones: Zone[], demand: Map<string, number>, horizon: number, waitCostPerMin: number) {
  const { slots, cost } = buildAssignmentProblem(vehicles, zones, demand, horizon, waitCostPerMin);
  const col = hungarian(cost);
  return vehicles.map((v, i) => {
    const { zoneId, slot } = slots[col[i]];
    return toAssignment(v, zoneId, slot, demand, horizon);
  });
}

export interface DispatchOutcome {
  totalRevenue: number;
  avgPickupEtaMin: number;
  utilizationPct: number;
  avgTravelMin: number;
}

/** Expected-value outcome of an assignment against forecast demand over the horizon. */
export function evaluate(
  assignments: Assignment[],
  demand: Map<string, number>,
  horizon: number,
  fleet = assignments.length,
): DispatchOutcome {
  const perVehCapacity = RIDES_PER_VEHICLE_HR * horizon;
  const count = new Map<string, number>();
  for (const a of assignments) count.set(a.zoneId, (count.get(a.zoneId) ?? 0) + 1);
  let served = 0;
  let totalDemand = 0;
  let etaWeighted = 0;
  for (const z of allZones) {
    const d = demand.get(z.id) ?? 0;
    const supply = (count.get(z.id) ?? 0) * perVehCapacity;
    served += Math.min(d, supply);
    totalDemand += d;
    etaWeighted += d * riderEta(d, supply);
  }
  return {
    totalRevenue: assignments.reduce((s, a) => s + a.expectedValue, 0),
    avgPickupEtaMin: totalDemand ? etaWeighted / totalDemand : 0,
    utilizationPct: (served / (fleet * perVehCapacity)) * 100,
    avgTravelMin: assignments.reduce((s, a) => s + a.travelTimeMinutes, 0) / Math.max(1, assignments.length),
  };
}
