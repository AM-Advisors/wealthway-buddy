import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERVICE_LADDERS, adminQuoteKey, ADMIN_QUOTE_KEY_PREFIX, type LadderProduct } from "@/lib/service-ladders";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { draftQuoteFromSow, getQuoteCatalog, listSalesQuotes, listSowsForQuote, saveSalesQuote } from "@/lib/sales-hub.functions";
import { QUOTE_STATUS_LABEL } from "@/lib/sales-model";
import { Panel, money } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/quotes")({
  head: () => ({
    meta: [
      { title: "Quotes - Harmonious Sales" },
      { name: "description", content: "Build quotes from the Harmonious rate card, get approval and turn them into SOW and MSA agreements." },
      { property: "og:title", content: "Quotes - Harmonious Sales" },
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
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl">Quotes</h1><p className="mt-1 text-sm text-muted-foreground">Draft → Approval → Sent → Signed. Approved quotes become SOW (and MSA) drafts in the existing agreement flow.</p></div>
        {q.data?.canDraft && <Button onClick={() => setBuilding(true)}>New quote</Button>}
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {building && <QuoteBuilder onCancel={() => setBuilding(false)} />}
      {q.data?.canDraft && <FromSow />}
      <Panel title="All quotes">
        <Table>
          <TableHeader><TableRow><TableHead>Quote</TableHead><TableHead>Client</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data?.quotes ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell><Link to="/sales/quotes/$id" params={{ id: r.id }} className="font-medium text-foreground hover:underline">Q-{r.quote_number} v{r.version} · {r.title}</Link></TableCell>
                <TableCell>{r.clientName ?? "-"}</TableCell>
                <TableCell>{r.ownerName}</TableCell>
                <TableCell><Badge variant={r.status === "signed" ? "default" : "secondary"}>{QUOTE_STATUS_LABEL[r.status] ?? r.status}</Badge>{r.needs_exec_approval && r.status === "pending_approval" && <Badge variant="outline" className="ml-1">CEO/CRO</Badge>}</TableCell>
                <TableCell className="text-right">{money(r.total_cents)}</TableCell>
              </TableRow>
            ))}
            {q.data && !q.data.quotes.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No quotes yet.</TableCell></TableRow>}
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
        <Select value={clientId ?? ""} onValueChange={(v) => { setClientId(v); setSowId(null); }}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>{(c.data?.clients ?? []).map((cl: any) => <SelectItem key={cl.id} value={cl.id}>{cl.legal_name}</SelectItem>)}</SelectContent>
        </Select>
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

type Line = { serviceKey: string; label: string; quantity: number; unitCents: number; baselineUnitCents: number };

/** Product first, then only the levels valid for that product. */
function AdminLevelPicker({ onAdd, lines }: { onAdd: (key: string) => void; lines: any[] }) {
  const [product, setProduct] = useState<LadderProduct | "">("");
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
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

export function QuoteBuilder({ onCancel, initial }: { onCancel: () => void; initial?: { id: string; title: string; clientId: string | null; validUntil: string | null; notes: string | null; lines: Line[] } }) {
  const nav = useNavigate();
  const [clientId, setClientId] = useState<string | null>(initial?.clientId ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const cat = useServerFn(getQuoteCatalog);
  const c = useQuery({ queryKey: ["quote-catalog", clientId], queryFn: () => cat({ data: { clientId } }) });
  const save = useServerFn(saveSalesQuote);
  const m = useMutation({
    mutationFn: () => save({ data: { id: initial?.id ?? null, title, clientId, validUntil: validUntil || null, notes: notes || null, lines } }),
    onSuccess: (r) => { toast.success("Quote saved"); onCancel(); nav({ to: "/sales/quotes/$id", params: { id: r.id } }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const total = lines.reduce((s, l) => s + l.quantity * l.unitCents, 0);
  const baseline = lines.reduce((s, l) => s + l.quantity * l.baselineUnitCents, 0);
  const add = (key: string) => {
    const it = c.data?.lines.find((l: any) => l.serviceKey === key);
    if (it) setLines([...lines, { serviceKey: it.serviceKey, label: it.label, quantity: 1, unitCents: it.baselineCents, baselineUnitCents: it.baselineCents }]);
  };
  return (
    <Panel title={initial ? "Edit quote" : "New quote"}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input placeholder="Quote title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Select value={clientId ?? "none"} onValueChange={(v) => setClientId(v === "none" ? null : v)}>
          <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent><SelectItem value="none">Choose client…</SelectItem>{(c.data?.clients ?? []).map((cl: any) => <SelectItem key={cl.id} value={cl.id}>{cl.legal_name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" aria-label="Valid until" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </div>
      <AdminLevelPicker onAdd={add} lines={c.data?.lines ?? []} />
      <div className="mt-4">
        <Select value="" onValueChange={add}><SelectTrigger className="w-72"><SelectValue placeholder="Add a service from the rate card" /></SelectTrigger>
          <SelectContent>{(c.data?.lines ?? []).filter((l: any) => !String(l.serviceKey).startsWith(ADMIN_QUOTE_KEY_PREFIX)).map((l: any) => <SelectItem key={l.serviceKey} value={l.serviceKey}>{l.label} · {money(l.baselineCents)}</SelectItem>)}</SelectContent></Select>
      </div>
      <Table className="mt-3">
        <TableHeader><TableRow><TableHead>Service</TableHead><TableHead className="w-24">Qty</TableHead><TableHead className="w-36">Price ($)</TableHead><TableHead className="text-right">Rate card</TableHead><TableHead className="text-right">Line</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {lines.map((l, i) => (
            <TableRow key={i}>
              <TableCell>{l.label}</TableCell>
              <TableCell><Input inputMode="decimal" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x)))} /></TableCell>
              <TableCell><Input inputMode="decimal" value={l.unitCents / 100} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCents: Math.round((Number(e.target.value) || 0) * 100) } : x)))} /></TableCell>
              <TableCell className="text-right text-muted-foreground">{money(l.baselineUnitCents)}{l.unitCents < l.baselineUnitCents && <Badge variant="destructive" className="ml-1">Discount</Badge>}</TableCell>
              <TableCell className="text-right">{money(l.quantity * l.unitCents)}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Rate card {money(baseline)} · Quote <span className="font-semibold text-foreground">{money(total)}</span>{total < baseline && " · below rate card: needs CEO or CRO approval"}</span>
        <Input className="max-w-sm" placeholder="Notes for the approver" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="mt-4 flex gap-2"><Button onClick={() => m.mutate()} disabled={m.isPending || !lines.length}>Save draft</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </Panel>
  );
}
