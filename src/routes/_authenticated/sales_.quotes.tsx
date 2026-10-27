import { SearchablePeoplePicker } from "@/components/ui/searchable-people-picker";
import { SalesDealDocsTabs } from "@/components/sales-deal-docs-tabs";
import { DealPicker } from "@/components/sales/deal-picker";
import { getAboutHarmoniousText, getSalesDocumentOptions } from "@/lib/sales-documents.functions";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BILLING_FREQUENCIES } from "@/lib/invoice-schedule-model";
import { changeQuoteBilling, changeRoasWhiteGloveBilling, hasRoasWhiteGloveCadences, defaultQuoteBilling, normalizeQuoteBilling, recurringQuoteRate } from "@/lib/quote-billing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SPV_TXN_KEY_PREFIX, feeGroup, FEE_GROUP_LABEL, type FeeGroup } from "@/lib/spv-transaction-pricing";
import { SERVICE_LADDERS, adminQuoteKey, ADMIN_QUOTE_KEY_PREFIX, type LadderProduct } from "@/lib/service-ladders";
import { standardInclusions } from "@/lib/service-inclusions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { draftQuoteFromSow, getQuoteCatalog, listSalesQuotes, listSowsForQuote, saveSalesQuote } from "@/lib/sales-hub.functions";
import { QUOTE_STATUS_LABEL } from "@/lib/sales-model";
import type { QuoteLineInput } from "@/lib/sales-model";
import { Panel, money } from "@/components/sales/sales-ui";
import { BookkeepingConfigurator } from "@/components/sales/bookkeeping-configurator";
import { getBookkeepingConfiguration } from "@/lib/bookkeeping.functions";
import { BOOKKEEPING_KEY, type BookkeepingInput } from "@/lib/bookkeeping-model";
import { Switch } from "@/components/ui/switch";
import { isQuoteSectionShown, quoteLockFacts, quoteSectionBody, quoteSectionDef, sanitizeQuoteSections } from "@/lib/quote-sections-model";
import type { Section } from "@/lib/sales-documents-model";

export const Route = createFileRoute("/_authenticated/sales_/quotes")({
  head: () => ({
    meta: [
      { title: "Quotes | Harmonious Sales" },
      { name: "description", content: "Build quotes from the Harmonious rate card, get approval and turn them into SOW and MSA agreements." },
      { property: "og:title", content: "Quotes | Harmonious Sales" },
      { property: "og:description", content: "Draft, approve, send and sign quotes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuotesPage,
});

function QuotesPage() {
  const load = useServerFn(listSalesQuotes);
  const q = useQuery({ queryKey: ["sales-quotes"], queryFn: () => load() });
  const [building, setBuilding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const all = (q.data?.quotes ?? []) as any[];
  const archivedCount = all.filter((r) => r.archived_at).length;
  const shown = all.filter((r) => showArchived ? !!r.archived_at : !r.archived_at);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <SalesDealDocsTabs />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl">Quotes</h1><p className="mt-1 text-sm text-muted-foreground">Draft → Approval → Sent → Signed. Approved quotes become SOW (and MSA) drafts in the existing agreement flow. To build a quote, proposal, MSA and SOW in one place, use <Link to="/sales/documents" className="underline">Proposals &amp; RFPs</Link>.</p></div>
        {q.data?.canDraft && <Button onClick={() => setBuilding(true)}>New quote</Button>}
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {building && <QuoteBuilder onCancel={() => setBuilding(false)} />}
      {q.data?.canDraft && <FromSow />}
      <Panel title={showArchived ? "Archived quotes" : "All quotes"}>
        {(archivedCount > 0 || showArchived) && <div className="mb-3"><Button size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Back to active quotes" : `Show archived (${archivedCount})`}</Button></div>}
        <Table>
          <TableHeader><TableRow><TableHead>Quote</TableHead><TableHead>Client</TableHead><TableHead>Fund</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell><Link to="/sales/quotes/$id" params={{ id: r.id }} className="font-medium text-foreground hover:underline">Q-{r.quote_number} v{r.version} · {r.title}</Link></TableCell>
                <TableCell>{r.clientName ?? "-"}</TableCell>
                <TableCell>{r.fundName ?? "-"}</TableCell>
                <TableCell>{r.ownerName}</TableCell>
                <TableCell><Badge variant={r.status === "signed" ? "default" : "secondary"}>{QUOTE_STATUS_LABEL[r.status] ?? r.status}</Badge>{r.needs_exec_approval && r.status === "pending_approval" && <Badge variant="outline" className="ml-1">CEO/CRO</Badge>}</TableCell>
                <TableCell className="text-right">{money(r.total_cents)}</TableCell>
              </TableRow>
            ))}
            {q.data && !q.data.quotes.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No quotes yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Panel>
    </main>
  );
}

function FromSow() {
  const nav = useNavigate();
  const [clientId, setClientId] = useState<string | null>(null);
  const [sowId, setSowId] = useState<string | null>(null);
  const cat = useServerFn(getQuoteCatalog);
  const c = useQuery({ queryKey: ["quote-catalog", null], queryFn: () => cat({ data: { clientId: null } }) });
  const sowFn = useServerFn(listSowsForQuote);
  const sows = useQuery({ queryKey: ["quote-sows", clientId], enabled: !!clientId, queryFn: () => sowFn({ data: { clientId: clientId! } }) });
  const draft = useServerFn(draftQuoteFromSow);
  const m = useMutation({ mutationFn: () => draft({ data: { sowId: sowId! } }), onSuccess: (r) => { toast.success("Quote drafted from SOW"); nav({ to: "/sales/quotes/$id", params: { id: r.id } }); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Panel title="Draft a quote from an SOW">
      <div className="flex flex-wrap gap-2">
        <SearchablePeoplePicker value={clientId ?? ""} onValueChange={(v) => { setClientId(v); setSowId(null); }}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>{(c.data?.clients ?? []).map((cl: any) => <SelectItem key={cl.id} value={cl.id}>{cl.legal_name}</SelectItem>)}</SelectContent>
        </SearchablePeoplePicker>
        <Select value={sowId ?? ""} onValueChange={setSowId} disabled={!clientId}>
          <SelectTrigger className="w-72"><SelectValue placeholder={clientId && sows.data && !sows.data.length ? "No SOWs for this client" : "SOW"} /></SelectTrigger>
          <SelectContent>{(sows.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.title} · {s.status}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => m.mutate()} disabled={!sowId || m.isPending}>Draft quote</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Services are copied from the SOW and re-checked against the current rate card.</p>
    </Panel>
  );
}

type Line = QuoteLineInput;

/** Product first, then only the levels valid for that product. */
function AdminLevelPicker({ onAdd, lines }: { onAdd: (key: string) => void; lines: any[] }) {
  const [product, setProduct] = useState<LadderProduct | "">("");
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Select value="" onValueChange={onAdd}>
        <SelectTrigger className="w-72"><SelectValue placeholder="Harmonized SPV (by raise)" /></SelectTrigger>
        <SelectContent>{lines.filter((l) => String(l.serviceKey).startsWith(SPV_TXN_KEY_PREFIX)).map((l) => <SelectItem key={l.serviceKey} value={l.serviceKey}>{l.label} · ${(l.baselineCents / 100).toLocaleString("en-US")}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={product} onValueChange={(v) => setProduct(v as LadderProduct)}>
        <SelectTrigger className="w-56"><SelectValue placeholder="Administration product" /></SelectTrigger>
        <SelectContent>{(Object.keys(SERVICE_LADDERS) as LadderProduct[]).map((p) => <SelectItem key={p} value={p}>{SERVICE_LADDERS[p].label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value="" onValueChange={onAdd} disabled={!product}>
        <SelectTrigger className="w-72"><SelectValue placeholder="Service level" /></SelectTrigger>
        <SelectContent>{product ? SERVICE_LADDERS[product].levels.map((l) => {
          const line = lines.find((x) => x.serviceKey === adminQuoteKey(product, l.level));
          return line ? <SelectItem key={l.level} value={line.serviceKey}>{l.name} · {line.baselineCents ? `$${(line.baselineCents / 100).toLocaleString("en-US")}` : "Included"}</SelectItem> : null;
        }) : null}</SelectContent>
      </Select>
    </div>
  );
}

export function QuoteBuilder({ onCancel, initial }: { onCancel: () => void; initial?: { id: string; title: string; clientId: string | null; contactId?: string | null; offeringId?: string | null; dealId?: string | null; validUntil: string | null; notes: string | null; expectedUpdatedAt?: string; sections?: unknown; lines: Line[] } }) {
  const qc = useQueryClient();
  const [dealId, setDealId] = useState<string>(initial?.dealId ?? "");
  const optFn = useServerFn(getSalesDocumentOptions);
  const opts = useQuery({ queryKey: ["sales-document-options"], queryFn: () => optFn() });
  const nav = useNavigate();
  const [clientId, setClientId] = useState<string | null>(initial?.clientId ?? null);
  const [offeringId, setOfferingId] = useState<string | null>(initial?.offeringId ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [sections, setSections] = useState<Section[]>(() => sanitizeQuoteSections(initial?.sections ?? null));
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const [openDetails, setOpenDetails] = useState<number | null>(null);
  const [showBookkeeping, setShowBookkeeping] = useState(false);
  const loadBookkeeping = useServerFn(getBookkeepingConfiguration);
  const bookkeeping = useQuery({ queryKey: ["bookkeeping-proposed-configuration"], queryFn: () => loadBookkeeping(), enabled: showBookkeeping });
  const cat = useServerFn(getQuoteCatalog);
  const c = useQuery({ queryKey: ["quote-catalog", clientId], queryFn: () => cat({ data: { clientId } }) });
  const save = useServerFn(saveSalesQuote);
  const m = useMutation({
    mutationFn: () => save({ data: { id: initial?.id ?? null, title, clientId, contactId: clientId === initial?.clientId ? initial?.contactId ?? null : null, offeringId, dealId: dealId || null, validUntil: validUntil || null, notes: notes || null, expectedUpdatedAt: initial?.expectedUpdatedAt, sections, lines } }),
    onSuccess: (r) => { toast.success("Quote saved"); qc.invalidateQueries(); onCancel(); nav({ to: "/sales/quotes/$id", params: { id: r.id } }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const aboutFn = useServerFn(getAboutHarmoniousText);
  const about = useQuery({ queryKey: ["about-harmonious-text"], queryFn: () => aboutFn() });
  const clientName = (c.data?.clients ?? []).find((x: any) => x.id === clientId)?.legal_name ?? null;
  const facts = quoteLockFacts({ organization: clientName, contactName: null, lines });
  const displayLines = lines.map(l => {
    const rate = c.data?.lines.find((r: any) => r.serviceKey === l.serviceKey);
    return rate && !l.bookkeeping ? normalizeQuoteBilling(l, rate) : l;
  });
  const total = displayLines.reduce((s, l) => s + Math.round(l.quantity * l.unitCents), 0);
  const baseline = displayLines.reduce((s, l) => s + Math.round(l.quantity * l.baselineUnitCents), 0);
  const belowBaseline = displayLines.some(l => l.unitCents < l.baselineUnitCents);
  const add = (key: string) => {
    const it = c.data?.lines.find((l: any) => l.serviceKey === key);
    if (it) { const std = standardInclusions(it.serviceKey); const billingFrequency = defaultQuoteBilling(it); const added = normalizeQuoteBilling({ serviceKey: it.serviceKey, label: it.label, quantity: 1, unitCents: it.baselineCents, baselineUnitCents: it.baselineCents, billingFrequency, details: std ? { included: std.included, excluded: std.excluded } : undefined }, it); setLines([...lines, { ...added, unitCents: added.baselineUnitCents }]); }
  };
  return (
    <Panel title={initial ? "Edit quote" : "New quote"}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Input placeholder="Quote title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <SearchablePeoplePicker value={clientId ?? "none"} onValueChange={(v) => { setClientId(v === "none" ? null : v); setOfferingId(null); setLines(previous => previous.filter(l => !l.bookkeeping)); }}>
          <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent><SelectItem value="none">Choose client…</SelectItem>{(c.data?.clients ?? []).map((cl: any) => <SelectItem key={cl.id} value={cl.id}>{cl.legal_name}</SelectItem>)}</SelectContent>
        </SearchablePeoplePicker>
        <Select value={offeringId ?? "none"} onValueChange={(v) => setOfferingId(v === "none" ? null : v)} disabled={!clientId}>
          <SelectTrigger aria-label="Fund"><SelectValue placeholder="Fund" /></SelectTrigger>
          <SelectContent><SelectItem value="none">{clientId && !(c.data?.funds ?? []).length ? "No funds for this client" : "No fund (client-wide)"}</SelectItem>{(c.data?.funds ?? []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" aria-label="Valid until" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </div>
      <div className="mt-3 max-w-xl space-y-1 text-sm"><span>Deal</span>
        <DealPicker deals={opts.data?.deals ?? []} value={dealId} clientId={clientId} contactId={clientId === initial?.clientId ? initial?.contactId ?? null : null} defaultTitle={title}
          onChange={(d) => { setDealId(d?.id ?? ""); if (d?.client_id && !clientId) setClientId(d.client_id); }} /></div>
      <AdminLevelPicker onAdd={add} lines={c.data?.lines ?? []} />
      <div className="mt-4">
        <Button variant="outline" onClick={() => setShowBookkeeping(v => !v)}>{showBookkeeping ? "Close bookkeeping" : "Configure Bookkeeping & Accounting"}</Button>
        {showBookkeeping && bookkeeping.error && <p className="mt-2 text-sm text-destructive">{(bookkeeping.error as Error).message}</p>}
        {showBookkeeping && bookkeeping.data && <BookkeepingConfigurator configuration={bookkeeping.data.configuration} versionId={bookkeeping.data.versionId} onAdd={(input, invoiceCents) => { setLines(previous => [...previous, { serviceKey: BOOKKEEPING_KEY, label: `Bookkeeping & Accounting · ${input.tier.replace("_", " ")}`, quantity: 1, unitCents: invoiceCents, baselineUnitCents: invoiceCents, billingFrequency: input.billing, firstBillOn: input.effectiveOn, bookkeeping: input }]); setShowBookkeeping(false); }} />}
        <Select value="" onValueChange={add}><SelectTrigger className="w-72"><SelectValue placeholder="Add a service from the rate card" /></SelectTrigger>
          <SelectContent>{(c.data?.lines ?? []).filter((l: any) => !String(l.serviceKey).startsWith(ADMIN_QUOTE_KEY_PREFIX) && !String(l.serviceKey).startsWith(SPV_TXN_KEY_PREFIX)).map((l: any) => <SelectItem key={l.serviceKey} value={l.serviceKey}>{l.label} · {money(l.baselineCents)}</SelectItem>)}</SelectContent></Select>
      </div>
      <Table className="mt-3">
        <TableHeader><TableRow><TableHead>Service</TableHead><TableHead className="w-24">Qty</TableHead><TableHead className="w-36">Price ($)</TableHead><TableHead className="w-32">Billed</TableHead><TableHead className="w-36">First bill</TableHead><TableHead className="text-right">Rate card</TableHead><TableHead className="text-right">Line</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(["one_time", "annual", "event"] as FeeGroup[]).flatMap((g) => {
            const rows = displayLines.map((l, i) => ({ l, i })).filter(({ l }) => {
              const rate = c.data?.lines.find((x: any) => x.serviceKey === l.serviceKey);
              return (rate && recurringQuoteRate(rate) ? "annual" : feeGroup(l.serviceKey, rate?.pricingModel)) === g;
            });
            if (!rows.length) return [];
            const sub = rows.reduce((s, { l }) => s + l.quantity * l.unitCents, 0);
            return [<TableRow key={`h-${g}`}><TableCell colSpan={6} className="bg-muted/40 text-xs font-semibold uppercase tracking-wide">{g === "annual" ? "Recurring fees" : FEE_GROUP_LABEL[g]}</TableCell><TableCell className="bg-muted/40 text-right text-xs font-semibold">{money(sub)}</TableCell><TableCell className="bg-muted/40" /></TableRow>,
              ...rows.flatMap(({ l, i }) => [
            <TableRow key={i}>
              <TableCell>{l.label}</TableCell>
              <TableCell><Input disabled={!!l.bookkeeping} inputMode="decimal" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x)))} /></TableCell>
              <TableCell><Input disabled={!!l.bookkeeping} inputMode="decimal" value={l.unitCents / 100} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCents: Math.round((Number(e.target.value) || 0) * 100) } : x)))} /></TableCell>
              <TableCell><Select disabled={!!l.bookkeeping} value={l.billingFrequency ?? "one_time"} onValueChange={(value) => {
                const frequency = BILLING_FREQUENCIES.find(f => f.id === value)?.id;
                if (!frequency) return;
                const rate = c.data?.lines.find((r: any) => r.serviceKey === l.serviceKey);
                setLines(lines.map((x, j) => j === i ? rate ? hasRoasWhiteGloveCadences(offeringId, l.serviceKey) ? changeRoasWhiteGloveBilling(l, rate, frequency) : changeQuoteBilling(l, rate, frequency) : { ...x, billingFrequency: frequency } : x));
              }}><SelectTrigger aria-label={`Billing frequency for ${l.label}`}><SelectValue /></SelectTrigger><SelectContent>{BILLING_FREQUENCIES.filter(f => {
                const rate = c.data?.lines.find((r: any) => r.serviceKey === l.serviceKey);
                return !rate || !recurringQuoteRate(rate) || f.id === "quarterly" || f.id === "annual" || f.id === l.billingFrequency || f.id === "monthly" && hasRoasWhiteGloveCadences(offeringId, l.serviceKey);
              }).map(f => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent></Select></TableCell>
              <TableCell><Input disabled={!!l.bookkeeping} type="date" aria-label="First billing date" value={l.firstBillOn ?? ""} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, firstBillOn: e.target.value || null } : x)))} /></TableCell>
              <TableCell className="text-right text-muted-foreground">{money(l.baselineUnitCents)}{l.unitCents < l.baselineUnitCents && <Badge variant="destructive" className="ml-1">Discount</Badge>}</TableCell>
              <TableCell className="text-right">{money(l.quantity * l.unitCents)}{l.billingFrequency && l.billingFrequency !== "one_time" && <span className="block text-xs text-muted-foreground">per {l.billingFrequency === "annual" ? "year" : l.billingFrequency === "quarterly" ? "quarter" : "month"}</span>}</TableCell>
              <TableCell className="whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => setOpenDetails(openDetails === i ? null : i)}>{l.details ? "Details ✓" : "Details"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button>
              </TableCell>
            </TableRow>,
            ...(openDetails === i ? [<TableRow key={`d-${i}`}><TableCell colSpan={8} className="bg-muted/20">
              <div className="grid gap-3 py-1 sm:grid-cols-3">
                <div><Label>Extra scope detail (optional)</Label><Textarea rows={3} value={l.details?.scope ?? ""} placeholder="Anything specific to this engagement" onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, details: { ...x.details, scope: e.target.value } } : x))} /></div>
                <div><Label>What is included (one per line)</Label><Textarea rows={3} value={(l.details?.included ?? []).join("\n")} placeholder="Monthly NAV report&#10;Investor portal access" onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, details: { ...x.details, included: e.target.value.split("\n") } } : x))} /></div>
                <div><Label>Explicitly not included (one per line)</Label><Textarea rows={3} value={(l.details?.excluded ?? []).join("\n")} placeholder="Audit representation&#10;Tax advice" onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, details: { ...x.details, excluded: e.target.value.split("\n") } } : x))} /></div>
              </div>
              <p className="text-xs text-muted-foreground">This wording appears under the service on the proposal and the Statement of Work the client signs.</p>
            </TableCell></TableRow>] : []),
          ])];
          })}
        </TableBody>
      </Table>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Rate card {money(baseline)} · Quote <span className="font-semibold text-foreground">{money(total)}</span>{belowBaseline && " · below rate card: needs CEO or CRO approval"}</span>
        <Input className="max-w-sm" placeholder="Notes for the approver" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="mt-4 rounded-lg border bg-card p-4">
        <h3 className="font-heading font-semibold">Sections shown to the client</h3>
        <p className="mt-1 text-xs text-muted-foreground">Every part of the quote has a switch. Switching one off hides it from the client, the wording is kept, nothing is deleted.</p>
        <div className="mt-3 space-y-2">
          {sections.map((s, i) => {
            const def = quoteSectionDef(s.key);
            const shown = isQuoteSectionShown(s);
            const preview = (def?.generated ? quoteSectionBody(s, facts, about.data?.body ?? null) : s.key === "notes" ? notes : s.body).trim();
            return (
              <div key={s.key} className={`rounded-lg border p-3 ${shown ? "" : "opacity-60"}`}>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0"><span className="font-medium">{s.title}</span><span className="ml-2 text-xs text-muted-foreground">{def?.hint}</span></span>
                  <Switch aria-label={`Show ${s.title} to the client`} checked={shown} onCheckedChange={(v) => setSections(sections.map((x, j) => (j === i ? { ...x, included: v } : x)))} />
                </label>
                {shown && (s.key === "timeline" || s.key === "next") ? (
                  <Textarea rows={3} className="mt-2" placeholder={`What the client should see under ${s.title.toLowerCase()}`} value={s.body} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                ) : shown ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{preview || "Nothing written yet."}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex gap-2"><Button onClick={() => m.mutate()} disabled={m.isPending || !lines.length}>Save draft</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </Panel>
  );
}
