import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const short = (c: number) => {
  const d = c / 100;
  return Math.abs(d) >= 1e6 ? `$${(d / 1e6).toFixed(1)}M` : Math.abs(d) >= 1e3 ? `$${Math.round(d / 1e3)}K` : `$${Math.round(d)}`;
};
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 } };

/** Bar chart of cents values. series: [{ key, label }] */
export function CentsBarChart({ data, xKey, series, height = 240 }: { data: any[]; xKey: string; series: { key: string; label: string }[]; height?: number }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted-foreground">No data to chart yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={56} />
        <Tooltip formatter={(v: number) => short(v)} cursor={{ fill: "var(--muted)" }} {...tip} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut chart of cents values. */
export function CentsDonut({ data, height = 240 }: { data: { name: string; value: number }[]; height?: number }) {
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">No data to chart yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
          {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => short(v)} {...tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
