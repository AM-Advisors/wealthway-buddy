import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCommissions, saveCommissionRates, saveQuoteBdr } from "@/lib/sales-hub.functions";
import { LAYER_LABEL, type CommissionLayer, type CommissionRates } from "@/lib/commission-model";
import { Panel, PeriodFilter, Stat, money, usePeriod } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/commissions")({
  head: () => ({
    meta: [
      { title: "Commissions - Harmonious Sales" },
      { name: "description", content: "Sales commissions earned on closed and paid deals." },
      { property: "og:title", content: "Commissions - Harmonious Sales" },
      { property: "og:description", content: "Track commission earned and pending for every sales role." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Commissions,
});

const RATE_FIELDS: { key: keyof CommissionRates; label: string }[] = [
  { key: "ae", label: "Account Executive" }, { key: "ae_cap_table", label: "Account Executive (Cap Table)" },
  { key: "sales_manager", label: "Sales Manager" }, { key: "cro", label: "CRO" }, { key: "ceo", label: "CEO" }, { key: "bdr", label: "BDR (when used)" },
];

function Commissions() {
  const [period, setPeriod] = usePeriod("quarter");
  const load = useServerFn(getCommissions);
  const saveRates = useServerFn(saveCommissionRates);
  const saveBdr = useServerFn(saveQuoteBdr);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["commissions", period], queryFn: () => load({ data: period }), enabled: period.period !== "custom" || Boolean(period.from && period.to) });
  const d = q.data;
  const [draft, setDraft] = useState<CommissionRates | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => { if (d && !draft) setDraft(d.rates); }, [d, draft]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["commissions"] });

  const submitRates = async () => {
    if (!draft) return;
    try { await saveRates({ data: { rates: draft, reason } }); toast.success("Commission rates updated"); setReason(""); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const earned = d?.people.reduce((s, p) => s + p.earnedCents, 0) ?? 0;
  const pending = d?.people.reduce((s, p) => s + p.pendingCents, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Commissions</h1>
          <p className="text-sm text-muted-foreground">Earned once the client pays the invoice. When a higher title runs and closes a deal, the lower levels stack to them.</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Earned (paid invoices)" value={money(earned)} />
        <Stat label="Pending (awaiting payment)" value={money(pending)} />
        <Stat label="People with commission" value={d?.people.filter((p) => p.userId).length ?? 0} />
      </div>

      <Panel title="By person">
        <Table>
          <TableHeader><TableRow><TableHead>Person</TableHead><TableHead className="text-right">Earned</TableHead><TableHead className="text-right">Pending</TableHead></TableRow></TableHeader>
          <TableBody>
            {(d?.people ?? []).map((p) => (
              <TableRow key={p.userId ?? "none"}><TableCell>{p.name}</TableCell><TableCell className="text-right">{money(p.earnedCents)}</TableCell><TableCell className="text-right">{money(p.pendingCents)}</TableCell></TableRow>
            ))}
            {!q.isLoading && !d?.people.length && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No commissions yet. They appear once a signed quote is invoiced.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Detail">
        <Table>
          <TableHeader><TableRow><TableHead>Client / quote</TableHead><TableHead>Invoice</TableHead><TableHead>Service</TableHead><TableHead>Role share</TableHead><TableHead>Person</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {(d?.rows ?? []).map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.client}<div className="text-xs text-muted-foreground">{r.quoteNumber}</div></TableCell>
                <TableCell>{r.invoice}</TableCell>
                <TableCell>{r.service}{r.capTable && <Badge variant="secondary" className="ml-2">Cap Table</Badge>}</TableCell>
                <TableCell>{LAYER_LABEL[r.layer as CommissionLayer]}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{r.ratePct}%</TableCell>
                <TableCell className="text-right">{money(r.amountCents)}</TableCell>
                <TableCell>{r.paid ? <Badge>Earned</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      {d && d.quotes.length > 0 && (
        <Panel title="BDR on signed deals">
          <div className="space-y-2">
            {d.quotes.map((qt) => (
              <div key={qt.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{qt.label}</span>
                <select className="rounded-md border bg-background px-2 py-1" value={qt.bdrUserId ?? ""}
                  onChange={async (e) => { try { await saveBdr({ data: { quoteId: qt.id, bdrId: e.target.value || null } }); toast.success("BDR saved"); refresh(); } catch (err) { toast.error((err as Error).message); } }}>
                  <option value="">No BDR</option>
                  {d.bdrs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Commission rates">
        <div className="grid gap-3 sm:grid-cols-3">
          {RATE_FIELDS.map((f) => (
            <label key={f.key} className="space-y-1 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <div className="flex items-center gap-1">
                <Input type="number" step="0.5" min={0} max={50} disabled={!d?.canEdit} value={draft?.[f.key] ?? ""}
                  onChange={(e) => draft && setDraft({ ...draft, [f.key]: Number(e.target.value) })} />
                <span>%</span>
              </div>
            </label>
          ))}
        </div>
        {d?.canEdit ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Input className="max-w-md" placeholder="Reason for the change (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button onClick={submitRates} disabled={reason.trim().length < 3}>Save new rates</Button>
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">Only the CRO or CEO can change rates.</p>}
        {d && d.history.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            {d.history.map((h) => <li key={h.id}>{new Date(h.effective_at).toLocaleDateString()} - {h.setByName}: {h.reason}</li>)}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">New rates apply to invoices paid from the change onward; earlier payments keep the rates in effect then.</p>
      </Panel>
    </div>
  );
}
