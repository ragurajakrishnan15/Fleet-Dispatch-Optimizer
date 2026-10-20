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
- **Demand model** (`lib/demand-model.ts`): `base_rate[zone] × hour_curve[zone_type, weekday|weekend][hour] × dow_factor × market_scale`. This is the transparent rate model that drives the web app (hand-specified curves). The 1,000 sample rides are drawn from it (`scripts/generate-data.ts`). A separate trained model lives in `python/` (below).
- **Solver** (`lib/solver.ts`): each zone is expanded into capacity slots with diminishing marginal value; the vehicle × slot assignment is solved exactly with the Hungarian algorithm, under a travel-time limit. The objective is fare revenue minus deadhead cost plus a cost per rider-minute of waiting ($0.50 by default): a pure-revenue objective sends cars to high-fare zones and slightly worsens pickup ETA, and the wait term fixes that. The baseline sends each car to its nearest zone with unmet demand.
- **Simulation** (`lib/simulation.ts`, `scripts/run-simulation.ts`): 30 days × 200 vehicles × six 4-hour dispatch windows, both policies facing identical realised (Poisson) demand. Idle cars start where the previous window's demand was (`FLEET_CLUSTERING`), so positioning lags demand. Output is stored in `lib/data/experiment-results.json`.
- **Stats** (`lib/ab-stats.ts`): Welch and paired t-tests, t-distribution CDF from the incomplete beta function (validated against SciPy in the tests), CIs, minimum detectable effect.

Headline result: about +3.5% revenue per vehicle-hour and −5% pickup ETA over the naive baseline (paired test, p < 0.001). `scripts/run-sensitivity.ts` re-runs the experiment across 12 scenarios (car positioning × demand level): the optimizer wins in all of them, with revenue lifts of +1% to +9%. These are simulation outcomes that depend on the model's assumptions, not real-world measurements.

## Python: CP-SAT verification and a trained demand model (`python/`)
- **CP-SAT cross-check** (`python/cpsat_dispatch.py`): `npm run export-instances` writes six real dispatch problems from the TypeScript code; OR-Tools CP-SAT models each as an integer program (one slot per vehicle, one vehicle per slot) and proves the optimum. It matches the TypeScript Hungarian solver to within rounding on all six (e.g. 100 vehicles x 249 slots: -19148.283 vs -19148.282). It also confirms that the travel-time limit is a *soft* wall: in tight cases a vehicle can exceed it (the app reports how many).
- **SQL + gradient boosting** (`python/demand_gbt.py`): 12 weeks of synthetic hourly requests per zone go into SQLite; a SQL window-function query builds leak-free features (lags, rolling mean, same-hour-of-week history); scikit-learn's `HistGradientBoostingRegressor` (Poisson loss) is trained on the first 10 weeks and scored on the last 14 days. Result on this synthetic data: Poisson deviance 1.113 vs 1.121 for a seasonal-average baseline (essentially a tie) vs 1.010 for the true rate (noise floor). The data contain no structure beyond the rate, so this demonstrates the pipeline and evaluation discipline, not real forecasting skill.
- **Tests** (`python/tests`, 12 tests): CP-SAT agrees with Hungarian on every instance, lag features never see the target hour, and the model sits between the trivial baseline and the noise floor.

```bash
cd python && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # (bin/pip on macOS/Linux)
npm run export-instances            # from the repo root; writes python/data/instances.json
python cpsat_dispatch.py            # comparison table
python demand_gbt.py                # builds SQLite, trains, writes lib/data/gbt-metrics.json
python -m pytest -q
```

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
