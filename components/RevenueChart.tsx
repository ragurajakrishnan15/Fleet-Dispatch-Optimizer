"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ZoneRevenue {
  name: string;
  revenue: number;
}

export default function RevenueChart({ data }: { data: ZoneRevenue[] }) {
  const maxRev = Math.max(...data.map((d) => d.revenue));
  const stepK = maxRev > 20000 ? 10000 : 5000;
  const ticks = Array.from({ length: Math.floor(maxRev / stepK) + 2 }, (_, i) => i * stepK);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, ticks[ticks.length - 1]]} ticks={ticks} tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} interval={0} />
        <Tooltip
          cursor={{ fill: "var(--panel-2)" }}
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          formatter={(v) => [`$${Math.round(Number(v)).toLocaleString("en-US")}`, "Fares / day"]}
        />
        <Bar dataKey="revenue" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
