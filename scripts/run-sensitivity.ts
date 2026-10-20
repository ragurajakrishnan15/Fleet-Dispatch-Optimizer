// Sensitivity analysis for the A/B simulation. Writes lib/data/sensitivity.json
// Run: npm run sensitivity
import { writeFileSync } from "node:fs";
import { runSimulation, type SimOptions } from "../lib/simulation.ts";
import { column, pairedTTest } from "../lib/ab-stats.ts";

function summarise(opts: SimOptions) {
  const r = runSimulation(opts);
  const c = r.days.map((d) => d.control);
  const t = r.days.map((d) => d.treatment);
  const rev = pairedTTest(column(c, "revenuePerVehicleHr"), column(t, "revenuePerVehicleHr"));
  const eta = pairedTTest(column(c, "pickupEtaMin"), column(t, "pickupEtaMin"));
  const util = pairedTTest(column(c, "utilizationPct"), column(t, "utilizationPct"));
  return {
    revLift: rev.lift,
    revCi: rev.liftCi95,
    revP: rev.pValue,
    etaLift: eta.lift,
    etaCi: eta.liftCi95,
    etaP: eta.pValue,
    utilLift: util.lift,
  };
}
const strip = <T extends Record<string, unknown>>(o: T) => JSON.parse(JSON.stringify(o)) as T;

const waitCost = [0, 0.1, 0.25, 0.5, 1, 2].map((w) => ({ waitCostPerMin: w, ...strip(summarise({ waitCostPerMin: w })) }));

const grid: Record<string, unknown>[] = [];
for (const clustering of [0, 1, 2, 3]) {
  for (const demandMultiplier of [0.6, 1, 1.4]) {
    grid.push({ clustering, demandMultiplier, ...strip(summarise({ clustering, demandMultiplier })) });
    console.log("done", clustering, demandMultiplier);
  }
}
writeFileSync("lib/data/sensitivity.json", JSON.stringify({ waitCost, grid }));
console.log(JSON.stringify({ waitCost, grid }, null, 1).slice(0, 1500));
