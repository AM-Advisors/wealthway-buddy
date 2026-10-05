import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSalesDocument, getSalesDocumentOptions, listSalesDocuments } from "@/lib/sales-documents.functions";
import { DIRECTION_LABEL, KIND_LABEL, STATUS_LABEL, type DocDirection, type DocKind } from "@/lib/sales-documents-model";
import { Panel } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/documents")({
  head: () => ({
    meta: [
      { title: "Proposals & RFPs - Harmonious Sales" },
      { name: "description", content: "Generate proposals, RFP and RFQ responses and vendor requests with AI drafts and approval." },
      { property: "og:title", content: "Proposals & RFPs - Harmonious Sales" },
      { property: "og:description", content: "AI-drafted proposals, RFPs and RFQs with Marketing help and Sales approval." },
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
  const [filter, setFilter] = useState("all");

  const submit = async () => {
    setBusy(true);
    try {
      const n = (v: string) => v || null;
      const r = await create({ data: { kind: f.kind, direction: f.direction, title: f.title, quoteId: n(f.quoteId), dealId: n(f.dealId), contactId: n(f.contactId), clientId: n(f.clientId), recipientName: n(f.recipientName), recipientEmail: f.recipientEmail || null, dueDate: n(f.dueDate) } });
      nav({ to: "/sales/documents/$id", params: { id: r.id } });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const docs = (q.data?.documents ?? []).filter((d: any) => filter === "all" || d.kind === filter);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Proposals & RFPs</h1>
          <p className="text-sm text-muted-foreground">AI writes the first draft, Marketing can help, a Sales Manager or the CRO approves before it goes out.</p>
        </div>
        {q.data?.canCreate && <Button onClick={() => setOpen((v) => !v)}>{open ? "Close" : "New document"}</Button>}
      </div>

      {open && (
        <Panel title="New document">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span>Type</span>
              <select className={sel} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as DocKind, direction: e.target.value === "proposal" ? "response" : f.direction })}>
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="space-y-1 text-sm"><span>Direction</span>
              <select className={sel} value={f.direction} disabled={f.kind === "proposal"} onChange={(e) => setF({ ...f, direction: e.target.value as DocDirection })}>
                {Object.entries(DIRECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="space-y-1 text-sm sm:col-span-2"><span>Title</span><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Fund administration proposal for Acme Ventures" /></label>
            {f.direction === "response" && (
              <label className="space-y-1 text-sm"><span>Quote (prices come only from here)</span>
                <select className={sel} value={f.quoteId} onChange={(e) => setF({ ...f, quoteId: e.target.value })}>
                  <option value="">No quote</option>
                  {(o.data?.quotes ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.quote_number} {x.title} ({x.status})</option>)}
                </select></label>
            )}
            <label className="space-y-1 text-sm"><span>Deal</span>
              <select className={sel} value={f.dealId} onChange={(e) => { const d = (o.data?.deals ?? []).find((x: any) => x.id === e.target.value); setF({ ...f, dealId: e.target.value, contactId: d?.contact_id ?? f.contactId, clientId: d?.client_id ?? f.clientId }); }}>
                <option value="">No deal</option>
                {(o.data?.deals ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select></label>
            <label className="space-y-1 text-sm"><span>Contact</span>
              <select className={sel} value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })}>
                <option value="">No contact</option>
                {(o.data?.contacts ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.full_name}{x.organization ? ` - ${x.organization}` : ""}</option>)}
              </select></label>
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
    </div>
  );
}
