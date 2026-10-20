"""Demand forecasting pipeline: synthetic hourly data -> SQLite -> SQL feature table -> gradient-boosted model.

Data are *synthetic*: hourly request counts per zone are Poisson draws around the rate model that also powers the
web app (lib/demand-model.ts), over 12 weeks. That means the true rate is known, so the pipeline reports an
"oracle" (the true rate) alongside the learned model: the gap to the oracle shows how much of the achievable
accuracy the model captures, and the oracle's own error is the irreducible Poisson noise floor.

Run:  python demand_gbt.py     (writes data/demand.sqlite, data/gbt_metrics.json and ../lib/data/gbt-metrics.json)
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
LIB_DATA = ROOT.parent / "lib" / "data"
DB = DATA / "demand.sqlite"

WEEKS = 12
TEST_DAYS = 14
START = pd.Timestamp("2025-01-05")  # a Sunday, matching the web app's dow convention (0 = Sunday)

# SQL feature table. Every lag/rolling feature looks strictly backwards (ROWS ... PRECEDING / LAG), so the
# target hour is never visible to its own features.
FEATURE_SQL = """
SELECT
    d.zone_id,
    d.ts,
    d.hour,
    d.dow,
    CASE WHEN d.dow IN (0, 6) THEN 1 ELSE 0 END                                            AS is_weekend,
    z.type                                                                                  AS zone_type,
    LAG(d.requests, 1)   OVER w                                                             AS lag_1h,
    LAG(d.requests, 24)  OVER w                                                             AS lag_24h,
    LAG(d.requests, 168) OVER w                                                             AS lag_168h,
    AVG(d.requests)      OVER (PARTITION BY d.zone_id ORDER BY d.ts
                               ROWS BETWEEN 24 PRECEDING AND 1 PRECEDING)                   AS roll_mean_24h,
    -- same hour-of-week history, strictly before this row (expanding mean and last-4-weeks mean)
    AVG(d.requests)      OVER (PARTITION BY d.zone_id, d.dow, d.hour ORDER BY d.ts
                               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)            AS how_mean,
    AVG(d.requests)      OVER (PARTITION BY d.zone_id, d.dow, d.hour ORDER BY d.ts
                               ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING)                    AS how_mean_4w,
    d.true_rate,
    d.requests                                                                              AS y
FROM hourly_demand d
JOIN zones z ON z.id = d.zone_id
WINDOW w AS (PARTITION BY d.zone_id ORDER BY d.ts)
ORDER BY d.ts, d.zone_id
"""

FEATURES = ["hour", "dow", "is_weekend", "zone_cat", "lag_1h", "lag_24h", "lag_168h", "roll_mean_24h", "how_mean", "how_mean_4w"]


def true_rate(weights: dict, zone: dict, hour: int, dow: int) -> float:
    curve = weights["hour_multipliers"][zone["type"]]["weekend" if dow in (0, 6) else "weekday"]
    return weights["zone_base_rates"][zone["id"]] * curve[hour] * weights["dow_factors"][dow] * weights["market_scale"]


def build_database(seed: int = 7) -> None:
    DATA.mkdir(exist_ok=True)
    zones = json.loads((LIB_DATA / "zones.json").read_text())
    weights = json.loads((LIB_DATA / "model-weights.json").read_text())
    rng = np.random.default_rng(seed)

    rows = []
    for ts in pd.date_range(START, periods=WEEKS * 7 * 24, freq="h"):
        dow = (ts.dayofweek + 1) % 7  # pandas Monday=0 -> Sunday=0
        for z in zones:
            lam = true_rate(weights, z, ts.hour, dow)
            rows.append((z["id"], ts.isoformat(), ts.hour, dow, int(rng.poisson(lam)), lam))

    if DB.exists():
        DB.unlink()
    with sqlite3.connect(DB) as con:
        con.execute("CREATE TABLE zones (id TEXT PRIMARY KEY, name TEXT, type TEXT, lat REAL, lng REAL)")
        con.executemany("INSERT INTO zones VALUES (?,?,?,?,?)", [(z["id"], z["name"], z["type"], z["lat"], z["lng"]) for z in zones])
        con.execute(
            "CREATE TABLE hourly_demand (zone_id TEXT, ts TEXT, hour INT, dow INT, requests INT, true_rate REAL, "
            "PRIMARY KEY (zone_id, ts))"
        )
        con.executemany("INSERT INTO hourly_demand VALUES (?,?,?,?,?,?)", rows)


def load_features() -> pd.DataFrame:
    with sqlite3.connect(DB) as con:
        df = pd.read_sql_query(FEATURE_SQL, con)
    df["ts"] = pd.to_datetime(df["ts"])
    df["zone_cat"] = df["zone_id"].astype("category").cat.codes
    return df.dropna(subset=["lag_168h", "how_mean"]).reset_index(drop=True)  # need one full week of history


def poisson_deviance(y: np.ndarray, mu: np.ndarray) -> float:
    mu = np.clip(mu, 1e-9, None)
    term = np.where(y > 0, y * np.log(np.where(y > 0, y, 1) / mu), 0.0)
    return float(np.mean(2 * (term - (y - mu))))


def metrics(y: np.ndarray, pred: np.ndarray) -> dict:
    return {
        "mae": float(np.mean(np.abs(y - pred))),
        "rmse": float(np.sqrt(np.mean((y - pred) ** 2))),
        "poisson_deviance": poisson_deviance(y, pred),
    }


def run() -> dict:
    df = load_features()
    cutoff = df["ts"].max() - pd.Timedelta(days=TEST_DAYS)
    train, test = df[df["ts"] <= cutoff].copy(), df[df["ts"] > cutoff].copy()

    # Baseline: per-zone, per-hour-of-week mean of the training period (seasonal average).
    how = train.groupby(["zone_id", "dow", "hour"])["y"].mean().rename("seasonal")
    test = test.join(how, on=["zone_id", "dow", "hour"])

    model = HistGradientBoostingRegressor(
        loss="poisson",
        learning_rate=0.08,
        max_iter=400,
        max_leaf_nodes=31,
        l2_regularization=1.0,
        categorical_features=[FEATURES.index("zone_cat")],
        early_stopping=True,
        validation_fraction=0.1,
        random_state=0,
    )
    model.fit(train[FEATURES], train["y"])
    test["gbt"] = model.predict(test[FEATURES])

    y = test["y"].to_numpy(dtype=float)
    results = {
        "oracle_true_rate": metrics(y, test["true_rate"].to_numpy()),
        "gradient_boosting": metrics(y, test["gbt"].to_numpy()),
        "seasonal_average": metrics(y, test["seasonal"].to_numpy()),
        "global_mean": metrics(y, np.full_like(y, train["y"].mean())),
    }

    sample = test.sample(n=min(4000, len(test)), random_state=0)
    imp = permutation_importance(model, sample[FEATURES], sample["y"], n_repeats=5, random_state=0, scoring="neg_mean_poisson_deviance")
    importance = sorted(
        ({"feature": f, "importance": float(m)} for f, m in zip(FEATURES, imp.importances_mean)),
        key=lambda d: -d["importance"],
    )

    out = {
        "data": "synthetic hourly request counts, Poisson around the known rate model",
        "zones": int(df["zone_id"].nunique()),
        "weeks": WEEKS,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "test_days": TEST_DAYS,
        "model": "HistGradientBoostingRegressor(loss='poisson')",
        "features": FEATURES,
        "metrics": results,
        "permutation_importance": importance,
    }
    (DATA / "gbt_metrics.json").write_text(json.dumps(out, indent=1))
    (LIB_DATA / "gbt-metrics.json").write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    build_database()
    out = run()
    print(f"train {out['train_rows']:,} rows / test {out['test_rows']:,} rows ({out['test_days']} held-out days)")
    print(f"{'model':<20}{'MAE':>8}{'RMSE':>8}{'Poisson dev':>14}")
    for name, m in out["metrics"].items():
        print(f"{name:<20}{m['mae']:>8.3f}{m['rmse']:>8.3f}{m['poisson_deviance']:>14.4f}")
    print("top features:", ", ".join(f"{d['feature']} ({d['importance']:.3f})" for d in out["permutation_importance"][:4]))
