import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getClientFund, getFundCapTable } from "@/lib/fund-cap-table.functions";

export const Route = createFileRoute("/_authenticated/client/funds/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund — Harmonious client portal" },
      { name: "description", content: "Fund details, setup progress, investors and cap table for your fund." },
      { property: "og:title", content: "Fund — Harmonious client portal" },
      { property: "og:description", content: "Fund details, setup progress, investors and cap table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientFundPage,
});

const usd = (c: number | null | undefined) =>
  typeof c === "number" ? (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—";
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not recorded";

function ClientFundPage() {
  const { fundId } = Route.useParams();
  const loadFund = useServerFn(getClientFund);
  const loadCap = useServerFn(getFundCapTable);
  const fq = useQuery({ queryKey: ["client-fund", fundId], queryFn: () => loadFund({ data: { fundId } }) });
  const cq = useQuery({ queryKey: ["client-fund-cap", fundId], queryFn: () => loadCap({ data: { fundId } }) });

  if (fq.isLoading) return <p className="text-sm text-muted-foreground">Loading fund…</p>;
  if (fq.error || !fq.data) return <p className="text-sm text-destructive">{(fq.error as any)?.message ?? "Couldn't load this fund."}</p>;
  const { setup, steps, sideLetters } = fq.data;
  const f = fq.data.fund as any;
  const pending = steps.filter((s) => !s.done);
  const cap = cq.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/client/funds" className="text-xs text-muted-foreground hover:underline">← All funds</Link>
          <h2 className="text-xl font-semibold tracking-tight">{f.name}</h2>
          <p className="text-sm text-muted-foreground">{f.legal_entity_name || "Legal name not recorded"}</p>
        </div>
        <Badge variant={f.is_open ? "default" : "secondary"}>{f.is_open ? "Open to investors" : "In setup"}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "Setup complete", v: setup.percent == null ? "—" : `${setup.percent}%` },
          { l: "Investors", v: cap ? String(cap.totals.investors) : "—" },
          { l: "Committed", v: cap ? usd(cap.totals.commitCents) : "—" },
          { l: "Funded (reconciled)", v: cap ? usd(cap.totals.fundedCents) : "—" },
        ].map((k) => (
          <Card key={k.l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.l}</p><p className="text-xl font-semibold">{k.v}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fund details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Type</dt><dd>{(f.fund_type === "other" ? f.fund_type_other : f.fund_type) || "Not recorded"}{f.entity_type ? ` · ${f.entity_type}` : ""}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Exemption</dt><dd>{f.reg_type ? `Reg D ${f.reg_type}` : "Not recorded"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Target raise</dt><dd>{usd(f.target_raise_cents == null ? null : Number(f.target_raise_cents))}</dd></div>
            <div><dt className="text-xs text-muted-foreground">State formed</dt><dd>{f.state_formed || "Not recorded"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Date formed</dt><dd>{fmtDate(f.date_formed)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Side letters</dt><dd>{sideLetters.active} active{sideLetters.proposed ? ` · ${sideLetters.proposed} proposed` : ""}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup progress</CardTitle>
          <CardDescription>{pending.length ? `${pending.length} step${pending.length === 1 ? "" : "s"} still open.` : steps.length ? "All setup steps are complete." : "Harmonious hasn't started setup for this fund yet."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {setup.percent != null && <Progress value={setup.percent} />}
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {s.done ? <CheckCircle2 className="size-4 text-primary" /> : <Clock className="size-4 text-muted-foreground" />}
                <span className={s.done ? "" : "text-muted-foreground"}>{s.label}</span>
                {!s.done && <Badge variant="outline" className="ml-auto">{s.owner === "Harmonious" ? "Harmonious — pending" : "Waiting on you"}</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cap table</CardTitle>
          <CardDescription>Read-only. Funded counts only money matched to the bank.</CardDescription>
        </CardHeader>
        <CardContent>
          {cq.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
           cq.error ? <p className="text-sm text-muted-foreground">Cap table isn't available yet.</p> :
           !cap || cap.rows.length === 0 ? <p className="text-sm text-muted-foreground">No investors yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-2">Investor</th><th>Class</th><th>Stage</th><th className="text-right">Committed</th><th className="text-right">Funded</th><th className="text-right">% of commitments</th><th>Side letter</th></tr>
                </thead>
                <tbody>
                  {cap.rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2"><p className="font-medium">{r.investorName}</p>{r.profileName && <p className="text-xs text-muted-foreground">{r.profileName}</p>}</td>
                      <td>{r.classKey || "—"}</td>
                      <td className="capitalize">{r.stage || "—"}</td>
                      <td className="text-right">{usd(r.commitmentCountedCents)}</td>
                      <td className="text-right">{usd(r.fundedCountedCents)}</td>
                      <td className="text-right">{r.pctCommitted.toFixed(2)}%</td>
                      <td>{r.sideLetter ? <Badge variant="secondary">{r.sideLetter.status}</Badge> : "—"}</td>
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
