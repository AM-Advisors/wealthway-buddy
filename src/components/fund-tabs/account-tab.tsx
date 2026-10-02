import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fundAccountFn } from "@/lib/fund-tabs.functions";
import { CentsBarChart, CentsDonut } from "./charts";
import { RequestHarmoniousButton } from "./request-harmonious";
import { AutomatedReports } from "./automated-reports";
import { K1Report } from "./k1-report";
import { fmtDate, usd } from "./shared";

const label = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "-");
const period = (a?: string | null, b?: string | null) => (a || b ? `${a ? fmtDate(a) : "?"} – ${b ? fmtDate(b) : "?"}` : "-");

function Section({ title, desc, children, action }: { title: string; desc: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div><CardTitle className="text-base">{title}</CardTitle><CardDescription>{desc}</CardDescription></div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AccountTab({ fundId, fundName, taxDocs }: { fundId: string; fundName: string; taxDocs: any[] }) {
  const load = useServerFn(fundAccountFn);
  const q = useQuery({ queryKey: ["fund-account", fundId], queryFn: () => load({ data: { fundId } }) });
  const d = q.data;
  const nav = d?.nav ?? [];
  const latest = nav[nav.length - 1];
  const navBars = nav.map((n: any) => ({ label: n.period_label || n.as_of_date, nav: Number(n.net_asset_value_cents ?? 0) }));
  const mix = latest ? [
    { name: "Investments", value: Number(latest.investments_fair_value_cents ?? 0) },
    { name: "Cash", value: Number(latest.cash_cents ?? 0) },
    { name: "Receivables", value: Number(latest.receivables_cents ?? 0) },
    { name: "Other assets", value: Number(latest.other_assets_cents ?? 0) },
  ] : [];
  const btn = (item: string, keys: string[]) => <RequestHarmoniousButton fundId={fundId} fundName={fundName} item={item} serviceKeys={keys} />;
  const empty = (t: string) => <p className="py-6 text-center text-sm text-muted-foreground">{t}</p>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Latest NAV", latest ? usd(Number(latest.net_asset_value_cents)) : "-"],
          ["NAV per unit", latest?.nav_per_unit_cents != null ? usd(Number(latest.nav_per_unit_cents)) : "-"],
          ["Financial statements", String(d?.statements.length ?? 0)],
          ["Tax documents", String(taxDocs.length)],
        ].map(([l, v]) => <Card key={l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-semibold">{v}</p></CardContent></Card>)}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">NAV over time</CardTitle></CardHeader><CardContent><CentsBarChart data={navBars} xKey="label" series={[{ key: "nav", label: "NAV" }]} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Asset mix (latest NAV)</CardTitle></CardHeader><CardContent><CentsDonut data={mix} /></CardContent></Card>
      </div>

      <AutomatedReports fundId={fundId} fundName={fundName} />
      <K1Report fundId={fundId} />

      <Section title="NAV" desc="Approved net asset value. Harmonious prepares and reviews NAV." action={btn("NAV reporting", ["nav_reporting"])}>
        {q.isLoading ? empty("Loading…") : !nav.length ? empty("No approved NAV yet.") : (
          <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">As of</th><th className="text-right">NAV</th><th className="text-right">Liabilities</th><th>Status</th></tr></thead>
            <tbody>{[...nav].reverse().map((n: any) => <tr key={n.id} className="border-t"><td className="py-2">{fmtDate(n.as_of_date)}</td><td className="text-right">{usd(Number(n.net_asset_value_cents ?? 0))}</td><td className="text-right">{usd(Number(n.total_liabilities_cents ?? 0))}</td><td className="capitalize">{label(n.status)}</td></tr>)}</tbody></table>
        )}
      </Section>

      <Section title="Financial statements" desc="Statement packages prepared by Harmonious." action={btn("Financial statements", ["financial_statements"])}>
        {q.isLoading ? empty("Loading…") : !d?.statements.length ? empty("No financial statements yet.") : (
          <div className="divide-y rounded-md border">{d.statements.map((s: any) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><span className="capitalize">{label(s.period_type)}</span> · {period(s.period_start, s.period_end)}</span><Badge variant="outline" className="capitalize">{label(s.status)}</Badge></div>)}</div>
        )}
      </Section>

      <Section title="Financial review" desc="Prepare, review and approve memos for each period." action={btn("Financial review", ["financial_review"])}>
        {q.isLoading ? empty("Loading…") : !d?.reviews.length ? empty("No financial reviews yet.") : (
          <div className="divide-y rounded-md border">{d.reviews.map((r: any) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{r.title || "Financial review"} · {period(r.period_start, r.period_end)}</span><Badge variant="outline" className="capitalize">{label(r.status)}</Badge></div>)}</div>
        )}
      </Section>

      <Section title="Taxes" desc="For your information. Harmonious prepares tax work; nothing is filed from here." action={btn("Tax returns and K-1s", ["tax_1065", "tax_k1", "tax_state"])}>
        {!taxDocs.length ? empty("No tax documents yet.") : (
          <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Year</th><th>Document</th><th>File</th><th>Status</th></tr></thead>
            <tbody>{taxDocs.map((t: any) => <tr key={t.id} className="border-t"><td className="py-2">{t.tax_year ?? "-"}</td><td className="uppercase">{label(t.doc_type)}</td><td className="text-muted-foreground">{t.file_name}</td><td className="capitalize">{t.review_status ?? "-"}</td></tr>)}</tbody></table>
        )}
      </Section>
    </div>
  );
}
