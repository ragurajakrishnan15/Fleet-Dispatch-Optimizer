"""SQL feature pipeline and demand model sanity checks."""
import sqlite3

import numpy as np
import pandas as pd
import pytest

import demand_gbt as dg


@pytest.fixture(scope="module")
def pipeline():
    dg.build_database()
    return dg.load_features(), dg.run()


def test_lag_features_look_strictly_backwards(pipeline):
    """lag_1h at time t must equal the observed requests at t-1 for the same zone (no target leakage)."""
    df, _ = pipeline
    with sqlite3.connect(dg.DB) as con:
        raw = pd.read_sql_query("SELECT zone_id, ts, requests FROM hourly_demand", con)
    raw["ts"] = pd.to_datetime(raw["ts"])
    prev = raw.assign(ts=raw["ts"] + pd.Timedelta(hours=1)).rename(columns={"requests": "prev"})
    merged = df.merge(prev, on=["zone_id", "ts"], how="left")
    assert (merged["lag_1h"] == merged["prev"]).all()


def test_same_hour_of_week_mean_excludes_current_row(pipeline):
    df, _ = pipeline
    row = df.iloc[len(df) // 2]
    with sqlite3.connect(dg.DB) as con:
        hist = pd.read_sql_query(
            "SELECT requests FROM hourly_demand WHERE zone_id=? AND dow=? AND hour=? AND ts<?",
            con,
            params=(row["zone_id"], int(row["dow"]), int(row["hour"]), row["ts"].isoformat()),
        )
    assert row["how_mean"] == pytest.approx(hist["requests"].mean())


def test_train_test_split_is_chronological(pipeline):
    _, out = pipeline
    assert out["test_rows"] > 0 and out["train_rows"] > out["test_rows"]


def test_model_beats_trivial_baseline_and_respects_noise_floor(pipeline):
    _, out = pipeline
    m = out["metrics"]
    gbt, oracle = m["gradient_boosting"]["poisson_deviance"], m["oracle_true_rate"]["poisson_deviance"]
    assert gbt < m["global_mean"]["poisson_deviance"] / 5
    assert gbt >= oracle * 0.99, "cannot beat the true rate beyond sampling noise"
    assert gbt <= oracle * 1.25, "should land reasonably close to the achievable floor"


def test_poisson_deviance_zero_at_truth():
    y = np.array([0.0, 1.0, 5.0])
    assert dg.poisson_deviance(y, y) == pytest.approx(0.0, abs=1e-6)
