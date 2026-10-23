/** Staff-only migration progress for a fund: prior subscriptions confirmed, signed agreements attached, invites sent. Display only. */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFundLaunchFlow } from "@/lib/prior-subscription.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const money = (c: number | null | undefined) => c == null ? " · " : `$${Math.round(c / 100).toLocaleString()}`;
const day = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString() : null;

export function FundMigrationStatus({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundLaunchFlow);
  const q = useQuery({ queryKey: ["fund-launch-flow", fundId], queryFn: () => load({ data: { offeringId: fundId } } as any) });
  if (q.isLoading) return <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading migration status…</CardContent></Card>;
  if (q.error) return <Card><CardContent className="p-4 text-sm text-destructive">Couldn't load migration status: {(q.error as Error).message}</CardContent></Card>;
  const investors = ((q.data as any)?.investors ?? []) as any[];
  if (!investors.length) return null;
  const n = investors.length;
  const confirmed = investors.filter((i) => i.prior?.status === "confirmed").length;
  const awaiting = investors.filter((i) => i.prior && i.prior.status !== "confirmed" && i.prior.status !== "rejected").length;
  const agreements = investors.filter((i) => (i.prior?.evidence ?? []).length > 0).length;
  const invited = investors.filter((i) => i.invited || i.joined).length;
  const joined = investors.filter((i) => i.joined).length;
  const stats = [
    { label: "Subscriptions confirmed", v: confirmed, sub: awaiting ? `${awaiting} awaiting second staff member` : null },
    { label: "Signed agreements attached", v: agreements, sub: null },
    { label: "Onboarding sent", v: invited, sub: `${joined} signed in` },
  ];
  const overall = Math.round(((confirmed + agreements + invited) / (n * 3)) * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Migration status</CardTitle>
        <CardDescription>Progress bringing this fund's existing investors onto Harmonious. Display only, confirming and sending stay in their own steps.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3"><Progress value={overall} className="h-2" /><span className="text-sm font-medium tabular-nums">{overall}%</span></div>
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-semibold tabular-nums">{s.v}<span className="text-sm text-muted-foreground"> / {n}</span></p>
              {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2 pr-3">Investor</th><th className="pr-3">Commitment</th><th className="pr-3">Subscription</th><th className="pr-3">Agreement</th><th>Onboarding</th></tr></thead>
            <tbody>
              {investors.map((i) => {
                const st = i.prior?.status;
                const ev = (i.prior?.evidence ?? []).length;
                return (
                  <tr key={i.onboardingId} className="border-t">
                    <td className="py-2 pr-3"><p className="font-medium">{i.name || "Unnamed"}</p><p className="text-xs text-muted-foreground">{i.email ?? "No email"}</p></td>
                    <td className="pr-3 tabular-nums">{money(i.prior?.commitmentCents ?? i.commitmentCents)}</td>
                    <td className="pr-3">{!i.prior ? <Badge variant="outline">Not recorded</Badge> : st === "confirmed" ? <Badge>Confirmed</Badge> : st === "rejected" ? <Badge variant="destructive">Sent back</Badge> : <Badge variant="secondary">Awaiting confirmation</Badge>}</td>
                    <td className="pr-3">{ev ? <Badge>{ev} attached</Badge> : <Badge variant="outline">Missing</Badge>}</td>
                    <td>{i.joined ? <Badge>Signed in</Badge> : i.invited ? <Badge variant="secondary">Sent {day(i.invitedAt) ?? ""}</Badge> : <Badge variant="outline">{i.email ? "Not sent" : "Needs email"}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
