"use client";

import { zoneById } from "@/lib/demand-model";
import type { Assignment, Vehicle } from "@/lib/types";
import { useMap } from "./Map";

type LL = [number, number];

/** Quadratic bezier between two lat/lng points, bowed perpendicular to the chord. */
export function arcPoint(a: LL, b: LL, t: number): LL {
  const mid: LL = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dLat = b[0] - a[0];
  const dLng = b[1] - a[1];
  const bow = 0.18;
  const ctrl: LL = [mid[0] + dLng * bow, mid[1] - dLat * bow];
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1]];
}

export const STAGGER = 0.5; // fraction of total time spent staggering departures
const travelFraction = 1 - STAGGER;

/** Per-vehicle progress in [0,1] given global progress in [0,1]. */
export function vehicleProgress(index: number, count: number, global: number) {
  const start = (index / Math.max(1, count)) * STAGGER;
  return Math.min(1, Math.max(0, (global - start) / travelFraction));
}

/** Deterministic spot inside a zone for the k-th arriving vehicle. */
export function parkingSpot(zoneId: string, k: number): LL {
  const z = zoneById[zoneId];
  const angle = k * 2.399963; // golden angle
  const rad = (z.radius_km / 111) * 0.6 * Math.sqrt(Math.min(1, (k + 0.5) / 12));
  return [z.lat + rad * Math.sin(angle), z.lng + (rad * Math.cos(angle)) / Math.cos((z.lat * Math.PI) / 180)];
}

export function destinations(assignments: Assignment[]): Map<string, LL> {
  const seen = new Map<string, number>();
  const out = new Map<string, LL>();
  for (const a of assignments) {
    const k = seen.get(a.zoneId) ?? 0;
    seen.set(a.zoneId, k + 1);
    out.set(a.vehicleId, parkingSpot(a.zoneId, k));
  }
  return out;
}

export default function DispatchAnimator({
  vehicles,
  assignments,
  progress,
  dests,
}: {
  vehicles: Vehicle[];
  assignments: Assignment[];
  progress: number;
  dests: Map<string, LL>;
}) {
  const { project, inView } = useMap();
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const N = assignments.length;

  return (
    <g pointerEvents="none">
      {assignments.map((a, i) => {
        const v = byId.get(a.vehicleId)!;
        const to = dests.get(a.vehicleId)!;
        const p = vehicleProgress(i, N, progress);
        if (p <= 0) return null;
        if (!inView(v.lat, v.lng, 30) && !inView(to[0], to[1], 30)) return null;
        const from: LL = [v.lat, v.lng];
        const pts = Array.from({ length: 21 }, (_, k) => project(...arcPoint(from, to, (k / 20) * p)));
        const d = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const [hx, hy] = pts[pts.length - 1];
        return (
          <g key={a.vehicleId}>
            <path d={d} fill="none" stroke="var(--accent-2)" strokeWidth={1.1} opacity={p >= 1 ? 0.28 : 0.7} />
            <circle cx={hx} cy={hy} r={3.4} fill="var(--accent-2)" stroke="var(--bg)" strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}
