# Fleet Dispatch Optimizer — Full Build Spec

## What This Is
An interactive web app demonstrating autonomous vehicle fleet dispatch optimization for a marketplace logistics role. A recruiter clicks a Vercel link and experiences a working optimization tool — demand prediction, vehicle dispatch, A/B experiments, fleet metrics — all running live in the browser.

## Tech Stack
- **Framework:** Next.js 14 (App Router) + TypeScript
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Map:** Deck.gl with Mapbox GL JS (free tier, or use open-source map tiles from MapTiler/Carto)
- **Optimization:** Hungarian algorithm / greedy assignment solver in TypeScript (client-side)
- **Deploy:** Vercel

## Project Structure

```
fleet-dispatch-optimizer/
├── app/
│   ├── layout.tsx                    # Root layout with Navbar, dark/light theme
│   ├── page.tsx                      # Landing hero page
│   ├── demand/
│   │   └── page.tsx                  # Demand heatmap with time slider
│   ├── optimizer/
│   │   └── page.tsx                  # Live dispatch solver visualization
│   ├── experiment/
│   │   └── page.tsx                  # A/B test results dashboard
│   └── metrics/
│       └── page.tsx                  # Fleet KPI dashboard
├── components/
│   ├── Navbar.tsx                    # Top nav with links to all 4 sections
│   ├── Map.tsx                       # Deck.gl or Mapbox zone map component
│   ├── HeatmapLayer.tsx              # Demand color overlay on map zones
│   ├── VehicleMarkers.tsx            # Animated vehicle dots on map
│   ├── DispatchAnimator.tsx          # Animated arcs showing solver assignments
│   ├── StatTile.tsx                  # KPI card: value + delta + sparkline
│   ├── ExperimentChart.tsx           # Confidence interval + lift visualization
│   ├── TimeSlider.tsx                # Hour-of-day scrubber (0-23)
│   ├── UtilizationChart.tsx          # Line chart for fleet utilization over time
│   └── RevenueChart.tsx              # Bar chart for revenue per vehicle per zone
├── lib/
│   ├── solver.ts                     # Core optimization algorithm
│   ├── demand-model.ts               # Pre-trained demand prediction
│   ├── vehicle-value.ts              # Revenue prediction per vehicle/zone
│   ├── simulation.ts                 # Run dispatch strategies on historical data
│   ├── ab-stats.ts                   # Statistical testing utilities
│   ├── types.ts                      # TypeScript interfaces
│   └── data/
│       ├── zones.json                # Zone definitions
│       ├── synthetic-rides.json      # Pre-generated ride data
│       └── model-weights.json        # Pre-computed ML model coefficients
├── public/
│   └── og-image.png
├── tailwind.config.ts
├── next.config.js
├── package.json
├── tsconfig.json
└── README.md
```

## Page-by-Page Build Instructions

---

### Page 1: Landing (`app/page.tsx`)

**Purpose:** First impression. Recruiter lands here, understands what they're looking at in 5 seconds.

**Content:**
- Hero section with title: "Fleet Dispatch Optimizer"
- Subtitle: "Autonomous Vehicle Marketplace Logistics — Optimization, ML Demand Forecasting & Experimentation"
- Brief description (2-3 lines): "An interactive demonstration of fleet dispatch optimization for ride-hail marketplaces. Explore demand prediction, vehicle assignment optimization using constraint-based solvers, A/B experiment analysis, and real-time fleet utilization metrics."
- 4 clickable cards linking to each section:
  1. Demand Heatmap — "ML-powered demand forecasting by zone and hour"
  2. Dispatch Optimizer — "Constraint-based vehicle-to-zone assignment"
  3. A/B Experiments — "Statistical evaluation of dispatch strategies"
  4. Fleet Metrics — "Real-time KPIs and utilization tracking"
- Footer: "Built by Raguraja Krishnan" with GitHub link

**Design:**
- Clean, professional, dark-themed dashboard aesthetic
- No flashy animations on landing — let the content speak
- Cards should have subtle hover states

---

### Page 2: Demand Heatmap (`app/demand/page.tsx`)

**Purpose:** Show ML-based demand prediction across geographic zones.

**What it demonstrates:** Feature engineering, time-series prediction, spatial data visualization

**Components needed:**
- Map showing ~20 zones in the San Francisco / Mountain View area
- Each zone colored by predicted demand intensity (sequential blue palette, light = low, dark = high)
- Time slider (0-23 hours) — scrubbing changes the heatmap
- Side panel showing:
  - Top 5 highest-demand zones for selected hour
  - Demand prediction model info: "Gradient Boosted Trees trained on 500K synthetic rides"
  - Feature list: hour_of_day, day_of_week, zone_id, avg_trip_distance, historical_demand_lag_1h

**Data generation (`lib/demand-model.ts`):**
Create realistic demand patterns:
- Morning rush (7-9am): high demand in residential zones, flowing toward downtown/tech campuses
- Midday (11am-1pm): moderate, spread across commercial zones
- Evening rush (5-7pm): reverse of morning — downtown → residential
- Late night (10pm-1am): entertainment districts spike
- Weekend shift: later morning peak, more entertainment/shopping zones

Use pre-computed coefficients (store in `model-weights.json`):
```typescript
// Simplified: demand = base_rate[zone] * time_multiplier[hour] * day_factor[dow] + noise
interface DemandModel {
  zoneBaseRates: Record<string, number>;       // base demand per zone
  hourMultipliers: number[];                    // 24 values, peaks at rush hours
  dowFactors: number[];                         // 7 values, weekday vs weekend
}
```

**Zone data (`lib/data/zones.json`):**
~20 zones covering SF/Mountain View grid:
```typescript
interface Zone {
  id: string;
  name: string;           // e.g. "Downtown SF", "SFO Airport", "Mountain View - Castro St"
  lat: number;
  lng: number;
  radius_km: number;
  type: "residential" | "commercial" | "airport" | "entertainment" | "tech_campus";
}
```

If Mapbox API key is not available, fall back to a stylized SVG grid map — still effective for the demo.

---

### Page 3: Dispatch Optimizer (`app/optimizer/page.tsx`)

**Purpose:** The centerpiece. Recruiter clicks "Run Optimizer" and watches vehicles get assigned to zones.

**What it demonstrates:** Optimization modeling (CP-SAT equivalent), production pipeline thinking, objective function design

**Layout:**
- Left: Map showing vehicle positions (dots) and zone demand (background color)
- Right: Controls panel
  - "Number of idle vehicles" slider (10-100, default 50)
  - "Time horizon" dropdown (next 1hr, 2hr, 4hr)
  - **"Run Optimizer" button** — the main CTA
  - Strategy toggle: "Naive (nearest zone)" vs "Optimized (max expected value)"
- Bottom: Before/After metrics comparison

**Solver logic (`lib/solver.ts`):**

Implement a Hungarian-algorithm-style assignment or a greedy solver:

```typescript
interface Vehicle {
  id: string;
  lat: number;
  lng: number;
  status: "idle" | "assigned" | "en_route" | "occupied";
}

interface Assignment {
  vehicleId: string;
  zoneId: string;
  expectedValue: number;      // predicted_demand × avg_fare - travel_cost
  travelTimeMinutes: number;
}

// Objective: maximize total expected value across all assignments
// Constraints:
//   - Each vehicle assigned to exactly one zone
//   - Zone capacity: max N vehicles per zone (proportional to demand)
//   - Travel time ≤ horizon threshold

function optimizeDispatch(
  vehicles: Vehicle[],
  zones: Zone[],
  demandPredictions: Map<string, number>,
  horizon: number
): Assignment[]
```

**Naive strategy:** Assign each vehicle to its nearest zone with unmet demand.

**Optimized strategy:** Maximize Σ(expected_value) subject to capacity and travel constraints.

**Animation:** After clicking "Run Optimizer":
1. Show vehicles in idle positions (scattered dots)
2. Animate arcs/lines from each vehicle to its assigned zone (staggered, ~2 seconds total)
3. Show result metrics:
   - Total expected revenue: $X,XXX
   - Avg pickup ETA: X.X min
   - Fleet utilization: XX%
   - Improvement vs naive: +XX%

---

### Page 4: A/B Experiment (`app/experiment/page.tsx`)

**Purpose:** Show statistical rigor in evaluating dispatch strategies.

**What it demonstrates:** Experiment design, online evaluation, A/B testing, marketplace experimentation

**Layout:**
- Header: "Dispatch Strategy A/B Test — 30-Day Simulation"
- Two strategy cards side by side:
  - **Control (Naive Dispatch):** Nearest-zone assignment
  - **Treatment (Optimized Dispatch):** Value-maximizing solver
- Metrics comparison table:

| Metric | Control | Treatment | Lift | p-value |
|--------|---------|-----------|------|---------|
| Revenue/vehicle/hr | $18.42 | $22.67 | +23.1% | 0.001 |
| Avg pickup ETA (min) | 6.8 | 4.2 | -38.2% | <0.001 |
| Fleet utilization % | 61.3% | 78.9% | +28.7% | <0.001 |
| Rides completed/day | 1,247 | 1,534 | +23.0% | 0.003 |

- Confidence interval chart: horizontal bars showing 95% CI for each metric's lift
- Cumulative metric chart: line chart showing revenue/vehicle/hr diverging over the 30-day test period
- Sample size & power note: "N = 30 days × 200 vehicles, power = 0.95, α = 0.05"

**Stats logic (`lib/ab-stats.ts`):**
```typescript
function welchTTest(control: number[], treatment: number[]): {
  tStat: number;
  pValue: number;
  ci95: [number, number];
  lift: number;
}

function generateExperimentData(days: number, vehiclesPerDay: number): {
  control: DailyMetrics[];
  treatment: DailyMetrics[];
}
```

Generate synthetic data where treatment consistently outperforms by realistic margins (15-30% on revenue, significant reduction in ETA).

---

### Page 5: Fleet Metrics (`app/metrics/page.tsx`)

**Purpose:** Executive dashboard view of fleet performance.

**What it demonstrates:** Translating optimization results into business insights, KPI design

**Layout:**
- Top row: 4 stat tiles
  1. **Fleet Utilization:** 78.9% (↑ 12.3% vs last week) with sparkline
  2. **Avg Pickup ETA:** 4.2 min (↓ 1.8 min) with sparkline
  3. **Revenue/Vehicle/Hr:** $22.67 (↑ $3.41) with sparkline
  4. **Active Vehicles:** 187/200 (93.5% online)
- Middle: Utilization over 24 hours (line chart, x = hour, y = utilization %)
  - Shows clear peaks during rush hours, dip overnight
- Bottom left: Revenue per zone (horizontal bar chart, top 10 zones)
- Bottom right: Demand vs supply gap by hour (area chart — demand line vs fulfilled line, gap shaded)

---

## Shared Components

### StatTile (`components/StatTile.tsx`)
```typescript
interface StatTileProps {
  label: string;
  value: string;
  delta?: string;             // "+12.3%" or "-1.8 min"
  deltaDirection?: "up" | "down";
  deltaIsGood?: boolean;      // green if good, red if bad
  sparklineData?: number[];   // 12-point array
}
```

### Navbar (`components/Navbar.tsx`)
- Logo/title: "Fleet Dispatch Optimizer"
- Links: Demand | Optimizer | Experiments | Metrics
- Active page highlighted
- Responsive — hamburger on mobile

---

## Data & Model Details

### Zones — San Francisco / Mountain View Grid
Use real lat/lng coordinates for ~20 zones:
- Downtown SF (37.7749, -122.4194)
- SFO Airport (37.6213, -122.3790)
- Mission District (37.7599, -122.4148)
- SOMA (37.7785, -122.3950)
- Financial District (37.7946, -122.3999)
- Castro (37.7609, -122.4350)
- Sunset District (37.7531, -122.4946)
- Richmond District (37.7799, -122.4782)
- Marina (37.8015, -122.4368)
- North Beach (37.8060, -122.4103)
- Mountain View - Castro St (37.3861, -122.0839)
- Mountain View - Google Campus (37.4220, -122.0841)
- Palo Alto - University Ave (37.4419, -122.1430)
- Sunnyvale (37.3688, -122.0363)
- San Mateo (37.5630, -122.3255)
- Daly City (37.6879, -122.4702)
- South SF (37.6547, -122.4077)
- Redwood City (37.4852, -122.2364)
- Fremont (37.5485, -121.9886)
- San Jose - Downtown (37.3382, -121.8863)

### Synthetic Ride Data
Pre-generate ~1000 rides in `synthetic-rides.json`:
```typescript
interface Ride {
  id: string;
  timestamp: string;          // ISO datetime
  pickup_zone: string;
  dropoff_zone: string;
  fare: number;               // $5-$45
  pickup_wait_min: number;    // 2-15 min
  trip_duration_min: number;  // 5-40 min
  distance_km: number;
}
```

### Model Weights
Store pre-computed gradient boosting coefficients in `model-weights.json`:
```json
{
  "zone_base_rates": { "downtown_sf": 12.5, "sfo_airport": 8.2, ... },
  "hour_multipliers": [0.3, 0.2, 0.15, 0.1, 0.15, 0.4, 0.7, 1.2, 1.4, 1.1, 0.9, 1.0, 1.1, 1.0, 0.9, 0.95, 1.3, 1.5, 1.3, 1.0, 0.8, 0.7, 0.5, 0.4],
  "dow_factors": [0.8, 1.0, 1.0, 1.05, 1.1, 1.2, 0.9],
  "avg_fare_by_zone": { "downtown_sf": 18.50, "sfo_airport": 35.00, ... }
}
```

---

## Design Direction

- **Dark theme primary** (recruiter-friendly, dashboard aesthetic)
- Color palette: deep navy/charcoal background, electric blue accent for data, orange for secondary
- Clean sans-serif typography (Inter or system font)
- Minimal chrome — let the data and interactions be the focus
- Professional but not corporate — think modern data product, not enterprise SaaS
- Smooth transitions on data changes (chart animations, map transitions)
- Mobile responsive but optimize for desktop (recruiters will view on laptop)

---

## Deployment

1. Push to GitHub repo
2. Connect repo to Vercel
3. If using Mapbox: set `NEXT_PUBLIC_MAPBOX_TOKEN` in Vercel env vars
4. If no Mapbox key: use SVG-based map or deck.gl with Carto free tiles
5. Deploy: `vercel --prod`
6. Get URL like: `fleet-dispatch.vercel.app`

---

## What to Put on Resume

**Resume line** (updated to match what was actually built; live link https://fleet-dispatch-optimizer.vercel.app):
"Fleet Dispatch Optimizer — Built and deployed an end-to-end marketplace-logistics project (Python, SQL, TypeScript/Next.js): vehicle-to-zone dispatch formulated as an assignment problem and verified optimal with OR-Tools CP-SAT, a revenue-plus-rider-wait objective, a SQL-feature-pipeline gradient-boosted demand model (scikit-learn), and a 30-day simulated A/B test analyzed with paired t-tests and a 12-scenario sensitivity sweep (+3.5% revenue/vehicle-hr, -5% pickup ETA vs. a nearest-zone baseline). https://fleet-dispatch-optimizer.vercel.app"

**Be ready to say in interviews:**
- All results come from a simulation on synthetic data, not real operations.
- The gradient-boosted model roughly ties a seasonal-average baseline on this data (the data has no structure beyond the rate), so it demonstrates the pipeline and evaluation, not forecasting skill.
- The web app's map runs on a hand-specified rate model; the trained model is in python/.
- The production solver in the app is a hand-written Hungarian algorithm; CP-SAT is used to verify it. I have not used CPLEX or Gurobi.
- The travel-time limit is a soft constraint: in tight cases a vehicle can exceed it.
- I have not built an automated production pipeline with an engineering team; the scripts here are a research-style pipeline.
