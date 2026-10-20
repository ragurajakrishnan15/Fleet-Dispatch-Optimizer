import { zones } from "./demand-model";
import { createRng } from "./rng";
import type { Vehicle } from "./types";

/** >1 concentrates idle cars into the zones that were busiest in the previous window. */
export const FLEET_CLUSTERING = 2;

/**
 * Scatter idle vehicles around zone centres (seeded, so the demo is reproducible).
 * zoneWeights biases where cars sit, e.g. where the previous window left them.
 */
export function generateFleet(n: number, seed: number, zoneWeights?: Map<string, number>): Vehicle[] {
  const rng = createRng(seed);
  const total = zoneWeights ? zones.reduce((s, z) => s + (zoneWeights.get(z.id) ?? 0), 0) : 0;
  const pickZone = () => {
    if (!zoneWeights || total <= 0) return zones[Math.floor(rng.next() * zones.length)];
    let r = rng.next() * total;
    for (const z of zones) if ((r -= zoneWeights.get(z.id) ?? 0) <= 0) return z;
    return zones[zones.length - 1];
  };
  return Array.from({ length: n }, (_, i) => {
    const z = pickZone();
    const r = (z.radius_km / 111) * Math.sqrt(rng.next()) * 1.2;
    const t = rng.next() * 2 * Math.PI;
    return {
      id: `v${String(i + 1).padStart(3, "0")}`,
      lat: z.lat + r * Math.sin(t),
      lng: z.lng + (r * Math.cos(t)) / Math.cos((z.lat * Math.PI) / 180),
      status: "idle" as const,
    };
  });
}
