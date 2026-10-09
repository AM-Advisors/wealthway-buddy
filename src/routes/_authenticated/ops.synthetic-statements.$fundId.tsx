import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadPdfDoc } from "@/lib/pdf-render";
import { getSyntheticStatementPreviews } from "@/lib/synthetic-statements.functions";
import { SYNTHETIC_STATEMENT_LABEL, syntheticStatementPdfSpec } from "@/lib/synthetic-statement";

export const Route = createFileRoute("/_authenticated/ops/synthetic-statements/$fundId")({
  head: () => ({
    meta: [
      { title: "Synthetic statement previews - Harmonious" },
      { name: "description", content: "Internal-only synthetic investor statement previews for the TEST/DEMO reference fund." },
      { property: "og:title", content: "Synthetic statement previews - Harmonious" },
      { property: "og:description", content: "Internal QA previews. Not for investor distribution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Page() {
  const { fundId } = Route.useParams();
  const load = useServerFn(getSyntheticStatementPreviews);
  const { data, isLoading, error } = useQuery({
    queryKey: ["synthetic-statements", fundId],
    queryFn: () => load({ data: { offeringId: fundId, channel: "internal_preview" } }),
    retry: false,
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="rounded-md bg-destructive px-4 py-2 text-center text-sm font-semibold text-destructive-foreground">{SYNTHETIC_STATEMENT_LABEL}</div>
      <header>
        <h1 className="text-2xl font-semibold">Synthetic statement previews</h1>
        <p className="text-sm text-muted-foreground">Internal software testing only. Not visible to investors, not emailed, not shareable.</p>
      </header>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : data ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap gap-6 py-4 text-sm">
              <span>Statements: <b>{data.statements.length}</b></span>
              <span>Total ending capital: <b>{usd(data.totalCents)}</b></span>
              <span>Synthetic NAV: <b>{usd(data.navCents)}</b></span>
              <span>Difference: <b>{usd(data.differenceCents)}</b></span>
            </CardContent>
          </Card>
          {data.errors.length > 0 && <Card><CardContent className="py-4 text-sm text-destructive">{data.errors.map((e) => <p key={e}>{e}</p>)}</CardContent></Card>}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.statements.map((s) => (
              <Card key={s.accountId} className="border-destructive/40">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{s.investorName}</CardTitle>
                      <CardDescription>Class {s.classLabel} · {s.period.start} to {s.period.end}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1">{s.badges.map((b) => <Badge key={b} variant={b.startsWith("SOURCE") ? "destructive" : "outline"}>{b}</Badge>)}</div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {s.lines.map((l) => <Row key={l.label} label={l.label} value={usd(l.cents)} />)}
                  <Row label="Net investment result" value={usd(s.netResultCents)} />
                  <Row label="Ending provisional capital" value={usd(s.endingCapitalCents)} strong />
                  <p className="pt-2 text-xs font-medium">Held separately (not capital)</p>
                  <Row label="Outstanding capital calls" value={usd(s.unpaidCallCents)} />
                  <Row label="Investor credit (liability)" value={usd(s.creditsCents)} />
                  {s.restrictions.map((r) => <p key={r} className="text-xs text-muted-foreground">Restriction: {r}</p>)}
                  <p className="pt-2 text-xs text-muted-foreground">{s.disclosures.join(" ")}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
                    try {
                      await load({ data: { offeringId: fundId, channel: "internal_pdf" } });
                      await downloadPdfDoc(syntheticStatementPdfSpec(s, data.fundName));
                    } catch (e: any) { toast.error(e?.message ?? "Export refused."); }
                  }}>Download watermarked PDF</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
