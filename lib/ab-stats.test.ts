import { describe, expect, it } from "vitest";
import { pairedTTest, tCdf, tQuantile, welchTTest } from "./ab-stats";

describe("t distribution", () => {
  it("matches reference values", () => {
    expect(tCdf(0, 10)).toBeCloseTo(0.5, 10);
    expect(tCdf(2.228, 10)).toBeCloseTo(0.975, 3); // t_{0.975,10}
    expect(tQuantile(0.975, 29)).toBeCloseTo(2.045, 3);
  });
});

describe("tests", () => {
  it("Welch matches a hand-computed example", () => {
    // reference computed with scipy.stats.ttest_ind(equal_var=False)
    const a = [27.5, 21, 19, 23.6, 17, 17.9, 16.9, 20.1, 21.9, 22.6, 23.1, 19.6, 19, 21.7, 21.4];
    const b = [27.1, 22, 20.8, 23.4, 23.4, 23.5, 25.8, 22, 24.8, 20.2, 21.9, 22.1, 22.9, 23.4, 22.5];
    const r = welchTTest(a, b);
    expect(r.tStat).toBeCloseTo(2.59385, 4);
    expect(r.df).toBeCloseTo(23.8863, 3);
    expect(r.pValue).toBeCloseTo(0.0159577, 6);
  });
  it("paired test detects a small consistent shift hidden by large shared variance", () => {
    const base = Array.from({ length: 30 }, (_, i) => 100 + 20 * Math.sin(i));
    const treat = base.map((x, i) => x + 3 + (i % 3 === 0 ? 0.5 : -0.2));
    expect(welchTTest(base, treat).pValue).toBeCloseTo(0.409781, 5); // scipy ttest_ind(equal_var=False)
    expect(pairedTTest(base, treat).pValue).toBeLessThan(0.001);
  });
});
