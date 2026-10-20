"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatHour } from "./TimeSlider";

export interface UtilPoint {
  hour: number;
  Optimized: number;
  Naive: number;
}

export default function UtilizationChart({ data }: { data: UtilPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="hour" tickFormatter={(h) => (h % 3 === 0 ? formatHour(h) : "")} interval={0} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(h) => formatHour(Number(h))}
          formatter={(v) => `${Number(v).toFixed(1)}%`}
        />
        <Legend verticalAlign="top" height={28} />
        <Line type="monotone" dataKey="Naive" stroke="var(--muted)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Optimized" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
