# Fleet Dispatch Optimizer

**Live demo: https://fleet-dispatch-optimizer.vercel.app**

Interactive demo of autonomous-vehicle fleet dispatch for a ride-hail marketplace: demand forecasting, exact assignment optimization, A/B experiment analysis and fleet KPIs. Everything runs client-side on **synthetic data**.

## Pages
| Route | What it shows |
|---|---|
| `/demand` | Per-zone demand by hour and day of week on a zone map |
| `/optimizer` | Naive vs optimized dispatch of idle vehicles, animated, with before/after metrics |
| `/experiment` | 30-day simulated A/B test, paired vs Welch analysis, confidence intervals |
| `/metrics` | KPI tiles, utilization by hour, revenue by zone, demand vs fulfilled |

## How it works
- **Demand model** (`lib/demand-model.ts`): `base_rate[zone] × hour_curve[zone_type, weekday|weekend][hour] × dow_factor × market_scale`. This is a transparent rate model with hand-specified curves, not a trained ML model. The 1,000 sample rides are drawn from it (`scripts/generate-data.ts`).
- **Solver** (`lib/solver.ts`): each zone is expanded into capacity slots with diminishing marginal value; the vehicle × slot assignment is solved exactly with the Hungarian algorithm, under a travel-time limit. The objective is fare revenue minus deadhead cost plus a cost per rider-minute of waiting ($0.50 by default): a pure-revenue objective sends cars to high-fare zones and slightly worsens pickup ETA, and the wait term fixes that. The baseline sends each car to its nearest zone with unmet demand.
- **Simulation** (`lib/simulation.ts`, `scripts/run-simulation.ts`): 30 days × 200 vehicles × six 4-hour dispatch windows, both policies facing identical realised (Poisson) demand. Idle cars start where the previous window's demand was (`FLEET_CLUSTERING`), so positioning lags demand. Output is stored in `lib/data/experiment-results.json`.
- **Stats** (`lib/ab-stats.ts`): Welch and paired t-tests, t-distribution CDF from the incomplete beta function (validated against SciPy in the tests), CIs, minimum detectable effect.

Headline result: about +3.5% revenue per vehicle-hour and −5% pickup ETA over the naive baseline (paired test, p < 0.001). `scripts/run-sensitivity.ts` re-runs the experiment across 12 scenarios (car positioning × demand level): the optimizer wins in all of them, with revenue lifts of +1% to +9%. These are simulation outcomes that depend on the model's assumptions, not real-world measurements.

## Develop
```bash
npm install
npm run dev
npm test               # solver, demand model, statistics
npm run generate-data  # regenerate model weights + synthetic rides
npm run simulate       # regenerate the 30-day experiment results
npm run sensitivity    # regenerate the sensitivity sweep (~1 min)
```
Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4, Recharts. The map is hand-rolled SVG with a stylised coastline, so no API keys are needed.

## Deploy
Deployed on Vercel (no environment variables required). Deploy with `npx vercel --prod`, or import the repo at vercel.com/new.
