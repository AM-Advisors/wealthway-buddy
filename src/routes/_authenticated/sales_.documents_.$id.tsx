import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SearchableContactChoices } from "@/components/ui/searchable-contact-choices";
import { Textarea } from "@/components/ui/textarea";
import {
  decideSalesDocument, draftSalesDocumentWithAi, exportSalesDocument, getSalesDocument,
  saveSalesDocumentSections, sendSalesDocument, listSalesCcOptions, listSalesClientTeam, shareSalesDocumentLink, setSalesDocumentOutcome, submitSalesDocument, uploadSalesDocumentSource,
} from "@/lib/sales-documents.functions";
import { DIRECTION_LABEL, KIND_LABEL, OUTCOMES, STATUS_LABEL, type DocDirection, type DocKind, type Section } from "@/lib/sales-documents-model";
import { Panel, money } from "@/components/sales/sales-ui";
import { draftQuoteAgreements, getSalesLinkedRecords, submitSalesQuote } from "@/lib/sales-hub.functions";
import { ActionBar, LinkedRecords, RecipientLinks, SalesProgress } from "@/components/sales/sales-record-parts";
import { salesProgress } from "@/lib/sales-progress";

export const Route = createFileRoute("/_authenticated/sales_/documents_/$id")({
  head: () => ({
    meta: [
      { title: "Document editor - Harmonious Sales" },
      { name: "description", content: "Edit, approve and send a proposal, RFP or RFQ." },
      { property: "og:title", content: "Document editor - Harmonious Sales" },
      { property: "og:description", content: "Standardized proposal built from the quote and MSA; approve and send." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Editor,
});

const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getSalesDocument);
  const save = useServerFn(saveSalesDocumentSections);
  const ai = useServerFn(draftSalesDocumentWithAi);
  const upload = useServerFn(uploadSalesDocumentSource);
  const submit = useServerFn(submitSalesDocument);
  const decide = useServerFn(decideSalesDocument);
  const send = useServerFn(sendSalesDocument);
  const ccLoad = useServerFn(listSalesCcOptions);
  const ccOpts = useQuery({ queryKey: ["sales-cc-options"], queryFn: () => ccLoad() });
  const [ccIds, setCcIds] = useState<string[]>([]);
  const teamLoad = useServerFn(listSalesClientTeam);
  const team = useQuery({ queryKey: ["sales-client-team", id], queryFn: () => teamLoad({ data: { id } }) });
  const [toIds, setToIds] = useState<string[] | null>(null);
  const [signerIds, setSignerIds] = useState<string[] | null>(null);
  const [extraCc, setExtraCc] = useState("");
  const outcome = useServerFn(setSalesDocumentOutcome);
  const exp = useServerFn(exportSalesDocument);
  const q = useQuery({ queryKey: ["sales-document", id], queryFn: () => load({ data: { id } }) });
  const d = q.data;
  const linkedFn = useServerFn(getSalesLinkedRecords);
  const linkedQuoteId = (d as any)?.packet?.quote?.id ?? null;
  const linked = useQuery({ queryKey: ["sales-linked", linkedQuoteId], queryFn: () => linkedFn({ data: { id: linkedQuoteId } }), enabled: !!linkedQuoteId });
  const inv0: any = linked.data?.invoices?.[0] ?? null;
  const [sections, setSections] = useState<Section[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [subject, setSubject] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { if (d && !dirty) { setSections(d.sections as Section[]); setSubject(d.doc.title); } }, [d, dirty]);
  const refresh = () => { setDirty(false); qc.invalidateQueries({ queryKey: ["sales-document", id] }); qc.invalidateQueries({ queryKey: ["sales-documents"] }); };
  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const shareFn = useServerFn(shareSalesDocumentLink);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const preview = async () => {
    setBusy("preview");
    try {
      const r = await exp({ data: { id, format: "pdf" } });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const copyLink = async () => {
    setBusy("link");
    try { const r = await shareFn({ data: { id } }); await navigator.clipboard.writeText(r.url); toast.success(`Review link copied (version ${r.version})`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const download = async (format: "pdf" | "docx") => {
    setBusy(format);
    try {
      const r = await exp({ data: { id, format } });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      const a = document.createElement("a"); a.href = url; a.download = r.fileName; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  if (q.error) return <div className="p-6 text-sm text-muted-foreground">{(q.error as Error).message}</div>;
  if (!d) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  const p = d.perms; const doc: any = d.doc;
  const upd = (i: number, patch: Partial<Section>) => { setDirty(true); setSections((s) => s.map((x, n) => (n === i ? { ...x, ...patch } : x))); };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/sales/documents" className="text-sm text-muted-foreground hover:underline">Proposals & RFPs</Link>
          <h1 className="font-heading text-2xl font-semibold">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">{KIND_LABEL[doc.kind as DocKind]} · {DIRECTION_LABEL[doc.direction as DocDirection]} · Version {doc.current_version} · Owner {doc.ownerName}{doc.due_date ? ` · Due ${doc.due_date}` : ""}</p>
          <div className="mt-3"><SalesProgress steps={salesProgress({ status: doc.status, approvedAt: doc.approved_at, events: d.events as any, signedAt: d.packet?.sow?.client_signed_at ?? null, sowStatus: d.packet?.sow?.status ?? null, sowAt: d.packet?.sow?.executed_at ?? null, invoiceStatus: inv0 ? (inv0.paid_on ? "paid" : inv0.status) : null })} /></div>
        </div>
        <Badge>{STATUS_LABEL[doc.status] ?? doc.status}</Badge>
      </div>

      <ActionBar secondary={<>
        {doc.approved_version && <Button variant="outline" size="sm" disabled={!!busy} onClick={copyLink}>Copy review link</Button>}
        <Button variant="outline" size="sm" disabled={!!busy} onClick={() => download("pdf")}>PDF</Button>
        <Button variant="outline" size="sm" disabled={!!busy} onClick={() => download("docx")}>Word</Button>
      </>}>
        <Button size="sm" disabled={!!busy} onClick={preview}>{busy === "preview" ? "Loading..." : "Preview"}</Button>
        {p.canEdit && <Button size="sm" variant="outline" disabled={!dirty || !!busy} onClick={() => run("save", () => save({ data: { id, sections } }), doc.status === "approved" ? "Saved - needs approval again" : "Saved")}>Save</Button>}
        {p.canSubmit && <Button size="sm" disabled={!!busy || dirty} onClick={() => run("submit", () => submit({ data: { id } }), "Submitted for approval")}>Submit for approval</Button>}
        {p.canApprove && <Button size="sm" disabled={!!busy} onClick={() => run("approve", () => decide({ data: { id, approve: true } }), "Approved")}>Approve</Button>}
        {p.canSend && <Button size="sm" variant="outline" onClick={() => document.getElementById("send-box")?.scrollIntoView({ behavior: "smooth" })}>Send…</Button>}
      </ActionBar>

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{dirty ? "Preview of the last saved version. Save to see your latest edits." : doc.approved_version ? "This is what the client will see." : "Draft preview, marked as a draft until approved."}</p>
            <Button size="sm" variant="outline" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>Close preview</Button>
          </div>
          <iframe title="Proposal preview" src={previewUrl} className="w-full flex-1 rounded-md border" />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {p.canEdit && doc.kind !== "rfq" && (
            <Panel title="AI first draft">
              <Textarea rows={3} placeholder="Optional brief: what the prospect cares about, tone, anything to stress" value={brief} onChange={(e) => setBrief(e.target.value)} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button disabled={!!busy} onClick={() => run("ai", () => ai({ data: { id, brief: brief || null } }), "Draft written - review every section")}>{busy === "ai" ? "Drafting..." : "Draft with AI"}</Button>
                {doc.direction === "response" && doc.kind !== "proposal" && (
                  <label className="cursor-pointer text-sm text-primary hover:underline">
                    {doc.source_file_name ? `Replace prospect's document (${doc.source_file_name})` : "Upload prospect's RFP/RFQ (PDF or Word)"}
                    <input type="file" accept=".pdf,.docx" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      await run("upload", async () => upload({ data: { id, name: file.name, type: file.type, base64: await toB64(file) } }), "Document read - now draft with AI");
                    }} />
                  </label>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">The AI never writes prices; the pricing section is filled from the linked quote.</p>
            </Panel>
          )}

          {sections.map((s, i) => (
            <div key={s.key + i} className="rounded-lg border bg-card p-4">
              {p.canEdit && !(d.lockedSectionKeys ?? []).includes(s.key) && s.key !== "summary_note" ? <Input className="mb-2 font-semibold" value={s.title} onChange={(e) => upd(i, { title: e.target.value })} /> : <h3 className="mb-2 font-heading font-semibold">{s.title}</h3>}
              {s.question && <p className="mb-2 text-sm italic text-muted-foreground">Question: {s.question}</p>}
              {(d.lockedSectionKeys ?? []).includes(s.key) ? <><p className="whitespace-pre-wrap text-sm">{s.body || "-"}</p><p className="mt-1 text-xs text-muted-foreground">Set by Harmonious and filled in automatically. It can't be edited.</p></> : s.key === "summary_note" ? (p.canEdit ? <><Textarea rows={2} maxLength={300} placeholder="Optional: add one line under the summary" value={s.body} onChange={(e) => upd(i, { body: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">{s.body.length}/300. Shown under the summary; still needs approval.</p></> : <p className="text-sm">{s.body || "-"}</p>) : p.canEdit ? <Textarea rows={6} value={s.body} onChange={(e) => upd(i, { body: e.target.value })} /> : <p className="whitespace-pre-wrap text-sm">{s.body || "-"}</p>}
              {p.canEdit && !(d.lockedSectionKeys ?? []).includes(s.key) && s.key !== "summary_note" && <Button variant="ghost" size="sm" className="mt-1" onClick={() => { setDirty(true); setSections((x) => x.filter((_, n) => n !== i)); }}>Remove section</Button>}
            </div>
          ))}
          {p.canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setDirty(true); setSections((x) => [...x, { key: `s${Date.now()}`, title: "New section", body: "" }]); }}>Add section</Button>
              <Button disabled={!dirty || !!busy} onClick={() => run("save", () => save({ data: { id, sections } }), doc.status === "approved" ? "Saved - needs approval again" : "Saved")}>Save</Button>
            </div>
          )}
          {d.packet && <AgreementPacket packet={d.packet} onChange={refresh} />}
          {d.quoteLines.length > 0 && (
            <Panel title="Quote lines (source of prices)">
              <ul className="space-y-1 text-sm">{d.quoteLines.map((l: any, i: number) => <li key={i}>{l.label}: {l.quantity} x {money(l.unit_cents)} = {money(l.line_cents)}</li>)}</ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <RecipientLinks documentId={id} addOn={!!doc.client_id} />
          <LinkedRecords quoteId={d.packet?.quote?.id ?? null} />
          <div id="send-box" />
          <Panel title="Approval & sending">
            {doc.status === "submitted" && !p.canApprove && <p className="text-sm text-muted-foreground">Waiting for a Sales Manager or the CRO (not the writer).</p>}
            {p.canApprove && (
              <div className="flex gap-2">
                <Button disabled={!!busy} onClick={() => run("approve", () => decide({ data: { id, approve: true } }), "Approved")}>Approve</Button>
                <Button variant="outline" disabled={!!busy} onClick={() => { const n = window.prompt("What needs to change?"); if (n) run("reject", () => decide({ data: { id, approve: false, note: n } }), "Sent back"); }}>Send back</Button>
              </div>
            )}
            {doc.approved_at && <p className="mt-2 text-xs text-muted-foreground">Approved by {doc.approvedByName} on {new Date(doc.approved_at).toLocaleDateString()} (version {doc.approved_version}).</p>}
            {p.canSend && (
              <div className="mt-3 space-y-2">
                {p.directSend && <p className="text-sm text-muted-foreground">As CRO or CEO you can send this directly. Sending records your approval of the current version.</p>}
                {!doc.contact_id && <p className="text-sm text-muted-foreground">Link a contact to email it, or download the PDF/Word file.</p>}
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
                <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Short cover note" />
                <div className="rounded-md border p-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">CC Sales team members (optional)</p>
                  <SearchableContactChoices aria-label="Search Sales CC contacts">
                    {(ccOpts.data ?? []).map((o) => (
                      <label key={o.userId} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={ccIds.includes(o.userId)} onChange={(e) => setCcIds((c) => e.target.checked ? [...c, o.userId] : c.filter((x) => x !== o.userId))} />
                        <span>{o.name}</span><span className="truncate text-xs text-muted-foreground">{o.email}</span>
                      </label>
                    ))}
                    {ccOpts.data && !ccOpts.data.length && <p className="text-xs text-muted-foreground">No Sales team members found.</p>}
                  </SearchableContactChoices>
                </div>
                {(() => {
                  const def = doc.contact_id ? [doc.contact_id as string] : [];
                  const to = toIds ?? def; const signers = (signerIds ?? def).filter((s) => to.includes(s));
                  const tog = (list: string[], v: string, on: boolean) => on ? [...new Set([...list, v])] : list.filter((x) => x !== v);
                  const extras = extraCc.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
                  return (<>
                    <div className="rounded-md border p-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Send to (client's team)</p>
                      <SearchableContactChoices aria-label="Search client recipients">
                        {(team.data ?? []).map((t) => (
                          <label key={t.contactId} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={to.includes(t.contactId)} onChange={(e) => setToIds(tog(to, t.contactId, e.target.checked))} />
                            <span>{t.name}</span><span className="truncate text-xs text-muted-foreground">{t.title ? `${t.title} · ` : ""}{t.email}</span>
                          </label>
                        ))}
                        {team.data && !team.data.length && <p className="text-xs text-muted-foreground">No client contacts with an email yet.</p>}
                      </SearchableContactChoices>
                      <p className="mt-1 text-xs text-muted-foreground">People at the same organization in your contacts show here. Each gets their own email.</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Who can sign and approve</p>
                      <SearchableContactChoices aria-label="Search proposal signers">
                        {(team.data ?? []).filter((t) => to.includes(t.contactId)).map((t) => (
                          <label key={t.contactId} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={signers.includes(t.contactId)} onChange={(e) => setSignerIds(tog(signers, t.contactId, e.target.checked))} />
                            <span>{t.name}</span>
                          </label>
                        ))}
                      </SearchableContactChoices>
                      <p className="mt-1 text-xs text-muted-foreground">Only these people get a Sign &amp; approve button. Everyone else gets a view-only copy.</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">CC anyone else (optional)</p>
                      <Input value={extraCc} onChange={(e) => setExtraCc(e.target.value)} placeholder="name@company.com, other@company.com" />
                    </div>
                    <Button className="w-full" disabled={!!busy || !doc.contact_id || !to.length || !signers.length || (p.directSend && dirty)} onClick={() => run("send", () => send({ data: { id, subject, message, ccUserIds: ccIds, toContactIds: to, signerContactIds: signers, extraCc: extras } }), "Sent")}>Email to {to.length} {to.length === 1 ? "person" : "people"}</Button>
                  </>);
                })()}
              </div>
            )}
            {p.canOutcome && (
              <div className="mt-3 flex flex-wrap gap-2">
                {OUTCOMES[doc.direction as DocDirection].map((o) => <Button key={o} size="sm" variant="outline" onClick={() => run("outcome", () => outcome({ data: { id, outcome: o } }), "Updated")}>{STATUS_LABEL[o]}</Button>)}
              </div>
            )}
          </Panel>

          {doc.sent_at && (
            <Panel title="Prospect engagement">
              <p className="text-sm">{d.engagement.opens > 0 || d.engagement.clicks > 0 ? "Read" : "Not opened yet"}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>Opens: {d.engagement.opens} · Clicks on View: {d.engagement.clicks}</li>
                {d.engagement.firstOpenedAt && <li>First opened {new Date(d.engagement.firstOpenedAt).toLocaleString()}</li>}
                {d.engagement.lastActivityAt && <li>Last activity {new Date(d.engagement.lastActivityAt).toLocaleString()}</li>}
                {d.engagement.devices > 1 && <li>Seen on {d.engagement.devices} devices/locations (likely forwarded - estimate)</li>}
              </ul>
            </Panel>
          )}
          <Panel title="History">
            <ul className="max-h-80 space-y-1 overflow-auto text-xs">
              {d.events.map((e: any, i: number) => <li key={i}><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span> {e.byName}: {e.event.replace(/_/g, " ")}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{d.versions.length} saved version(s).</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const PSTAT = (x: any, signed: boolean) => (signed ? "Signed" : x?.status ? String(x.status).replace(/_/g, " ") : "Not created");

/** Quote, MSA and SOW in one place: approve once, then one packet goes to the agreement signing flow. */
function AgreementPacket({ packet, onChange }: { packet: any; onChange: () => void }) {
  const mk = useServerFn(draftQuoteAgreements);
  const sub = useServerFn(submitSalesQuote);
  const [busy, setBusy] = useState(false);
  const { quote, sow, msa } = packet;
  const go = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); onChange(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  return (
    <Panel title="Agreement packet: quote, MSA and SOW">
      <ul className="space-y-2 text-sm">
        <li className="flex justify-between"><Link to="/sales/quotes/$id" params={{ id: quote.id }} className="font-medium hover:underline">Quote Q-{quote.quote_number} v{quote.version}</Link><span><Badge variant="outline">{String(quote.status).replace(/_/g, " ")}</Badge> {money(quote.total_cents)}</span></li>
        <li className="flex justify-between"><span>Master Services Agreement</span><Badge variant="outline">{msa ? PSTAT(msa, !!msa.executed_at) : quote.sow_id ? "Already on file" : "Not created"}</Badge></li>
        <li className="flex justify-between"><span>Statement of Work</span><Badge variant="outline">{PSTAT(sow, !!(sow?.executed_at || sow?.client_signed_at))}</Badge></li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {["draft", "rejected"].includes(quote.status) && <Button size="sm" disabled={busy} onClick={() => go(() => sub({ data: { id: quote.id } }), "Quote sent for approval")}>Submit quote for approval</Button>}
        {quote.status === "approved" && !quote.sow_id && <Button size="sm" disabled={busy} onClick={() => go(() => mk({ data: { id: quote.id } }), "MSA and SOW packet created")}>Create MSA + SOW packet</Button>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">The MSA is only added when the client has none on file. Both are built from these same service lines and are signed together in the agreement flow. Billing starts only after signing.</p>
    </Panel>
  );
}
