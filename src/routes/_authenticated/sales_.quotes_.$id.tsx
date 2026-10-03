import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  decideSalesQuote, draftQuoteAgreements, getSalesQuote, markSalesQuoteLost, markSalesQuoteSent, reviseSalesQuote, submitSalesQuote,
} from "@/lib/sales-hub.functions";
import { QUOTE_STATUS_LABEL } from "@/lib/sales-model";
import { Panel, money } from "@/components/sales/sales-ui";
import { QuoteBuilder } from "./sales_.quotes";

export const Route = createFileRoute("/_authenticated/sales_/quotes_/$id")({
  head: () => ({
    meta: [
      { title: "Quote - Harmonious Sales" },
      { name: "description", content: "Quote detail: services, approval, agreements and signature status." },
      { property: "og:title", content: "Quote - Harmonious Sales" },
      { property: "og:description", content: "Approve, send and track a Harmonious quote." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuotePage,
});

function QuotePage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const load = useServerFn(getSalesQuote);
  const q = useQuery({ queryKey: ["sales-quote", id], queryFn: () => load({ data: { id } }) });
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const done = (msg: string) => () => { toast.success(msg); qc.invalidateQueries({ queryKey: ["sales-quote", id] }); qc.invalidateQueries({ queryKey: ["sales-quotes"] }); };
  const err = (e: Error) => toast.error(e.message);
  const submitFn = useServerFn(submitSalesQuote);
  const submit = useMutation({ mutationFn: () => submitFn({ data: { id } }), onSuccess: done("Sent for approval"), onError: err });
  const decideFn = useServerFn(decideSalesQuote);
  const decide = useMutation({ mutationFn: (approve: boolean) => decideFn({ data: { id, approve, note: note || null } }), onSuccess: done("Decision saved"), onError: err });
  const draftFn = useServerFn(draftQuoteAgreements);
  const draft = useMutation({ mutationFn: () => draftFn({ data: { id } }), onSuccess: done("SOW drafted"), onError: err });
  const sentFn = useServerFn(markSalesQuoteSent);
  const sent = useMutation({ mutationFn: () => sentFn({ data: { id } }), onSuccess: done("Marked sent"), onError: err });
  const reviseFn = useServerFn(reviseSalesQuote);
  const revise = useMutation({ mutationFn: () => reviseFn({ data: { id } }), onSuccess: (r) => { toast.success("New version created"); nav({ to: "/sales/quotes/$id", params: { id: r.id } }); }, onError: err });
  const lostFn = useServerFn(markSalesQuoteLost);
  const lost = useMutation({ mutationFn: () => lostFn({ data: { id, reason: note } }), onSuccess: done("Marked lost"), onError: err });

  if (q.error) return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-destructive">{(q.error as Error).message}</main>;
  const d = q.data as any;
  if (!d) return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  const s = d.quote.status as string;
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <Link to="/sales/quotes" className="text-sm text-muted-foreground hover:underline">← Quotes</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Q-{d.quote.quote_number} v{d.quote.version} · {d.quote.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{d.client?.legal_name ?? "No client"} · Owner {d.ownerName}{d.quote.valid_until ? ` · Valid until ${d.quote.valid_until}` : ""}</p>
        </div>
        <Badge className="text-sm">{QUOTE_STATUS_LABEL[s] ?? s}</Badge>
      </div>

      {editing ? (
        <QuoteBuilder onCancel={() => { setEditing(false); qc.invalidateQueries({ queryKey: ["sales-quote", id] }); }} initial={{ id, title: d.quote.title, clientId: d.quote.client_id, validUntil: d.quote.valid_until, notes: d.quote.notes,
          lines: d.lines.map((l: any) => ({ serviceKey: l.service_key, label: l.label, quantity: Number(l.quantity), unitCents: Number(l.unit_cents), baselineUnitCents: Number(l.baseline_unit_cents) })) }} />
      ) : (
        <Panel title="Services">
          <Table>
            <TableHeader><TableRow><TableHead>Service</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Rate card</TableHead><TableHead className="text-right">Line</TableHead></TableRow></TableHeader>
            <TableBody>{d.lines.map((l: any) => (
              <TableRow key={l.id}><TableCell>{l.label}</TableCell><TableCell className="text-right">{Number(l.quantity)}</TableCell><TableCell className="text-right">{money(l.unit_cents)}</TableCell><TableCell className="text-right text-muted-foreground">{money(l.baseline_unit_cents)}</TableCell><TableCell className="text-right">{money(l.line_cents)}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
          <div className="mt-3 text-right text-sm">Rate card {money(d.quote.baseline_cents)} · <span className="font-semibold text-foreground">Total {money(d.quote.total_cents)}</span></div>
          {d.quote.needs_exec_approval && <p className="mt-2 text-sm text-muted-foreground">Below the rate card: needs CEO or CRO approval.</p>}
          {d.quote.notes && <p className="mt-2 text-sm text-muted-foreground">Notes: {d.quote.notes}</p>}
          {d.quote.decision_note && <p className="mt-2 text-sm text-foreground">Decision note: {d.quote.decision_note}</p>}
        </Panel>
      )}

      <Panel title="Next step">
        <div className="flex flex-wrap items-center gap-2">
          {d.canEdit && !editing && <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
          {d.canEdit && <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Submit for approval</Button>}
          {s === "pending_approval" && (d.canApprove ? (
            <><Input className="max-w-xs" placeholder="Note (required to request changes)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button onClick={() => decide.mutate(true)} disabled={decide.isPending}>Approve</Button>
              <Button variant="outline" onClick={() => decide.mutate(false)} disabled={decide.isPending}>Request changes</Button></>
          ) : <span className="text-sm text-muted-foreground">{d.approvalBlocker}</span>)}
          {s === "approved" && !d.quote.sow_id && <Button onClick={() => draft.mutate()} disabled={draft.isPending}>Create SOW{d.quote.msa_id ? "" : " and MSA"} drafts</Button>}
          {s === "approved" && d.quote.sow_id && <><span className="text-sm text-muted-foreground">SOW draft created. Operations reviews and sends it for signature from the agreements queue.</span><Button onClick={() => sent.mutate()} disabled={sent.isPending}>Mark sent to client</Button></>}
          {s === "sent" && <span className="text-sm text-muted-foreground">Waiting for the client to sign. This updates automatically once the SOW is signed.</span>}
          {s === "signed" && <span className="text-sm text-foreground">Signed {d.quote.signed_at ? new Date(d.quote.signed_at).toLocaleDateString() : ""}. Counted as revenue closed.</span>}
          {!["signed", "superseded"].includes(s) && <Button variant="ghost" onClick={() => revise.mutate()} disabled={revise.isPending}>New version</Button>}
          {!["signed", "superseded", "lost"].includes(s) && s !== "pending_approval" && (
            <><Input className="max-w-xs" placeholder="Reason lost" value={note} onChange={(e) => setNote(e.target.value)} /><Button variant="ghost" onClick={() => lost.mutate()} disabled={!note.trim() || lost.isPending}>Mark lost</Button></>
          )}
        </div>
      </Panel>

      <Panel title="History">
        <ul className="divide-y text-sm">{d.events.map((e: any) => (
          <li key={e.id} className="flex justify-between gap-2 py-2"><span className="text-foreground">{e.event.replace(/_/g, " ")}{e.note ? ` · ${e.note}` : ""}</span><span className="text-xs text-muted-foreground">{e.actorName} · {new Date(e.created_at).toLocaleString()}</span></li>
        ))}</ul>
      </Panel>
    </main>
  );
}
