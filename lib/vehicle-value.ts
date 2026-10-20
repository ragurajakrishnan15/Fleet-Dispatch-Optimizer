import { roadKm, travelMinutes } from "./geo";
import { model, zoneById } from "./demand-model";
import type { Vehicle } from "./types";

/** A vehicle completes roughly one ride per ~35 min cycle (pickup + trip + reposition). */
export const RIDES_PER_VEHICLE_HR = 1.7;
/** Deadhead cost of repositioning, $/km (energy + wear). */
export const COST_PER_KM = 0.45;

export const travelKm = (v: Pick<Vehicle, "lat" | "lng">, zoneId: string) => {
  const z = zoneById[zoneId];
  return roadKm([v.lat, v.lng], [z.lat, z.lng]);
};

export const maxTravelMinutes = (horizonHours: number) => Math.min(45, 30 * horizonHours);

/**
 * Value of sending a vehicle to a zone as the k-th (0-indexed) vehicle there.
 * Slot k can serve at most RIDES_PER_VEHICLE_HR * usable hours rides, drawn from the
 * zone demand not already claimed by slots 0..k-1, so marginal value decreases with k.
 */
export function slotValue(opts: {
  zoneId: string;
  slot: number;
  zoneDemand: number; // expected requests over the horizon
  travelMin: number;
  travelKm: number;
  horizonHours: number;
}) {
  const { zoneId, slot, zoneDemand, travelMin, horizonHours } = opts;
  const usableHr = Math.max(0, horizonHours - travelMin / 60);
  const perVehicle = RIDES_PER_VEHICLE_HR * usableHr;
  const remaining = Math.max(0, zoneDemand - slot * RIDES_PER_VEHICLE_HR * horizonHours);
  const rides = Math.min(perVehicle, remaining);
  return rides * model.avg_fare_by_zone[zoneId] - COST_PER_KM * opts.travelKm;
}

export { travelMinutes };
