import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CentsBarChart, CentsDonut } from "@/components/fund-tabs/charts";
import { capitalTieReportFn, investorShareFn } from "@/lib/investor-share.functions";

const money = (c: number) => `${c < 0 ? "-" : ""}$${Math.abs(Math.round(c / 100)).toLocaleString("en-US")}`;

/** Investor's own share: approved capital account, P&L, distributions, K-1 tie. */
export function InvestorSharePanel({ offeringId }: { offeringId: string }) {
  const load = useServerFn(investorShareFn);
  const { data, isLoading, error } = useQuery({ queryKey: ["investor-share", offeringId], queryFn: () => load({ data: { offeringId } }), refetchOnWindowFocus: true });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your share…</p>;
  if (error || !data) return <p className="text-sm text-destructive">Couldn't load your share right now.</p>;
  if (data.isCorporation) return <Card><CardContent className="py-6 text-sm text-muted-foreground">This company is a corporation, so profits and losses aren't passed through to holders and no K-1s are issued. Your shares are shown on your holdings.</CardContent></Card>;
  if (!data.periods.length) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Your capital account will appear here once Harmonious approves the fund's first period.</CardContent></Card>;
  const s = data.summary;
  const chart = data.periods.map((p) => ({ period: p.periodEnd.slice(0, 7), pnl: p.income - p.losses, dist: p.distributions }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ["Ownership", s.ownershipPct == null ? "-" : `${s.ownershipPct.toFixed(2)}%`],
          ["Contributed", money(s.contributed)],
          ["Profit / loss", money(s.netIncome)],
          ["Distributions", money(s.distributions)],
          ["Capital balance", money(s.balance)],
        ].map(([l, v]) => (
          <Card key={l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold">{v}</p></CardContent></Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">As of {s.asOf} — approved figures only.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Profit / loss and distributions</CardTitle></CardHeader>
          <CardContent><CentsBarChart data={chart} xKey="period" series={[{ key: "pnl", label: "Profit / loss" }, { key: "dist", label: "Distributions" }]} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Your capital</CardTitle></CardHeader>
          <CardContent><CentsDonut data={[{ name: "Contributed", value: s.contributed }, { name: "Profit", value: Math.max(0, s.netIncome) }, { name: "Distributed", value: s.distributions }]} /></CardContent></Card>
      </div>
      {data.fundNetAssets != null && (
        <Card><CardHeader><CardTitle className="text-base">Balance sheet (your share)</CardTitle><CardDescription>Fund net assets from the last approved period.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
            <div><p className="text-muted-foreground">Fund net assets</p><p className="font-medium">{money(data.fundNetAssets)}</p></div>
            <div><p className="text-muted-foreground">Your share</p><p className="font-medium">{money(s.balance)}</p></div>
            <div><p className="text-muted-foreground">Your percentage</p><p className="font-medium">{data.fundNetAssets ? `${((s.balance / data.fundNetAssets) * 100).toFixed(2)}%` : "-"}</p></div>
          </CardContent></Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Capital account statement</CardTitle><CardDescription>Compared with your K-1 for each tax year.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1">Year</th><th>Opening</th><th>Contributed</th><th>Profit</th><th>Losses &amp; fees</th><th>Distributions</th><th>Closing</th><th>K-1</th></tr></thead>
            <tbody>
              {data.years.map((y) => {
                const t = data.ties.find((x) => x.year === y.year);
                return (
                  <tr key={y.year} className="border-t">
                    <td className="py-2 font-medium">{y.year}</td><td>{money(y.beginning)}</td><td>{money(y.contributions)}</td><td>{money(y.income)}</td><td>{money(-y.losses)}</td><td>{money(-y.distributions)}</td><td className="font-medium">{money(y.ending)}</td>
                    <td>{t?.status === "matches" ? <Badge>Matches your K-1</Badge> : t?.status === "differs" ? <Badge variant="secondary">Harmonious is reviewing</Badge> : <span className="text-muted-foreground">No final K-1 yet</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className="mt-3 text-sm underline" onClick={() => window.print()}>Print or save as PDF</button>
        </CardContent>
      </Card>
    </div>
  );
}

/** Harmonious / managers: which investors' statements tie to their final K-1s. */
export function CapitalTieReport({ offeringId }: { offeringId: string }) {
  const load = useServerFn(capitalTieReportFn);
  const { data, isLoading } = useQuery({ queryKey: ["capital-tie", offeringId], queryFn: () => load({ data: { offeringId } }) });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Investor capital vs. K-1s</CardTitle><CardDescription>Approved capital accounts compared with final K-1s, so differences are fixed before investors see them.</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !data?.length ? <p className="text-sm text-muted-foreground">No approved capital accounts yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1">Investor</th><th>Balance</th><th>Tax years</th></tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.investorUserId} className="border-t align-top">
                <td className="py-2">{r.name}</td><td>{money(r.balance)}</td>
                <td className="space-y-1">{r.ties.map((t) => (
                  <div key={t.year}>{t.year}: {t.status === "matches" ? "matches" : t.status === "no_k1" ? "no final K-1" : `differs — ${t.lines.filter((l) => Math.abs(l.diff) > 1).map((l) => `${l.label} ${money(l.diff)}`).join(", ")}`}</div>
                ))}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
