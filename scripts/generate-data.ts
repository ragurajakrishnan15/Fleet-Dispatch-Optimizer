// Generates lib/data/model-weights.json and lib/data/synthetic-rides.json.
// Run: npm run generate-data   (Node >= 22 strips types natively)
import { readFileSync, writeFileSync } from "node:fs";
import { createRng } from "../lib/rng.ts";
import { roadKm, travelMinutes } from "../lib/geo.ts";

type Peak = [hour: number, height: number, width: number];
const zones: { id: string; type: string; lat: number; lng: number }[] = JSON.parse(
  readFileSync("lib/data/zones.json", "utf8"),
);

/** Sum of circular gaussians over a 24h clock plus a floor. */
const curve = (floor: number, peaks: Peak[], scale = 1) =>
  Array.from({ length: 24 }, (_, h) => {
    let v = floor;
    for (const [c, ht, w] of peaks) {
      const d = Math.min(Math.abs(h - c), 24 - Math.abs(h - c));
      v += ht * Math.exp(-(d * d) / (2 * w * w));
    }
    return +(v * scale).toFixed(3);
  });

const hour_multipliers = {
  // residential: strong AM outbound peak, softer evening return
  residential: {
    weekday: curve(0.12, [[8, 1.4, 1.3], [18.5, 0.8, 1.6], [22, 0.3, 2]]),
    weekend: curve(0.12, [[10.5, 0.9, 2], [19, 0.7, 2.5]]),
  },
  // commercial: lunch plus a big evening pickup as offices empty
  commercial: {
    weekday: curve(0.08, [[8.5, 0.6, 1.3], [12.5, 0.9, 1.5], [17.5, 1.4, 1.3]]),
    weekend: curve(0.1, [[13, 0.8, 2.5], [17, 0.7, 2.5]]),
  },
  tech_campus: {
    weekday: curve(0.05, [[8.5, 0.7, 1.2], [12, 0.8, 1.4], [17.5, 1.5, 1.2]]),
    weekend: curve(0.04, [[12, 0.35, 3]]),
  },
  entertainment: {
    weekday: curve(0.08, [[12.5, 0.4, 1.5], [21, 0.9, 2], [0.5, 1.0, 1.8]]),
    weekend: curve(0.1, [[14, 0.6, 2], [22, 1.4, 2], [1, 1.5, 2]]),
  },
  airport: {
    weekday: curve(0.3, [[6, 0.8, 1.5], [11, 0.6, 2], [16, 0.9, 2], [21, 0.7, 1.5]]),
    weekend: curve(0.3, [[8, 0.6, 2], [15, 0.7, 2.5], [20, 0.7, 2]]),
  },
};

const zone_base_rates: Record<string, number> = {
  downtown_sf: 14, sfo_airport: 9, mission: 11, soma: 12, fidi: 13, castro: 7,
  sunset: 6, richmond: 6, marina: 8, north_beach: 9, mv_castro: 5, mv_google: 8,
  palo_alto: 6, sunnyvale: 5, san_mateo: 5, daly_city: 4, south_sf: 3.5,
  redwood_city: 4, fremont: 3.5, san_jose: 7,
};
const avg_fare_by_zone: Record<string, number> = {
  downtown_sf: 18.5, sfo_airport: 35, mission: 16, soma: 17.5, fidi: 18, castro: 15.5,
  sunset: 19, richmond: 18, marina: 16.5, north_beach: 15, mv_castro: 17, mv_google: 18.5,
  palo_alto: 20, sunnyvale: 19, san_mateo: 24, daly_city: 21, south_sf: 23,
  redwood_city: 22, fremont: 26, san_jose: 25,
};
const dow_factors = [0.8, 1.0, 1.0, 1.05, 1.1, 1.2, 0.9]; // Sun..Sat

const market_scale = 5; // scales base rates so a 200-vehicle fleet is meaningfully utilised
const model = { market_scale, zone_base_rates, avg_fare_by_zone, hour_multipliers, dow_factors };
writeFileSync("lib/data/model-weights.json", JSON.stringify(model, null, 1));

// ---- synthetic rides: sample (zone, hour, dow) proportional to modelled demand
const rng = createRng(20260101);
const rate = (z: (typeof zones)[number], h: number, dow: number) => {
  const wk = dow === 0 || dow === 6 ? "weekend" : "weekday";
  return zone_base_rates[z.id] * (hour_multipliers as Record<string, Record<string, number[]>>)[z.type][wk][h] * dow_factors[dow];
};
const cells: { z: (typeof zones)[number]; h: number; dow: number; w: number }[] = [];
for (const z of zones) for (let dow = 0; dow < 7; dow++) for (let h = 0; h < 24; h++)
  cells.push({ z, h, dow, w: rate(z, h, dow) });
const total = cells.reduce((s, c) => s + c.w, 0);
const pick = <T extends { w: number }>(items: T[], sum: number) => {
  let r = rng.next() * sum;
  for (const it of items) if ((r -= it.w) <= 0) return it;
  return items[items.length - 1];
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const rides = Array.from({ length: 1000 }, (_, i) => {
  const c = pick(cells, total);
  // dropoff: gravity pull toward busy, nearby-ish zones
  const dests = zones.filter((z) => z.id !== c.z.id).map((z) => {
    const km = roadKm([c.z.lat, c.z.lng], [z.lat, z.lng]);
    return { z, km, w: zone_base_rates[z.id] / (1 + km / 8) };
  });
  const d = pick(dests, dests.reduce((s, x) => s + x.w, 0));
  const km = +clamp(d.km + rng.normal() * 0.8, 1.2, 60).toFixed(1);
  const fare = +clamp(4 + 1.15 * km + rng.normal() * 2, 5, 45).toFixed(2);
  const dur = Math.round(clamp(travelMinutes(km) + 4 + rng.normal() * 3, 5, 40));
  // 2025-01-05 is a Sunday, so dow offsets line up
  const date = new Date(Date.UTC(2025, 0, 5 + c.dow, c.h, Math.floor(rng.next() * 60)));
  return {
    id: `r${String(i + 1).padStart(4, "0")}`,
    timestamp: date.toISOString(),
    pickup_zone: c.z.id,
    dropoff_zone: d.z.id,
    fare,
    pickup_wait_min: Math.round(clamp(6 + rng.normal() * 3, 2, 15)),
    trip_duration_min: dur,
    distance_km: km,
  };
});
rides.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
writeFileSync("lib/data/synthetic-rides.json", JSON.stringify(rides));
console.log(`wrote model-weights.json and ${rides.length} rides`);
