"use client";

import { useState } from "react";
import { zones } from "@/lib/demand-model";
import { demandColor } from "@/lib/colors";
import { useMap } from "./Map";

export default function HeatmapLayer({
  values,
  max,
  selectedId,
  onSelect,
  formatValue = (v) => v.toFixed(0),
  badges,
}: {
  values: Map<string, number>;
  max: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  formatValue?: (v: number) => string;
  /** optional per-zone count shown in the circle (e.g. vehicles assigned) */
  badges?: Map<string, number>;
}) {
  const { project, kmToPx, inView, view } = useMap();
  const [hover, setHover] = useState<string | null>(null);

  return (
    <g>
      {zones.map((z) => {
        if (!inView(z.lat, z.lng, 20)) return null;
        const [x, y] = project(z.lat, z.lng);
        const v = values.get(z.id) ?? 0;
        const r = Math.max(9, kmToPx(z.radius_km * 0.5));
        const selected = selectedId === z.id;
        const badge = badges?.get(z.id);
        return (
          <g
            key={z.id}
            onMouseEnter={() => setHover(z.id)}
            onMouseLeave={() => setHover((h) => (h === z.id ? null : h))}
            onClick={() => onSelect?.(z.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect?.(z.id)}
            tabIndex={onSelect ? 0 : undefined}
            role={onSelect ? "button" : undefined}
            aria-label={`${z.name}: ${formatValue(v)}`}
            style={{ cursor: onSelect ? "pointer" : "default" }}
          >
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={demandColor(max ? v / max : 0)}
              fillOpacity={0.82}
              stroke={selected ? "var(--accent-2)" : "rgba(255,255,255,0.35)"}
              strokeWidth={selected ? 2.5 : 1}
              style={{ transition: "fill 0.35s ease" }}
            />
            {badge !== undefined && badge > 0 && (
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize={r > 14 ? 11 : 9} fontWeight={700} fill="#0a1020" pointerEvents="none">
                {badge}
              </text>
            )}
            {view === "sf" && (
              <text x={x} y={y - r - 3} textAnchor="middle" fontSize="10" fill="var(--fg)" pointerEvents="none" opacity="0.85">
                {z.name}
              </text>
            )}
          </g>
        );
      })}
      {hover &&
        (() => {
          const z = zones.find((q) => q.id === hover)!;
          const [x, y] = project(z.lat, z.lng);
          const text = `${z.name} · ${formatValue(values.get(z.id) ?? 0)}`;
          const w = text.length * 6.2 + 14;
          const tx = Math.min(Math.max(x - w / 2, 4), 640 - w - 4);
          return (
            <g pointerEvents="none">
              <rect x={tx} y={y - 40} width={w} height={22} rx={5} fill="var(--panel)" stroke="var(--border)" />
              <text x={tx + w / 2} y={y - 25} textAnchor="middle" fontSize="11" fill="var(--fg)">
                {text}
              </text>
            </g>
          );
        })()}
    </g>
  );
}
