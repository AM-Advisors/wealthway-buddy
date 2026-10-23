import { SearchableNativeSelect } from "@/components/ui/searchable-people-picker";
import { SalesDealDocsTabs } from "@/components/sales-deal-docs-tabs";
import { DealPicker } from "@/components/sales/deal-picker";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSalesDocument, createSalesProspect, getSalesDocumentOptions, listSalesDocuments, lookupSalesProspect, searchSalesProspects, getAboutHarmoniousText, saveAboutHarmoniousText } from "@/lib/sales-documents.functions";
import { getQuoteCatalog, saveSalesQuote } from "@/lib/sales-hub.functions";
import { BILLING_FREQUENCIES } from "@/lib/invoice-schedule-model";
import { money } from "@/components/sales/sales-ui";
import { DIRECTION_LABEL, KIND_LABEL, STATUS_LABEL, type DocDirection, type DocKind } from "@/lib/sales-documents-model";
import { Panel } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/documents")({
  head: () => ({
    meta: [
      { title: "Proposals & RFPs | Harmonious Sales" },
      { name: "description", content: "Generate proposals, RFP and RFQ responses and vendor requests with AI drafts and approval." },
      { property: "og:title", content: "Proposals & RFPs | Harmonious Sales" },
      { property: "og:description", content: "Standardized proposals, RFPs and RFQs built from the quote and the MSA, with Sales approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Documents,
});

const sel = "w-full rounded-md border bg-background px-2 py-2 text-sm";

function Documents() {
  const list = useServerFn(listSalesDocuments);
  const opts = useServerFn(getSalesDocumentOptions);
  const create = useServerFn(createSalesDocument);
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["sales-documents"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const o = useQuery({ queryKey: ["sales-document-options"], queryFn: () => opts(), enabled: open });
  const [f, setF] = useState({ kind: "proposal" as DocKind, direction: "response" as DocDirection, title: "", quoteId: "", dealId: "", contactId: "", clientId: "", recipientName: "", recipientEmail: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  // "client" is a response sent to an existing client (add-on services); stored as a response document.
  const [audience, setAudience] = useState<"prospect" | "client" | "vendor">("prospect");
  const [lines, setLines] = useState<SvcLine[]>([]);
  const saveQuote = useServerFn(saveSalesQuote);
  const [filter, setFilter] = useState("all");

  const submit = async () => {
    setBusy(true);
    try {
      const n = (v: string) => v || null;
      let quoteId = n(f.quoteId);
      if (f.direction === "response" && lines.length) {
        const qr = await saveQuote({ data: { id: null, title: f.title, clientId: n(f.clientId), contactId: n(f.contactId), dealId: n(f.dealId), validUntil: null, notes: null, lines } as any });
        quoteId = qr.id;
      }
      const r = await create({ data: { kind: f.kind, direction: f.direction, title: f.title, quoteId, dealId: n(f.dealId), contactId: n(f.contactId), clientId: n(f.clientId), recipientName: n(f.recipientName), recipientEmail: f.recipientEmail || null, dueDate: n(f.dueDate) } });
      nav({ to: "/sales/documents/$id", params: { id: r.id } });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const docs = (q.data?.documents ?? []).filter((d: any) => filter === "all" || d.kind === filter);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <SalesDealDocsTabs />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Proposals & RFPs</h1>
          <p className="text-sm text-muted-foreground">Summary, pricing, terms and About Harmonious are filled in from the quote and the published MSA. A Sales Manager or the CRO approves before it goes out.</p>
        </div>
        {q.data?.canCreate && <Button onClick={() => setOpen((v) => !v)}>{open ? "Close" : "New document"}</Button>}
      </div>

      {open && (
        <Panel title="New document">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>Type</span>
              <select className={sel} value={f.kind} onChange={(e) => { const k = e.target.value as DocKind; if (k === "proposal" && audience === "vendor") setAudience("prospect"); setF({ ...f, kind: k, direction: k === "proposal" ? "response" : f.direction }); }}>
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="space-y-1 text-sm"><span>Direction</span>
              <select className={sel} value={audience} onChange={(e) => { const a = e.target.value as typeof audience; setAudience(a); setF({ ...f, direction: a === "vendor" ? "outbound" : "response" }); }}>
                <option value="prospect">Response to prospect</option>
                <option value="client">Response to client</option>
                {f.kind !== "proposal" && <option value="vendor">{DIRECTION_LABEL.outbound}</option>}
              </select></label>
            {audience === "client" && (
              <label className="space-y-1 text-sm sm:col-span-2"><span>Client</span>
                <select className={sel} value={f.clientId} onChange={(e) => { const c = (o.data?.clients ?? []).find((x: any) => x.id === e.target.value); setF({ ...f, clientId: e.target.value, title: f.title || (c ? `${c.name} additional services` : f.title) }); }}>
                  <option value="">Choose a current client</option>
                  {(o.data?.clients ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <span className="block text-xs text-muted-foreground">Then pick who receives it under Contact, or look up their email below.</span></label>
            )}
            <div className="sm:col-span-2"><ProspectLookup label={audience === "client" ? "Client contact email" : audience === "vendor" ? "Vendor email lookup" : "Prospect email"} onResolved={(p) => setF((cur) => ({ ...cur, contactId: p.contactId ?? cur.contactId, clientId: p.clientId ?? cur.clientId, recipientEmail: p.email, recipientName: p.name ?? cur.recipientName, title: cur.title || (p.organization ? `${p.organization} proposal` : cur.title) }))} /></div>
            <label className="space-y-1 text-sm sm:col-span-2"><span>Title</span><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Fund administration proposal for Acme Ventures" /></label>
            {f.direction === "response" && (
              <div className="sm:col-span-2">
                <ServicePicker clientId={f.clientId || null} lines={lines} setLines={setLines} />
                {!lines.length && (
                  <label className="mt-2 block space-y-1 text-sm"><span className="text-muted-foreground">Or use an existing quote</span>
                    <select className={sel} value={f.quoteId} onChange={(e) => setF({ ...f, quoteId: e.target.value })}>
                      <option value="">No quote</option>
                      {(o.data?.quotes ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.quote_number} {x.title} ({x.status})</option>)}
                    </select></label>
                )}
              </div>
            )}
            <div className="space-y-1 text-sm"><span>Deal</span>
              <DealPicker deals={o.data?.deals ?? []} value={f.dealId} contactId={f.contactId || null} clientId={f.clientId || null} defaultTitle={f.title}
                onChange={(d) => setF({ ...f, dealId: d?.id ?? "", contactId: d?.contact_id ?? f.contactId, clientId: d?.client_id ?? f.clientId })} /></div>
            <label className="space-y-1 text-sm"><span>Contact</span>
              <SearchableNativeSelect className={sel} value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })}>
                <option value="">No contact</option>
                {f.contactId && !(o.data?.contacts ?? []).some((x: any) => x.id === f.contactId) && <option value={f.contactId}>{f.recipientName || f.recipientEmail || "Selected prospect"}</option>}
                {(o.data?.contacts ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.full_name}{x.organization ? ` · ${x.organization}` : ""}</option>)}
              </SearchableNativeSelect></label>
            <label className="space-y-1 text-sm"><span>Client</span>
              <select className={sel} value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
                <option value="">No client</option>
                {(o.data?.clients ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
            {f.direction === "outbound" && <>
              <label className="space-y-1 text-sm"><span>Vendor name</span><Input value={f.recipientName} onChange={(e) => setF({ ...f, recipientName: e.target.value })} /></label>
              <label className="space-y-1 text-sm"><span>Vendor email</span><Input type="email" value={f.recipientEmail} onChange={(e) => setF({ ...f, recipientEmail: e.target.value })} /></label>
            </>}
            <label className="space-y-1 text-sm"><span>Due date</span><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
          </div>
          <Button className="mt-4" disabled={busy || f.title.trim().length < 2} onClick={submit}>{busy ? "Creating..." : "Create and open"}</Button>
        </Panel>
      )}

      <div className="flex gap-2">
        {["all", "proposal", "rfp", "rfq"].map((k) => <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{k === "all" ? "All" : KIND_LABEL[k as DocKind]}</Button>)}
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Client</TableHead><TableHead>Owner</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {docs.map((d: any) => (
            <TableRow key={d.id}>
              <TableCell><Link to="/sales/documents/$id" params={{ id: d.id }} className="font-medium text-primary hover:underline">{d.title}</Link></TableCell>
              <TableCell>{KIND_LABEL[d.kind as DocKind]}<div className="text-xs text-muted-foreground">{DIRECTION_LABEL[d.direction as DocDirection]}</div></TableCell>
              <TableCell>{d.clientName ?? "-"}</TableCell>
              <TableCell>{d.ownerName}</TableCell>
              <TableCell>{d.due_date ?? "-"}</TableCell>
              <TableCell><Badge variant="outline">{STATUS_LABEL[d.status] ?? d.status}</Badge></TableCell>
            </TableRow>
          ))}
          {!q.isLoading && !docs.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">{q.error ? (q.error as Error).message : "No documents yet."}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <AboutHarmoniousEditor />
    </div>
  );
}

/** The one controlled About Harmonious paragraph every proposal uses. Only a Super Admin saves new versions. */
function AboutHarmoniousEditor() {
  const load = useServerFn(getAboutHarmoniousText);
  const save = useServerFn(saveAboutHarmoniousText);
  const q = useQuery({ queryKey: ["about-harmonious"], queryFn: () => load(), retry: false });
  const [draft, setDraft] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (q.error || !q.data || !q.data.canEdit) return null;
  const d = q.data;
  const body = draft ?? d.body;
  const submit = async () => {
    setBusy(true);
    try { const r = await save({ data: { body, reason: reason.trim() || null } }); toast.success(`Saved as version ${r.version}. Every proposal now uses it.`); setDraft(null); setReason(""); await q.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setBusy(false); }
  };
  return (
    <Panel title="About Harmonious wording">
      <p className="mb-2 text-sm text-muted-foreground">Every proposal uses this exact paragraph. {d.canEdit ? "Saving a change updates all proposals that haven't been approved yet." : "Only a Super Admin can change it."}</p>
      {d.canEdit ? (
        <>
          <Textarea rows={7} value={body} onChange={(e) => setDraft(e.target.value)} />
          <Input className="mt-2" placeholder="Reason for the change (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button className="mt-2" disabled={busy || draft === null || body.trim().length < 20 || body.trim() === d.body || reason.trim().length < 3} onClick={submit}>{busy ? "Saving…" : "Save wording"}</Button>
        </>
      ) : <p className="whitespace-pre-wrap text-sm">{d.body}</p>}
      <p className="mt-3 text-xs text-muted-foreground">{d.isDefault ? "Starting wording, no Super Admin has saved a version yet." : d.history.map((h: any) => `v${h.version} by ${h.byName}, ${new Date(h.at).toLocaleDateString()}${h.reason ? ` (${h.reason})` : ""}`).join(" · ")}</p>
    </Panel>
  );
}

type SvcLine = { serviceKey: string; label: string; quantity: number; unitCents: number; baselineUnitCents: number; billingFrequency?: "one_time" | "monthly" | "quarterly" | "annual" };

/** Pick any mix of rate-card services; they save as one combined quote. */
function ServicePicker({ clientId, lines, setLines }: { clientId: string | null; lines: SvcLine[]; setLines: (l: SvcLine[]) => void }) {
  const cat = useServerFn(getQuoteCatalog);
  const c = useQuery({ queryKey: ["quote-catalog", clientId], queryFn: () => cat({ data: { clientId } }) });
  const [q, setQ] = useState("");
  const all = (c.data?.lines ?? []) as any[];
  const shown = all.filter((l) => !q || String(l.label).toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const has = (k: string) => lines.some((l) => l.serviceKey === k);
  const toggle = (l: any) => has(l.serviceKey) ? setLines(lines.filter((x) => x.serviceKey !== l.serviceKey)) : setLines([...lines, { serviceKey: l.serviceKey, label: l.label, quantity: 1, unitCents: l.baselineCents, baselineUnitCents: l.baselineCents, billingFrequency: l.pricingModel === "annual" ? "annual" : l.pricingModel === "quarterly" ? "quarterly" : l.pricingModel === "monthly" ? "monthly" : "one_time" }]);
  const total = lines.reduce((s, l) => s + l.quantity * l.unitCents, 0);
  const base = lines.reduce((s, l) => s + l.quantity * l.baselineUnitCents, 0);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between"><span>Services (prices come from the rate card)</span><span className="text-muted-foreground">{lines.length} selected</span></div>
      <Input placeholder="Search services" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-56 overflow-y-auto rounded-md border">
        {c.isLoading && <p className="p-3 text-muted-foreground">Loading rate card...</p>}
        {shown.map((l) => (
          <label key={l.serviceKey} className="flex cursor-pointer items-center justify-between gap-3 border-b px-3 py-2 last:border-0 hover:bg-muted/40">
            <span className="flex items-center gap-2"><input type="checkbox" checked={has(l.serviceKey)} onChange={() => toggle(l)} />{l.label}</span>
            <span className="text-muted-foreground">{l.baselineCents ? money(l.baselineCents) : "Included"}</span>
          </label>
        ))}
      </div>
      {lines.length > 0 && (
        <div className="rounded-md border">
          {lines.map((l, i) => (
            <div key={l.serviceKey} className="grid grid-cols-12 items-center gap-2 border-b px-3 py-2 last:border-0">
              <span className="col-span-5">{l.label}</span>
              <Input aria-label="Quantity" className="col-span-2" inputMode="decimal" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x))} />
              <Input aria-label="Price" className="col-span-2" inputMode="decimal" value={l.unitCents / 100} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitCents: Math.round((Number(e.target.value) || 0) * 100) } : x))} />
              <select aria-label="Billing frequency" className="col-span-3 h-9 rounded-md border bg-background px-2" value={l.billingFrequency ?? "one_time"} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, billingFrequency: e.target.value as any } : x))}>{BILLING_FREQUENCIES.map((fq) => <option key={fq.id} value={fq.id}>{fq.label}</option>)}</select>
            </div>
          ))}
          <div className="flex justify-between bg-muted/40 px-3 py-2 font-medium"><span>One combined quote</span><span>{money(total)}{total < base && <span className="ml-2 text-xs text-destructive">Below rate card: needs CEO or CRO approval</span>}</span></div>
        </div>
      )}
    </div>
  );
}

type Prospect = { email: string; contactId: string | null; clientId: string | null; name: string | null; organization: string | null };

/** Type part of an email, name or company: pick a suggestion, or add a new prospect inline. */
function ProspectLookup({ onResolved, label = "Prospect email" }: { onResolved: (p: Prospect) => void; label?: string }) {
  const look = useServerFn(lookupSalesProspect);
  const search = useServerFn(searchSalesProspects);
  const add = useServerFn(createSalesProspect);
  const [email, setEmail] = useState("");
  const [res, setRes] = useState<any>(null);
  const [sugs, setSugs] = useState<any[]>([]);
  const [picked, setPicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [np, setNp] = useState({ fullName: "", organization: "", title: "", phone: "" });

  useEffect(() => {
    if (picked) return;
    const q = email.trim();
    if (q.length < 2) { setSugs([]); return; }
    const t = setTimeout(() => {
      search({ data: { query: q } }).then((r: any) => setSugs(r ?? [])).catch(() => setSugs([]));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, picked]);

  const choose = (s: any) => {
    setPicked(true);
    setSugs([]);
    setEmail(s.email);
    setRes({ found: true, contactId: s.contactId, clientId: s.clientId, name: s.name, organization: s.organization, sources: [s.source] });
    if (s.contactId) onResolved({ email: s.email, contactId: s.contactId, clientId: s.clientId, name: s.name, organization: s.organization });
    else onResolved({ email: s.email, contactId: null, clientId: s.clientId, name: s.name, organization: s.organization });
  };

  const check = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { toast.error("Enter a valid email."); return; }
    setBusy(true);
    try { const r = await look({ data: { email } }); setRes(r); setSugs([]); if (r.found && r.contactId) onResolved(r); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await add({ data: { email, fullName: np.fullName, organization: np.organization || null, title: np.title || null, phone: np.phone || null } });
      toast.success(r.reused ? "Existing contact used" : "Prospect added");
      onResolved({ email: email.trim().toLowerCase(), contactId: r.contactId, clientId: res?.clientId ?? null, name: np.fullName || res?.name, organization: np.organization || res?.organization });
      setRes({ ...res, found: true, contactId: r.contactId, name: np.fullName || res?.name, sources: ["CRM contact"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const needsContact = res && !res.contactId;
  return (
    <div className="space-y-2 text-sm">
      <span>{label}</span>
      <div className="relative">
        <div className="flex gap-2">
          <Input type="text" placeholder="Start typing a name, company or email" value={email} onChange={(e) => { setEmail(e.target.value); setRes(null); setPicked(false); }} onBlur={() => { setTimeout(() => setSugs([]), 150); if (/^\S+@\S+\.\S+$/.test(email.trim()) && !res) check(); }} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setSugs([]), check())} />
          <Button type="button" variant="outline" disabled={busy || !email} onClick={() => { setSugs([]); check(); }}>Look up</Button>
        </div>
        {sugs.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
            {sugs.map((s) => (
              <button key={s.email} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent" onMouseDown={(e) => { e.preventDefault(); choose(s); }}>
                <span className="min-w-0 truncate"><span className="font-medium">{s.name ?? s.email}</span>{s.organization ? <span className="text-muted-foreground"> · {s.organization}</span> : null}<span className="block truncate text-xs text-muted-foreground">{s.email}</span></span>
                <Badge variant="outline" className="shrink-0">{s.source}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>
      {res?.found && res.contactId && <p className="text-muted-foreground"><Badge>Found on platform</Badge> <span className="ml-1">{res.name ?? res.email}{res.organization ? ` · ${res.organization}` : ""} ({res.sources.join(", ")})</span></p>}
      {needsContact && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="font-medium">{res.found ? `Found as ${res.sources.join(", ")}. Add them as a prospect to continue.` : "Not on the platform yet. Add new prospect"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Full name" value={np.fullName || res.name || ""} onChange={(e) => setNp({ ...np, fullName: e.target.value })} />
            <Input placeholder="Organization" value={np.organization || res.organization || ""} onChange={(e) => setNp({ ...np, organization: e.target.value })} />
            <Input placeholder="Title" value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} />
            <Input placeholder="Phone" value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} />
          </div>
          <Button type="button" size="sm" disabled={busy || (np.fullName || res.name || "").trim().length < 2} onClick={() => { if (!np.fullName && res.name) np.fullName = res.name; if (!np.organization && res.organization) np.organization = res.organization; save(); }}>Add prospect</Button>
        </div>
      )}
    </div>
  );
}
