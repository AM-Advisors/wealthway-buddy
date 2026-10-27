import { useState } from "react";
import { ClientResponsePanel } from "@/components/sales/client-response-panel";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ActionBar, LinkedRecords, SalesProgress } from "@/components/sales/sales-record-parts";
import { salesProgress } from "@/lib/sales-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  decideSalesQuote, draftQuoteAgreements, getSalesLinkedRecords, getSalesQuote, markSalesQuoteLost, markSalesQuoteSent, archiveSalesQuote, deleteSalesQuote, adjustSalesQuote, reviseSalesQuote, submitSalesQuote,
} from "@/lib/sales-hub.functions";
import { QUOTE_STATUS_LABEL } from "@/lib/sales-model";
import { getQuoteAcceptLink } from "@/lib/sales-acceptance.functions";
import { Panel, money } from "@/components/sales/sales-ui";
import { QuoteBuilder } from "./sales_.quotes";
import { AddSalesContact } from "@/components/sales/add-sales-contact";
import { canAddSalesContact } from "@/lib/sales-contact-model";
import { addSalesQuoteContact, changeSalesQuoteSigner, sendSalesQuoteEmail, updateSalesQuoteDetails } from "@/lib/sales-hub.functions";
import { Textarea } from "@/components/ui/textarea";
import { bookkeepingDraftBlocker } from "@/lib/bookkeeping-model";

export const Route = createFileRoute("/_authenticated/sales_/quotes_/$id")({
  head: () => ({
    meta: [
      { title: "Quote | Harmonious Sales" },
      { name: "description", content: "Quote detail: services, approval, agreements and signature status." },
      { property: "og:title", content: "Quote | Harmonious Sales" },
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
  const addContact = useServerFn(addSalesQuoteContact);
  const q = useQuery({ queryKey: ["sales-quote", id], queryFn: () => load({ data: { id } }) });
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const done = (msg: string) => () => { toast.success(msg); qc.invalidateQueries({ queryKey: ["sales-quote", id] }); qc.invalidateQueries({ queryKey: ["sales-quotes"] }); };
  const err = (e: Error) => toast.error(e.message);
  const submitFn = useServerFn(submitSalesQuote);
  const submit = useMutation({ mutationFn: () => submitFn({ data: { id } }), onSuccess: (r: any) => done(r?.autoApproved ? "At or above rate card, ready to send" : "Sent for approval")(), onError: err });
  const decideFn = useServerFn(decideSalesQuote);
  const decide = useMutation({ mutationFn: (approve: boolean) => decideFn({ data: { id, approve, note: note || null } }), onSuccess: done("Decision saved"), onError: err });
  const draftFn = useServerFn(draftQuoteAgreements);
  const draft = useMutation({ mutationFn: () => draftFn({ data: { id } }), onSuccess: done("SOW drafted"), onError: err });
  const sentFn = useServerFn(markSalesQuoteSent);
  const linkFn = useServerFn(getQuoteAcceptLink);
  const link = useMutation({ mutationFn: () => linkFn({ data: { id } }), onSuccess: async (r) => { await navigator.clipboard.writeText(r.url).catch(() => null); toast.success("Client sign link copied"); }, onError: err });
  const sent = useMutation({ mutationFn: () => sentFn({ data: { id } }), onSuccess: done("Marked sent"), onError: err });
  const reviseFn = useServerFn(reviseSalesQuote);
  const revise = useMutation({ mutationFn: () => reviseFn({ data: { id } }), onSuccess: (r) => { toast.success("New version created"); nav({ to: "/sales/quotes/$id", params: { id: r.id } }); }, onError: err });
  const archiveFn = useServerFn(archiveSalesQuote);
  const archive = useMutation({ mutationFn: (v: boolean) => archiveFn({ data: { id, archive: v } }), onSuccess: (_r, v) => done(v ? "Quote archived" : "Quote restored")(), onError: err });
  const deleteFn = useServerFn(deleteSalesQuote);
  const del = useMutation({ mutationFn: (reason: string) => deleteFn({ data: { id, reason } }), onSuccess: () => { toast.success("Quote deleted"); qc.invalidateQueries({ queryKey: ["sales-quotes"] }); nav({ to: "/sales/quotes" }); }, onError: err });
  const adjustFn = useServerFn(adjustSalesQuote);
  const adjust = useMutation({ mutationFn: () => adjustFn({ data: { id } }), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["sales-quotes"] }); if (r.id !== id) { toast.success("New version ready to adjust"); nav({ to: "/sales/quotes/$id", params: { id: r.id } }); } else { qc.invalidateQueries({ queryKey: ["sales-quote", id] }).then(() => setEditing(true)); } }, onError: err });
  const lostFn = useServerFn(markSalesQuoteLost);
  const lost = useMutation({ mutationFn: () => lostFn({ data: { id, reason: note } }), onSuccess: done("Marked lost"), onError: err });

  const detailsFn = useServerFn(updateSalesQuoteDetails);
  const signerFn = useServerFn(changeSalesQuoteSigner);
  const emailFn = useServerFn(sendSalesQuoteEmail);
  const [details, setDetails] = useState<{ title: string; notes: string; validUntil: string } | null>(null);
  const [mail, setMail] = useState<{ subject: string; message: string } | null>(null);
  const [changingSigner, setChangingSigner] = useState(false);
  const saveDetails = useMutation({ mutationFn: () => detailsFn({ data: { id, title: details!.title, notes: details!.notes || null, validUntil: details!.validUntil || null } }), onSuccess: () => { setDetails(null); done("Quote updated")(); }, onError: err });
  const sendMail = useMutation({ mutationFn: () => emailFn({ data: { id, subject: mail!.subject, message: mail!.message || null } }), onSuccess: (r) => { setMail(null); done(r.resent ? "Quote resent" : "Quote emailed")(); }, onError: err });

  const linkedFn = useServerFn(getSalesLinkedRecords);
  const linked = useQuery({ queryKey: ["sales-linked", id], queryFn: () => linkedFn({ data: { id } }) });

  if (q.error) return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-destructive">{(q.error as Error).message}</main>;
  const d = q.data as any;
  if (!d) return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  const s = d.quote.status as string;
  const bookkeepingBlocker = bookkeepingDraftBlocker(d.lines);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <Link to="/sales/quotes" className="text-sm text-muted-foreground hover:underline">← Quotes</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Q-{d.quote.quote_number} v{d.quote.version} · {d.quote.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Quote · {d.client?.legal_name ?? "No client"} · Owner {d.ownerName}{d.quote.valid_until ? ` · Valid until ${d.quote.valid_until}` : ""}</p>
          <div className="mt-3"><SalesProgress steps={salesProgress({ status: s, approvedAt: d.quote.approved_at ?? null, signedAt: d.quote.signed_at ?? null, sowStatus: linked.data?.sow?.status ?? (d.quote.sow_id ? "linked" : null), sowAt: linked.data?.sow?.executed_at ?? null, invoiceStatus: linked.data?.invoices[0] ? (linked.data.invoices[0].paid_on ? "paid" : linked.data.invoices[0].status) : null })} /></div>
        </div>
        <Badge>{QUOTE_STATUS_LABEL[s] ?? s}</Badge>
      </div>

      <ActionBar secondary={<>
        {(s === "approved" || s === "sent") && <Button size="sm" variant="outline" onClick={() => link.mutate()} disabled={link.isPending}>Copy sign link</Button>}
        {!["signed", "superseded"].includes(s) && <Button size="sm" variant="ghost" onClick={() => revise.mutate()} disabled={revise.isPending}>New version</Button>}
        {!["signed", "superseded"].includes(s) && !d.canEdit && <Button size="sm" variant="outline" onClick={() => adjust.mutate()} disabled={adjust.isPending}>Adjust</Button>}
        <Button size="sm" variant="ghost" onClick={() => archive.mutate(!d.quote.archived_at)} disabled={archive.isPending}>{d.quote.archived_at ? "Restore" : "Archive"}</Button>
        {!d.quote.sent_at && !d.quote.sow_id && !["sent", "signed", "superseded"].includes(s) && <Button size="sm" variant="ghost" className="text-destructive" disabled={del.isPending} onClick={() => { const reason = window.prompt("Why delete this quote? It will disappear from every list; its history is kept."); if (reason && reason.trim().length >= 3) del.mutate(reason.trim()); }}>Delete</Button>}
      </>}>
        {d.canEdit && !editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
        {(s === "approved" || s === "sent") && !details && <Button size="sm" variant="outline" onClick={() => setDetails({ title: d.quote.title ?? "", notes: d.quote.notes ?? "", validUntil: d.quote.valid_until ?? "" })}>Update quote</Button>}
        {(s === "approved" || s === "sent") && d.contact?.email && !mail && <Button size="sm" onClick={() => setMail({ subject: `Your Harmonious quote: ${d.quote.title}`, message: "" })}>{s === "sent" ? "Resend quote" : "Email quote"}</Button>}
        {d.canEdit && <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending || !!bookkeepingBlocker}>{d.quote.needs_exec_approval ? "Submit for approval" : "Finalize quote"}</Button>}
        {s === "pending_approval" && (d.canApprove ? (
          <><Input className="h-9 max-w-xs" placeholder="Note (required to request changes)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" onClick={() => decide.mutate(true)} disabled={decide.isPending}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => decide.mutate(false)} disabled={decide.isPending}>Request changes</Button></>
        ) : <span className="text-sm text-muted-foreground">{d.approvalBlocker}</span>)}
        {s === "approved" && !d.quote.sow_id && <Button size="sm" onClick={() => draft.mutate()} disabled={draft.isPending}>Create SOW{d.quote.msa_id ? "" : " and MSA"} drafts</Button>}
        {s === "approved" && d.quote.sow_id && <Button size="sm" onClick={() => sent.mutate()} disabled={sent.isPending}>Mark sent to client</Button>}
        {s === "sent" && <span className="text-sm text-muted-foreground">Waiting for the client to sign.</span>}
        {s === "signed" && <span className="text-sm text-foreground">Signed {d.quote.signed_at ? new Date(d.quote.signed_at).toLocaleDateString() : ""}. Counted as revenue closed.</span>}
      </ActionBar>
      {details && (
        <Panel title="Update quote">
          <div className="space-y-3">
            <div><label className="text-sm font-medium" htmlFor="qd-title">Title</label><Input id="qd-title" value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} /></div>
            <div><label className="text-sm font-medium" htmlFor="qd-valid">Valid until</label><Input id="qd-valid" type="date" value={details.validUntil} onChange={(e) => setDetails({ ...details, validUntil: e.target.value })} /></div>
            <div><label className="text-sm font-medium" htmlFor="qd-notes">Notes</label><Textarea id="qd-notes" rows={3} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">These changes save right away without new approval. To change prices or services, use New version.</p>
            <div className="flex gap-2"><Button size="sm" onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending || !details.title.trim()}>Save</Button><Button size="sm" variant="ghost" onClick={() => setDetails(null)}>Cancel</Button></div>
          </div>
        </Panel>
      )}
      {mail && (
        <Panel title={s === "sent" ? "Resend quote" : "Email quote"}>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">To {d.contact?.full_name} ({d.contact?.email}) with their personal sign link.</p>
            <div><label className="text-sm font-medium" htmlFor="qm-subject">Subject</label><Input id="qm-subject" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></div>
            <div><label className="text-sm font-medium" htmlFor="qm-msg">Your message (optional)</label><Textarea id="qm-msg" rows={3} value={mail.message} onChange={(e) => setMail({ ...mail, message: e.target.value })} /></div>
            <div className="flex gap-2"><Button size="sm" onClick={() => sendMail.mutate()} disabled={sendMail.isPending || !mail.subject.trim()}>Send</Button><Button size="sm" variant="ghost" onClick={() => setMail(null)}>Cancel</Button></div>
          </div>
        </Panel>
      )}
      {bookkeepingBlocker && <p className="text-sm text-muted-foreground">{bookkeepingBlocker}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
      {editing ? (
        <QuoteBuilder onCancel={() => { setEditing(false); qc.invalidateQueries({ queryKey: ["sales-quote", id] }); }} initial={{ id, title: d.quote.title, clientId: d.quote.client_id, contactId: d.quote.contact_id, offeringId: (d.quote as any).offering_id ?? null, dealId: (d.quote as any).deal_id ?? null, validUntil: d.quote.valid_until, notes: d.quote.notes, expectedUpdatedAt: d.quote.updated_at, sections: (d.quote as any).sections ?? null,
          lines: d.lines.map((l: any) => ({ serviceKey: l.service_key, label: l.label, quantity: Number(l.quantity), unitCents: Number(l.unit_cents), baselineUnitCents: Number(l.baseline_unit_cents), billingFrequency: l.billing_frequency ?? "one_time", firstBillOn: l.first_bill_on ?? null, bookkeeping: l.bookkeeping_snapshot ?? undefined, details: l.service_details ?? null })) }} />
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
          {d.lines.filter((l: any) => l.bookkeeping_snapshot).map((l: any) => <details key={l.id} className="mt-4 border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Proposed bookkeeping SOW scope</summary><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{l.bookkeeping_snapshot.scope}</p></details>)}
          {d.lines.filter((l: any) => l.service_details && (l.service_details.scope || (l.service_details.included ?? []).length || (l.service_details.excluded ?? []).length)).map((l: any) => (
            <details key={`sd-${l.id}`} className="mt-4 border-t pt-3"><summary className="cursor-pointer text-sm font-medium">SOW detail · {l.label}</summary>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                {l.service_details.scope && <p className="whitespace-pre-wrap">Scope: {l.service_details.scope}</p>}
                {(l.service_details.included ?? []).length > 0 && <p>Included: {(l.service_details.included as string[]).join("; ")}</p>}
                {(l.service_details.excluded ?? []).length > 0 && <p>Not included: {(l.service_details.excluded as string[]).join("; ")}</p>}
              </div>
            </details>
          ))}
        </Panel>
      )}

      <Panel title="History">
        <ul className="divide-y text-sm">{d.events.map((e: any) => (
          <li key={e.id} className="flex justify-between gap-2 py-2"><span className="text-foreground">{e.event.replace(/_/g, " ")}{e.note ? ` · ${e.note}` : ""}</span><span className="text-xs text-muted-foreground">{e.actorName} · {new Date(e.created_at).toLocaleString()}</span></li>
        ))}</ul>
      </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Recipients & signing">
            {d.contact ? (
              <div className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0"><span className="font-medium">{d.contact.full_name}</span><span className="block truncate text-xs text-muted-foreground">{d.contact.email}</span></span>
                  <Badge variant={s === "signed" ? "default" : "outline"}>{s === "signed" ? "Signed" : "Can sign"}</Badge>
                </div>
                {(s === "approved" || s === "sent") ? <Button size="sm" variant="outline" className="mt-2" onClick={() => link.mutate()} disabled={link.isPending}>Copy sign link</Button>
                  : s !== "signed" && <p className="mt-2 text-xs text-muted-foreground">The sign link appears once this quote is approved.</p>}
                {!["signed", "superseded", "lost"].includes(s) && (changingSigner ? (
                  <div className="mt-3 border-t pt-3">
                    <p className="mb-2 text-xs text-muted-foreground">The current signer's link will stop working.</p>
                    <AddSalesContact organization={d.client?.legal_name ?? ""} onSave={async (contact) => {
                      await signerFn({ data: { id, ...contact } });
                      toast.success("Signer updated");
                      setChangingSigner(false);
                      await qc.invalidateQueries({ queryKey: ["sales-quote", id] });
                    }} />
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => setChangingSigner(false)}>Cancel</Button>
                  </div>
                ) : <Button size="sm" variant="ghost" className="mt-2" onClick={() => setChangingSigner(true)}>Change signer</Button>)}
              </div>
            ) : canAddSalesContact(d.quote.contact_id, s) ? <AddSalesContact organization={d.client?.legal_name ?? ""} onSave={async (contact) => {
              const r = await addContact({ data: { id, ...contact } });
              toast.success(r.reused ? "Existing contact linked" : "Contact added");
              await qc.invalidateQueries({ queryKey: ["sales-quote", id] });
            }} /> : <p className="text-sm text-muted-foreground">No client contact linked.</p>}
            {d.client && <Badge variant="secondary" className="mt-3">Adding services for a current client</Badge>}
          </Panel>
          <LinkedRecords quoteId={id} />
          <ClientResponsePanel kind="quote" id={id} />
          {!["signed", "superseded", "lost"].includes(s) && s !== "pending_approval" && (
            <Panel title="Mark lost">
              <div className="flex gap-2"><Input placeholder="Reason lost" value={note} onChange={(e) => setNote(e.target.value)} /><Button variant="outline" onClick={() => lost.mutate()} disabled={!note.trim() || lost.isPending}>Mark lost</Button></div>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}
