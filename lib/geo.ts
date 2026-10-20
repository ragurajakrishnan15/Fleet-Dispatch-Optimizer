const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

/** Road distance approximated as 1.3x straight line. */
export const roadKm = (a: [number, number], b: [number, number]) =>
  1.3 * haversineKm(a[0], a[1], b[0], b[1]);

export const AVG_SPEED_KPH = 32;
export const travelMinutes = (km: number) => (km / AVG_SPEED_KPH) * 60;
