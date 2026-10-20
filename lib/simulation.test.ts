import { describe, expect, it } from "vitest";
import { runSimulation } from "./simulation";
import { mean } from "./ab-stats";

describe("simulation", () => {
  const a = runSimulation({ seed: 5, days: 3 });

  it("is deterministic for a given seed", () => {
    expect(runSimulation({ seed: 5, days: 3 })).toEqual(a);
  });

  it("differs across seeds", () => {
    expect(runSimulation({ seed: 6, days: 3 }).days[0].treatment.ridesCompleted).not.toBe(a.days[0].treatment.ridesCompleted);
  });

  it("never serves more rides than were requested, and hourly utilisation stays <= 100%", () => {
    for (const h of a.hourly) {
      expect(h.fulfilledControl).toBeLessThanOrEqual(h.demand + 1e-9);
      expect(h.fulfilledTreatment).toBeLessThanOrEqual(h.demand + 1e-9);
      expect(h.utilControl).toBeLessThanOrEqual(100 + 1e-9);
      expect(h.utilTreatment).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it("both arms face identical demand: raising demand raises rides served for both", () => {
    const hi = runSimulation({ seed: 5, days: 3, demandMultiplier: 1.4 });
    expect(mean(hi.days.map((d) => d.control.ridesCompleted))).toBeGreaterThan(mean(a.days.map((d) => d.control.ridesCompleted)));
    expect(mean(hi.days.map((d) => d.treatment.ridesCompleted))).toBeGreaterThan(mean(a.days.map((d) => d.treatment.ridesCompleted)));
  });

  it("optimizer earns more per vehicle-hour than naive on average", () => {
    const c = mean(a.days.map((d) => d.control.revenuePerVehicleHr));
    const t = mean(a.days.map((d) => d.treatment.revenuePerVehicleHr));
    expect(t).toBeGreaterThan(c);
  });
});
