/** Interpolates dim navy -> electric blue -> pale blue. t in [0,1]. Brighter = more demand (reads on dark map). */
const STOPS: [number, [number, number, number]][] = [
  [0, [30, 52, 98]],
  [0.5, [59, 130, 246]],
  [1, [191, 219, 254]],
];

export function demandColor(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (x <= t1) {
      const f = (x - t0) / (t1 - t0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(",")})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(",")})`;
}
