import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { salesPipelineFn } from "@/lib/staff-roles.functions";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function SalesPipelineTab() {
  const load = useServerFn(salesPipelineFn);
  const q = useQuery({ queryKey: ["sales-pipeline"], queryFn: () => load(), retry: false });
  if (q.error) return <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const d = q.data;
  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{d.team ? "Whole Sales team." : "Your deals."}</p>
      <section className="rounded-lg border p-4">
        <h3 className="mb-2 font-medium">Pipeline by stage</h3>
        {d.stages.length === 0 ? <p className="text-sm text-muted-foreground">No open deals yet. Add deals under Contacts &amp; deals.</p> : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.stages.map((s) => ({ ...s, value: s.cents / 100 }))}>
                <XAxis dataKey="stage" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString("en-US")}`} />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      {d.team && (
        <section className="rounded-lg border p-4">
          <h3 className="mb-2 font-medium">Rep leaderboard</h3>
          <ul className="divide-y text-sm">
            {d.leaderboard.map((r) => (
              <li key={r.name} className="flex justify-between py-2"><span>{r.name} <span className="text-muted-foreground">· {r.count} deals</span></span><span>{money(r.won)} won · {money(r.cents)} total</span></li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-lg border p-4">
        <h3 className="mb-2 font-medium">Expected to close next</h3>
        {d.upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No close dates set.</p> : (
          <ul className="divide-y text-sm">
            {d.upcoming.map((x: any) => (
              <li key={x.id} className="flex justify-between py-2"><span>{x.title} <span className="text-muted-foreground">· {x.owner} · {x.stage}</span></span><span>{money(Number(x.amount_cents ?? 0))} · {x.expected_close}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
