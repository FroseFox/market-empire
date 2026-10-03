"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactEur, eur, eur2 } from "@/lib/format";

const axis = { fontSize: 11, fill: "#64748b" };

export function WealthChart({ data, color = "#2563EB", height = 220, money2 = false, xFormat, unit }: {
  data: { x: string | number; y: number }[]; color?: string; height?: number; money2?: boolean; xFormat?: (v: number | string) => string;
  /** Pour une courbe qui n'est pas en euros (ex. « hab. »). */
  unit?: string;
}) {
  const plain = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} ${unit}`;
  const id = `g-${color.slice(1)}`;
  const ys = data.map((d) => d.y);
  const min = Math.min(...ys), max = Math.max(...ys);
  const pad = (max - min) * 0.15 || max * 0.01 || 1;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={xFormat} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={62} domain={[min - pad, max + pad]} tickFormatter={(v) => unit ? plain(v) : money2 ? `${Math.round(v)} €` : max - min < 20_000 ? eur(v) : compactEur(v)} />
          <Tooltip
            formatter={(v) => [unit ? plain(Number(v)) : money2 ? eur2(Number(v)) : eur(Number(v)), ""]}
            labelFormatter={(l) => (xFormat ? xFormat(l as string | number) : String(l))}
            contentStyle={{ borderRadius: 10, border: "1px solid #e7ebf1", fontSize: 12 }} separator="" />
          <Area type="monotone" dataKey="y" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IncomeBars({ data, height = 150 }: { data: { x: string; income: number; expenses: number }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={compactEur} />
          <Tooltip formatter={(v, n) => [eur(Number(v)), n === "income" ? "Revenus" : "Dépenses"]} contentStyle={{ borderRadius: 10, border: "1px solid #e7ebf1", fontSize: 12 }} cursor={{ fill: "#f5f7fa" }} />
          <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <div className="h-8 w-24" />;
  const min = Math.min(...points), max = Math.max(...points);
  const w = 96, h = 30;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * w},${h - ((p - min) / (max - min || 1)) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke={up ? "#10B981" : "#EF4444"} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Camembert (anneau) avec la valeur totale au centre. */
export function Donut({ data, total, height = 220 }: { data: { name: string; value: number; color: string }[]; total: string; height?: number }) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={data.length > 1 ? 2 : 0}
            stroke="#FFFFFF" strokeWidth={2} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [eur(Number(v)), String(n)]} contentStyle={{ borderRadius: 10, border: "1px solid #e7ebf1", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div><div className="text-[11px] text-muted">Total</div><div className="text-[17px] font-bold tabular">{total}</div></div>
      </div>
    </div>
  );
}
