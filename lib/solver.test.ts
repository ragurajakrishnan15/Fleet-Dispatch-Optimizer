import { describe, expect, it } from "vitest";
import { hungarian, optimizeDispatch, evaluate, zoneCapacities } from "./solver";
import { generateFleet } from "./fleet";
import { predictWindow, zones, predictDemand } from "./demand-model";

const demandFor = (hour: number, dow: number, horizon: number) =>
  new Map(zones.map((z) => [z.id, predictWindow(z.id, hour, horizon, dow)]));

describe("hungarian", () => {
  it("finds the optimal assignment on a known matrix", () => {
    const c = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const col = hungarian(c);
    expect(col.reduce((s, j, i) => s + c[i][j], 0)).toBe(5);
  });
  it("handles more columns than rows", () => {
    expect(hungarian([[9, 1, 7, 8], [6, 5, 1, 9]])).toEqual([1, 2]);
  });
});

describe("dispatch", () => {
  const cases: [number, number, number][] = [
    [8, 2, 50],
    [18, 4, 100],
    [2, 1, 30],
  ];
  for (const [hour, horizon, n] of cases) {
    it(`pure-revenue objective >= naive revenue (hour ${hour}, ${horizon}h horizon, ${n} vehicles)`, () => {
      const vehicles = generateFleet(n, 7);
      const d = demandFor(hour, 2, horizon);
      const naive = evaluate(optimizeDispatch(vehicles, zones, d, horizon, "naive"), d, horizon);
      const opt = evaluate(optimizeDispatch(vehicles, zones, d, horizon, "optimized", 0), d, horizon);
      expect(opt.totalRevenue).toBeGreaterThanOrEqual(naive.totalRevenue - 1e-6);
    });
  }
  it("a rider-wait cost lowers pickup ETA relative to a pure-revenue objective", () => {
    const vehicles = generateFleet(50, 11);
    const d = demandFor(21, 3, 2);
    const pure = evaluate(optimizeDispatch(vehicles, zones, d, 2, "optimized", 0), d, 2);
    const wait = evaluate(optimizeDispatch(vehicles, zones, d, 2, "optimized", 0.5), d, 2);
    expect(wait.avgPickupEtaMin).toBeLessThanOrEqual(pure.avgPickupEtaMin + 1e-9);
  });
  it("assigns every vehicle once and respects zone capacity", () => {
    const vehicles = generateFleet(60, 3);
    const d = demandFor(8, 1, 2);
    const a = optimizeDispatch(vehicles, zones, d, 2, "optimized");
    expect(new Set(a.map((x) => x.vehicleId)).size).toBe(60);
    const cap = zoneCapacities(d, zones, 2, 60);
    const counts = new Map<string, number>();
    a.forEach((x) => counts.set(x.zoneId, (counts.get(x.zoneId) ?? 0) + 1));
    for (const [z, c] of counts) expect(c).toBeLessThanOrEqual(cap.get(z)!);
  });
});

describe("demand model", () => {
  it("has a morning residential peak and a late-night entertainment peak", () => {
    expect(predictDemand("sunset", 8, 2)).toBeGreaterThan(predictDemand("sunset", 3, 2) * 4);
    expect(predictDemand("mission", 23, 5)).toBeGreaterThan(predictDemand("mission", 10, 5));
  });
  it("evening tech-campus demand exceeds morning (reverse flow)", () => {
    expect(predictDemand("mv_google", 17, 2)).toBeGreaterThan(predictDemand("mv_google", 8, 2));
  });
});
