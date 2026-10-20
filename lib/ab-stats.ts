import type { DailyMetrics } from "./types";

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
export const variance = (xs: number[]) => {
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
};

// ---- special functions -------------------------------------------------------------------------
function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const cj of c) ser += cj / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Continued fraction for the regularised incomplete beta (Numerical Recipes betacf). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function incBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** CDF of Student's t with `df` degrees of freedom. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const p = 0.5 * incBeta(df / 2, 0.5, x);
  return t > 0 ? 1 - p : p;
}

/** Two-sided p-value. */
export const tTwoSidedP = (t: number, df: number) => incBeta(df / 2, 0.5, df / (df + t * t));

/** Inverse t CDF by bisection (only needs the upper-tail critical value). */
export function tQuantile(p: number, df: number): number {
  let lo = -50;
  let hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp((-z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// ---- tests ------------------------------------------------------------------------------------
export interface TestResult {
  tStat: number;
  df: number;
  pValue: number;
  /** 95% CI for the absolute difference (treatment - control) */
  ci95: [number, number];
  /** relative lift of treatment over control, e.g. 0.034 = +3.4% */
  lift: number;
  /** 95% CI for the relative lift (CI of the difference scaled by control mean) */
  liftCi95: [number, number];
  diff: number;
}

/** Welch's unequal-variance t-test of treatment vs control (independent samples). */
export function welchTTest(control: number[], treatment: number[]): TestResult {
  const mc = mean(control);
  const mt = mean(treatment);
  const vc = variance(control) / control.length;
  const vt = variance(treatment) / treatment.length;
  const se = Math.sqrt(vc + vt);
  const df = (vc + vt) ** 2 / (vc ** 2 / (control.length - 1) + vt ** 2 / (treatment.length - 1));
  return summarise(mt - mc, se, df, mc);
}

/**
 * Paired t-test on per-day differences. Appropriate when both arms run concurrently so each
 * day contributes one (control, treatment) pair; day-of-week and demand shocks cancel in the difference.
 */
export function pairedTTest(control: number[], treatment: number[]): TestResult {
  const diffs = treatment.map((t, i) => t - control[i]);
  const se = Math.sqrt(variance(diffs) / diffs.length);
  return summarise(mean(diffs), se, diffs.length - 1, mean(control));
}

function summarise(diff: number, se: number, df: number, controlMean: number): TestResult {
  const tStat = diff / se;
  const crit = tQuantile(0.975, df);
  const ci95: [number, number] = [diff - crit * se, diff + crit * se];
  return {
    tStat,
    df,
    pValue: tTwoSidedP(tStat, df),
    ci95,
    diff,
    lift: diff / controlMean,
    liftCi95: [ci95[0] / controlMean, ci95[1] / controlMean],
  };
}

/** Power of a two-sided paired z/t approximation for a given standardised effect (d = mean diff / sd diff). */
export function pairedPower(effectD: number, n: number, alpha = 0.05): number {
  const zCrit = tQuantile(1 - alpha / 2, n - 1);
  const ncp = effectD * Math.sqrt(n);
  return 1 - normCdf(zCrit - ncp) + normCdf(-zCrit - ncp);
}

export const standardisedEffect = (control: number[], treatment: number[]) => {
  const diffs = treatment.map((t, i) => t - control[i]);
  return mean(diffs) / Math.sqrt(variance(diffs));
};

// ---- experiment data ----------------------------------------------------------------------------
export type MetricKey = keyof Omit<DailyMetrics, "day">;
export const column = (rows: DailyMetrics[], k: MetricKey) => rows.map((r) => r[k]);

export const formatP = (p: number) => (p < 0.001 ? "<0.001" : p.toFixed(3));
