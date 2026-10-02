import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, BadgeCheck, TableProperties, FileSearch } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientCapDashboard } from "@/lib/client-dashboard.functions";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "-");
const fmtTime = (d: string) => new Date(d).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function ClientCapDashboard({ clientId }: { clientId: string }) {
  const load = useServerFn(getClientCapDashboard);
  const q = useQuery({ queryKey: ["client-cap-dashboard", clientId], queryFn: () => load({ data: { clientId } }) });
  const d = q.data;
  const tiles = [
    { l: "Pending KYC Approval", v: d?.totals.pendingKyc, icon: BadgeCheck, bg: "var(--tile-1)" },
    { l: "Active Cap Tables", v: d?.totals.activeCapTables, icon: TableProperties, bg: "var(--tile-2)" },
    { l: "Stakeholders Pending Onboarding", v: d?.totals.pendingOnboarding, icon: BarChart3, bg: "var(--tile-3)" },
    { l: "Cap Tables Pending Review", v: d?.totals.pendingReview, icon: FileSearch, bg: "var(--tile-4)" },
  ];
  const pie = (d?.ownership ?? []).map((o, i) => ({ ...o, color: COLORS[i] }));
  const hasPie = pie.some((p) => p.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.l} className="overflow-hidden" style={{ backgroundImage: t.bg }}>
            <CardContent className="space-y-6 p-4">
              <span className="inline-flex size-10 items-center justify-center rounded-md border bg-background/40"><t.icon className="size-5 text-primary" /></span>
              <div className="flex items-end justify-between gap-3">
                <p className="text-sm font-medium">{t.l}</p>
                <p className="font-heading text-3xl font-light">{t.v ?? "-"}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Cap Table - Ownership Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border border-dashed p-4">
              {!hasPie ? <p className="py-16 text-center text-sm text-muted-foreground">No securities recorded yet.</p> : (
                <>
                  <div className="h-52">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pie.filter((p) => p.value > 0)} dataKey="value" innerRadius="58%" outerRadius="88%" paddingAngle={4} cornerRadius={8} stroke="none">
                          {pie.filter((p) => p.value > 0).map((p) => <Cell key={p.name} fill={p.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
                    {pie.map((p) => <span key={p.name} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}</span>)}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Activity Log</CardTitle><CardDescription>Recent audit log summary</CardDescription></CardHeader>
          <CardContent>
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-2">
              {!d?.activity.length ? <p className="p-4 text-sm text-muted-foreground">No activity yet.</p> : d.activity.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded p-2">
                  <div><p className="text-sm font-semibold">{a.title}</p><p className="text-sm text-muted-foreground">{a.actor}</p></div>
                  <p className="text-right text-xs text-highlight">{fmtTime(a.at)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Compliance Table</CardTitle></CardHeader>
        <CardContent>
          {!d?.compliance.length ? <p className="text-sm text-muted-foreground">No stakeholders yet.</p> : (
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left"><tr><th className="p-3">Stakeholder Name</th><th className="p-3">KYC Status</th><th className="p-3">Last Updated</th></tr></thead>
                <tbody>
                  {d.compliance.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3">{c.name}</td>
                      <td className="p-3"><Badge variant="outline" className={c.kyc === "Approved" ? "border-transparent bg-success/15 text-success" : "border-transparent bg-warning/15 text-warning"}>{c.kyc}</Badge></td>
                      <td className="p-3">{fmt(c.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
