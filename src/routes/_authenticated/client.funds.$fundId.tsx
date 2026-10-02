import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateSetupTaskFn } from "@/lib/fund-setup.functions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getClientFund, getFundCapTable } from "@/lib/fund-cap-table.functions";
import { getFundTabsData, listFundCloseRequests } from "@/lib/fund-close-requests.functions";
import { TodosTab } from "@/components/fund-tabs/todos-tab";
import { TeamTab } from "@/components/fund-tabs/team-tab";
import { InvestorsTab } from "@/components/fund-tabs/investors-tab";
import { DocumentsTab } from "@/components/fund-tabs/documents-tab";
import { BankingTab } from "@/components/fund-tabs/banking-tab";
import { RequestCloseDialog } from "@/components/fund-tabs/request-close-dialog";

const TABS = ["todos", "details", "team", "investors", "documents", "banking", "taxes", "assets", "closes"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/client/funds/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund - Harmonious client portal" },
      { name: "description", content: "Fund details, investors, banking, taxes, assets and closes for your fund." },
      { property: "og:title", content: "Fund - Harmonious client portal" },
      { property: "og:description", content: "Fund details, investors, banking, taxes, assets and closes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
  }),
  component: ClientFundPage,
});

const usd = (c: number | null | undefined) =>
  typeof c === "number" ? (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "-";
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not recorded";

const CLOSE_STATUS: Record<string, string> = {
  submitted: "Submitted - Harmonious reviewing",
  in_review: "In review",
  completed: "Completed",
  returned: "Returned",
  approved: "Approved - filings in progress",
};

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function ClientFundPage() {
  const { fundId } = Route.useParams();
  const { tab = "todos" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [closeOpen, setCloseOpen] = useState(false);
  const loadFund = useServerFn(getClientFund);
  const loadCap = useServerFn(getFundCapTable);
  const loadTabs = useServerFn(getFundTabsData);
  const loadCloses = useServerFn(listFundCloseRequests);
  const fq = useQuery({ queryKey: ["client-fund", fundId], queryFn: () => loadFund({ data: { fundId } }) });
  const cq = useQuery({ queryKey: ["client-fund-cap", fundId], queryFn: () => loadCap({ data: { fundId } }) });
  const tq = useQuery({ queryKey: ["client-fund-tabs", fundId], queryFn: () => loadTabs({ data: { fundId } }) });
  const crq = useQuery({ queryKey: ["client-fund-closes", fundId], queryFn: () => loadCloses({ data: { fundId } }) });

  if (fq.isLoading) return <p className="text-sm text-muted-foreground">Loading fund…</p>;
  if (fq.error || !fq.data) return <p className="text-sm text-destructive">{(fq.error as any)?.message ?? "Couldn't load this fund."}</p>;
  const { setup, steps, sideLetters } = fq.data;
  const f = fq.data.fund as any;
  const pending = steps.filter((s) => !s.done);
  const cap = cq.data;
  const td = tq.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/client/funds" className="text-xs text-muted-foreground hover:underline">← All funds</Link>
          <h2 className="text-xl font-semibold tracking-tight">{f.name}</h2>
          <p className="text-sm text-muted-foreground">{f.legal_entity_name || "Legal name not recorded"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={f.is_open ? "default" : "secondary"}>{f.is_open ? "Open to investors" : "In setup"}</Badge>
          <Button onClick={() => setCloseOpen(true)}>Request Fund Close</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "Setup complete", v: setup.percent == null ? "-" : `${setup.percent}%` },
          { l: "Investors", v: cap ? String(cap.totals.investors) : "-" },
          { l: "Committed", v: cap ? usd(cap.totals.commitCents) : "-" },
          { l: "Funded (reconciled)", v: cap ? usd(cap.totals.fundedCents) : "-" },
        ].map((k) => (
          <Card key={k.l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.l}</p><p className="text-xl font-semibold">{k.v}</p></CardContent></Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Tab }, replace: true })}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="todos">To dos{steps.filter((s) => s.owner === "You" && !s.done && s.status !== "review" && !s.answer?.trim()).length ? ` (${steps.filter((s) => s.owner === "You" && !s.done && s.status !== "review" && !s.answer?.trim()).length})` : ""}</TabsTrigger>
          <TabsTrigger value="details">Fund Details</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="investors">Investors</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="banking">Banking</TabsTrigger>
          <TabsTrigger value="taxes">Taxes</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="closes">Closes</TabsTrigger>
        </TabsList>

        <TabsContent value="todos"><TodosTab fundId={fundId} steps={steps.filter((s) => s.owner === "You" && !s.done) as any} /></TabsContent>
        <TabsContent value="team"><TeamTab fundId={fundId} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab fundId={fundId} /></TabsContent>

        <TabsContent value="details" className="space-y-5">
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
                    {!s.done && <Badge variant="outline" className="ml-auto">{s.status === "review" ? "Sent - Harmonious reviewing" : s.owner === "Harmonious" ? "Harmonious - pending" : "Waiting on you"}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="investors"><InvestorsTab fundId={fundId} /></TabsContent>

        <TabsContent value="banking" className="space-y-5">
          {!!td?.banks.length && (
            <Card>
              <CardHeader><CardTitle className="text-base">Connected accounts</CardTitle></CardHeader>
              <CardContent className="divide-y">
                {td.banks.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div><p className="font-medium">{b.institution || "Bank"}{b.mask ? ` ${b.mask}` : ""}</p><p className="text-xs text-muted-foreground">{b.name || "Operating account"}</p></div>
                    <Badge variant="outline" className="capitalize">{b.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <BankingTab fundId={fundId} />
        </TabsContent>

        <TabsContent value="taxes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Taxes</CardTitle>
              <CardDescription>For your information. Harmonious prepares tax work; nothing is filed from here.</CardDescription>
            </CardHeader>
            <CardContent>
              {tq.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
               !td?.taxDocs.length ? <Empty text="No tax documents yet." /> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Year</th><th>Document</th><th>File</th><th>Status</th></tr></thead>
                  <tbody>
                    {td.taxDocs.map((d: any) => (
                      <tr key={d.id} className="border-t">
                        <td className="py-2">{d.tax_year ?? "-"}</td>
                        <td className="uppercase">{String(d.doc_type).replace(/_/g, " ")}</td>
                        <td className="text-muted-foreground">{d.file_name}</td>
                        <td className="capitalize">{d.review_status ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assets</CardTitle>
              <CardDescription>For your information. Values show the latest approved valuation.</CardDescription>
            </CardHeader>
            <CardContent>
              {tq.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
               !td?.assets.length ? <Empty text="No portfolio assets recorded yet." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Asset</th><th>Type</th><th>Acquired</th><th className="text-right">Cost</th><th className="text-right">Latest value</th><th>Status</th></tr></thead>
                    <tbody>
                      {td.assets.map((a: any) => (
                        <tr key={a.id} className="border-t">
                          <td className="py-2"><p className="font-medium">{a.asset_name}</p>{a.issuer_name && <p className="text-xs text-muted-foreground">{a.issuer_name}</p>}</td>
                          <td className="capitalize">{[a.asset_class, a.instrument].filter(Boolean).join(" · ").replace(/_/g, " ") || "-"}</td>
                          <td>{fmtDate(a.acquisition_date)}</td>
                          <td className="text-right">{usd(a.cost_basis_cents == null ? null : Number(a.cost_basis_cents))}</td>
                          <td className="text-right">{a.latestValueCents == null ? "-" : usd(Number(a.latestValueCents))}</td>
                          <td className="capitalize">{a.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closes">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Closes</CardTitle>
                <CardDescription>Close requests are reviewed by Harmonious before anything happens.</CardDescription>
              </div>
              <Button size="sm" onClick={() => setCloseOpen(true)}>Request Fund Close</Button>
            </CardHeader>
            <CardContent>
              {crq.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
               !crq.data?.length ? <Empty text="No close requests yet." /> : (
                <div className="divide-y rounded-md border">
                  {crq.data.map((c: any) => (
                    <div key={c.id} className="space-y-1 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Requested {fmtDate(c.created_at)} · {c.onboarding_ids.length} investor{c.onboarding_ids.length === 1 ? "" : "s"}</p>
                        <Badge variant={c.status === "completed" ? "default" : c.status === "returned" ? "destructive" : "secondary"}>{CLOSE_STATUS[c.status] ?? c.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Target close date: {c.target_date ? fmtDate(c.target_date) : "Not set"}</p>
                      {c.notes && <p className="text-xs">{c.notes}</p>}
                      {c.staff_note && <p className="text-xs text-muted-foreground">Harmonious: {c.staff_note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RequestCloseDialog fundId={fundId} open={closeOpen} onOpenChange={setCloseOpen} onDone={() => navigate({ search: { tab: "closes" }, replace: true })} />
    </div>
  );
}
