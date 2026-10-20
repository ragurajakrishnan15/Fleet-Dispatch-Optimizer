// Exports real dispatch instances (cost matrices + the Hungarian optimum) so Python can solve the
// same problems with CP-SAT and cross-check the TypeScript solver. Writes python/data/instances.json
// Run: npm run export-instances
import { mkdirSync, writeFileSync } from "node:fs";
import { predictWindow, zones } from "../lib/demand-model.ts";
import { generateFleet } from "../lib/fleet.ts";
import { buildAssignmentProblem, hungarian } from "../lib/solver.ts";
import { WAIT_COST_PER_MIN } from "../lib/vehicle-value.ts";

const scenarios = [
  { hour: 8, horizon: 2, vehicles: 50, seed: 11 },
  { hour: 17, horizon: 2, vehicles: 80, seed: 3 },
  { hour: 21, horizon: 2, vehicles: 50, seed: 11 },
  { hour: 2, horizon: 1, vehicles: 30, seed: 7 },
  { hour: 12, horizon: 4, vehicles: 100, seed: 21 },
  { hour: 6, horizon: 4, vehicles: 20, seed: 5 },
];

const instances = scenarios.map((s) => {
  const demand = new Map(zones.map((z) => [z.id, predictWindow(z.id, s.hour, s.horizon, 3)]));
  const vehicles = generateFleet(s.vehicles, s.seed);
  const { slots, cost, feasible } = buildAssignmentProblem(vehicles, zones, demand, s.horizon, WAIT_COST_PER_MIN);
  const col = hungarian(cost);
  const hungarianCost = col.reduce((sum, j, i) => sum + cost[i][j], 0);
  return { ...s, waitCostPerMin: WAIT_COST_PER_MIN, slots, cost, feasible, hungarianCost };
});

mkdirSync("python/data", { recursive: true });
writeFileSync("python/data/instances.json", JSON.stringify(instances));
console.log(instances.map((i) => `${i.vehicles}v x ${i.slots.length} slots  hungarianCost=${i.hungarianCost.toFixed(4)}`).join("\n"));
