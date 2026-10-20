"use client";

import { useMap } from "./Map";

export interface MarkerPos {
  id: string;
  lat: number;
  lng: number;
}

export default function VehicleMarkers({ vehicles, color = "var(--accent-2)", r = 3.4 }: { vehicles: MarkerPos[]; color?: string; r?: number }) {
  const { project, inView } = useMap();
  return (
    <g>
      {vehicles.map((v) => {
        if (!inView(v.lat, v.lng, 4)) return null;
        const [x, y] = project(v.lat, v.lng);
        return <circle key={v.id} cx={x} cy={y} r={r} fill={color} stroke="var(--bg)" strokeWidth={1} />;
      })}
    </g>
  );
}
