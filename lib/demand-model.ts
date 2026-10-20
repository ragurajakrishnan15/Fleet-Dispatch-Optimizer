import weights from "./data/model-weights.json";
import zonesJson from "./data/zones.json";
import type { DemandModel, Zone } from "./types";

export const zones = zonesJson as Zone[];
export const model = weights as unknown as DemandModel & { market_scale: number };

export const zoneById = Object.fromEntries(zones.map((z) => [z.id, z])) as Record<string, Zone>;

const isWeekend = (dow: number) => dow === 0 || dow === 6;

/**
 * Expected ride requests per hour in a zone.
 *   demand = base_rate[zone] * hour_multiplier[zone_type][weekday|weekend][hour] * dow_factor[dow] * market_scale
 * dow: 0 = Sunday.
 */
export function predictDemand(zoneId: string, hour: number, dow: number): number {
  const z = zoneById[zoneId];
  const curve = model.hour_multipliers[z.type][isWeekend(dow) ? "weekend" : "weekday"];
  return model.zone_base_rates[zoneId] * curve[((hour % 24) + 24) % 24] * model.dow_factors[dow] * model.market_scale;
}

export function predictAll(hour: number, dow: number): Map<string, number> {
  return new Map(zones.map((z) => [z.id, predictDemand(z.id, hour, dow)]));
}

/** Expected total requests over [startHour, startHour + hours) wrapping past midnight. */
export function predictWindow(zoneId: string, startHour: number, hours: number, dow: number): number {
  let total = 0;
  for (let i = 0; i < hours; i++) {
    const h = startHour + i;
    total += predictDemand(zoneId, h % 24, (dow + Math.floor(h / 24)) % 7);
  }
  return total;
}

export function topZones(hour: number, dow: number, n = 5) {
  return zones
    .map((z) => ({ zone: z, demand: predictDemand(z.id, hour, dow) }))
    .sort((a, b) => b.demand - a.demand)
    .slice(0, n);
}
