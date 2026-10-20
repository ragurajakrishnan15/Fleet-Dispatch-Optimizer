"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type MapView = "bay" | "sf";

const BOUNDS: Record<MapView, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  bay: { minLat: 37.28, maxLat: 37.84, minLng: -122.53, maxLng: -121.85 },
  sf: { minLat: 37.735, maxLat: 37.825, minLng: -122.52, maxLng: -122.37 },
};

/** Stylised land outline (lng, lat) of the SF peninsula, East Bay and South Bay. Approximate on purpose. */
const LAND: [number, number][] = [
  [-122.477, 37.806], [-122.512, 37.781], [-122.511, 37.74], [-122.505, 37.7], [-122.5, 37.64],
  [-122.52, 37.56], [-122.47, 37.5], [-122.44, 37.46], [-122.4, 37.36], [-122.4, 37.2],
  [-121.7, 37.2], [-121.7, 37.95], [-122.3, 37.95], [-122.3, 37.8], [-122.28, 37.76],
  [-122.25, 37.75], [-122.2, 37.71], [-122.15, 37.64], [-122.14, 37.6], [-122.06, 37.51],
  [-122.03, 37.46], [-122.0, 37.44], [-122.02, 37.43], [-122.06, 37.43], [-122.09, 37.45],
  [-122.12, 37.47], [-122.2, 37.52], [-122.27, 37.56], [-122.3, 37.58], [-122.34, 37.6],
  [-122.36, 37.62], [-122.38, 37.66], [-122.38, 37.71], [-122.37, 37.725], [-122.385, 37.76],
  [-122.39, 37.79], [-122.4, 37.806], [-122.41, 37.809], [-122.43, 37.806], [-122.45, 37.807],
];

const WIDTH = 640;

interface MapApi {
  view: MapView;
  width: number;
  height: number;
  project: (lat: number, lng: number) => [number, number];
  kmToPx: (km: number) => number;
  inView: (lat: number, lng: number, marginPx?: number) => boolean;
}

const MapCtx = createContext<MapApi | null>(null);
export const useMap = () => {
  const ctx = useContext(MapCtx);
  if (!ctx) throw new Error("useMap must be used inside <ZoneMap>");
  return ctx;
};

export default function ZoneMap({
  children,
  defaultView = "bay",
  className = "",
  caption,
}: {
  children?: ReactNode;
  defaultView?: MapView;
  className?: string;
  caption?: ReactNode;
}) {
  const [view, setView] = useState<MapView>(defaultView);

  const api = useMemo<MapApi>(() => {
    const b = BOUNDS[view];
    const cosLat = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
    const spanLng = b.maxLng - b.minLng;
    const spanLat = b.maxLat - b.minLat;
    const scale = WIDTH / (spanLng * cosLat); // px per degree of latitude
    const height = Math.round(spanLat * scale);
    const project = (lat: number, lng: number): [number, number] => [
      (lng - b.minLng) * cosLat * scale,
      (b.maxLat - lat) * scale,
    ];
    return {
      view,
      width: WIDTH,
      height,
      project,
      kmToPx: (km) => (km / 111.32) * scale,
      inView: (lat, lng, m = 0) => {
        const [x, y] = project(lat, lng);
        return x >= -m && x <= WIDTH + m && y >= -m && y <= height + m;
      },
    };
  }, [view]);

  const land = useMemo(
    () => LAND.map(([lng, lat], i) => `${i ? "L" : "M"}${api.project(lat, lng).map((n) => n.toFixed(1)).join(",")}`).join(" ") + "Z",
    [api],
  );

  const gridStep = view === "bay" ? 0.1 : 0.02;
  const b = BOUNDS[view];
  const gridLines: ReactNode[] = [];
  for (let lat = Math.ceil(b.minLat / gridStep) * gridStep; lat < b.maxLat; lat += gridStep) {
    const y = api.project(lat, b.minLng)[1];
    gridLines.push(<line key={`la${lat.toFixed(3)}`} x1={0} x2={WIDTH} y1={y} y2={y} />);
  }
  for (let lng = Math.ceil(b.minLng / gridStep) * gridStep; lng < b.maxLng; lng += gridStep) {
    const x = api.project(b.minLat, lng)[0];
    gridLines.push(<line key={`ln${lng.toFixed(3)}`} x1={x} x2={x} y1={0} y2={api.height} />);
  }

  return (
    <div className={`rounded-xl border border-line bg-panel overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-line text-sm">
        <div className="text-muted">{caption}</div>
        <div className="inline-flex rounded-md border border-line overflow-hidden" role="group" aria-label="Map view">
          {(["bay", "sf"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-3 py-1 text-xs ${view === v ? "bg-accent-btn text-white" : "text-muted hover:bg-panel-2"}`}
            >
              {v === "bay" ? "Bay Area" : "San Francisco"}
            </button>
          ))}
        </div>
      </div>
      <MapCtx.Provider value={api}>
        <svg viewBox={`0 0 ${WIDTH} ${api.height}`} className="w-full h-auto block" style={{ background: "var(--map-water)" }} role="group" aria-label="Zone map">
          <path d={land} fill="var(--map-land)" />
          <g stroke="var(--map-line)" strokeWidth="0.5" opacity="0.6">
            {gridLines}
          </g>
          {children}
        </svg>
      </MapCtx.Provider>
      <div className="px-3 py-1.5 text-[11px] text-muted border-t border-line">Stylised coastline, not to scale · zones are synthetic service areas</div>
    </div>
  );
}
