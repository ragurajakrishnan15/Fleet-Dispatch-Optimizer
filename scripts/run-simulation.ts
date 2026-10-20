// Runs the 30-day control/treatment simulation offline and writes lib/data/experiment-results.json
// Run: npm run simulate
import { writeFileSync } from "node:fs";
import { runSimulation } from "../lib/simulation.ts";

const t0 = Date.now();
const result = runSimulation(42);
writeFileSync("lib/data/experiment-results.json", JSON.stringify(result));

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
for (const k of ["revenuePerVehicleHr", "pickupEtaMin", "utilizationPct", "ridesCompleted"] as const) {
  const c = mean(result.days.map((d) => d.control[k]));
  const t = mean(result.days.map((d) => d.treatment[k]));
  console.log(k.padEnd(22), c.toFixed(2), t.toFixed(2), `${(((t - c) / c) * 100).toFixed(1)}%`);
}
console.log(`done in ${Date.now() - t0}ms`);
