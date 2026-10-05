import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  decideSalesDocument, draftSalesDocumentWithAi, exportSalesDocument, getSalesDocument, requestMarketingHelp, returnMarketingAssist,
  saveSalesDocumentSections, sendSalesDocument, setSalesDocumentOutcome, submitSalesDocument, uploadSalesDocumentSource,
} from "@/lib/sales-documents.functions";
import { DIRECTION_LABEL, KIND_LABEL, OUTCOMES, STATUS_LABEL, type DocDirection, type DocKind, type Section } from "@/lib/sales-documents-model";
import { Panel, money } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/documents_/$id")({
  head: () => ({
    meta: [
      { title: "Document editor - Harmonious Sales" },
      { name: "description", content: "Edit, approve and send a proposal, RFP or RFQ." },
      { property: "og:title", content: "Document editor - Harmonious Sales" },
      { property: "og:description", content: "Draft with AI, get Marketing help, approve and send." },
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
  const help = useServerFn(requestMarketingHelp);
  const giveBack = useServerFn(returnMarketingAssist);
  const submit = useServerFn(submitSalesDocument);
  const decide = useServerFn(decideSalesDocument);
  const send = useServerFn(sendSalesDocument);
  const outcome = useServerFn(setSalesDocumentOutcome);
  const exp = useServerFn(exportSalesDocument);
  const q = useQuery({ queryKey: ["sales-document", id], queryFn: () => load({ data: { id } }) });
  const d = q.data;
  const [sections, setSections] = useState<Section[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [helpNote, setHelpNote] = useState(""); const [helpDue, setHelpDue] = useState(""); const [helpKeys, setHelpKeys] = useState<string[]>([]);
  const [subject, setSubject] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { if (d && !dirty) { setSections(d.sections as Section[]); setSubject(d.doc.title); } }, [d, dirty]);
  const refresh = () => { setDirty(false); qc.invalidateQueries({ queryKey: ["sales-document", id] }); qc.invalidateQueries({ queryKey: ["sales-documents"] }); };
  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
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
  const activeAssist = d.assists.find((x: any) => x.status === "claimed" && x.assignee_user_id === p.userId);
  const upd = (i: number, patch: Partial<Section>) => { setDirty(true); setSections((s) => s.map((x, n) => (n === i ? { ...x, ...patch } : x))); };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/sales/documents" className="text-sm text-muted-foreground hover:underline">Proposals & RFPs</Link>
          <h1 className="font-heading text-2xl font-semibold">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">{KIND_LABEL[doc.kind as DocKind]} · {DIRECTION_LABEL[doc.direction as DocDirection]} · Owner {doc.ownerName}{doc.due_date ? ` · Due ${doc.due_date}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{STATUS_LABEL[doc.status] ?? doc.status}</Badge>
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => download("pdf")}>PDF</Button>
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => download("docx")}>Word</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {p.canEdit && (
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
              {p.canEdit ? <Input className="mb-2 font-semibold" value={s.title} onChange={(e) => upd(i, { title: e.target.value })} /> : <h3 className="mb-2 font-heading font-semibold">{s.title}</h3>}
              {s.question && <p className="mb-2 text-sm italic text-muted-foreground">Question: {s.question}</p>}
              {p.canEdit ? <Textarea rows={6} value={s.body} onChange={(e) => upd(i, { body: e.target.value })} /> : <p className="whitespace-pre-wrap text-sm">{s.body || "-"}</p>}
              {p.canEdit && <Button variant="ghost" size="sm" className="mt-1" onClick={() => { setDirty(true); setSections((x) => x.filter((_, n) => n !== i)); }}>Remove section</Button>}
            </div>
          ))}
          {p.canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setDirty(true); setSections((x) => [...x, { key: `s${Date.now()}`, title: "New section", body: "" }]); }}>Add section</Button>
              <Button disabled={!dirty || !!busy} onClick={() => run("save", () => save({ data: { id, sections } }), doc.status === "approved" ? "Saved - needs approval again" : "Saved")}>Save</Button>
            </div>
          )}
          {d.quoteLines.length > 0 && (
            <Panel title="Quote lines (source of prices)">
              <ul className="space-y-1 text-sm">{d.quoteLines.map((l: any, i: number) => <li key={i}>{l.label}: {l.quantity} x {money(l.unit_cents)} = {money(l.line_cents)}</li>)}</ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {activeAssist && (
            <Panel title="You're helping Sales">
              <p className="text-sm">{activeAssist.note}</p>
              <Button className="mt-3" disabled={!!busy || dirty} onClick={() => run("return", () => giveBack({ data: { id: activeAssist.id, note: window.prompt("Note for the rep (optional)") ?? null } }), "Handed back to Sales")}>Hand back to Sales</Button>
              {dirty && <p className="mt-1 text-xs text-muted-foreground">Save your edits first.</p>}
            </Panel>
          )}
          {p.canRequestHelp && (
            <Panel title="Ask Marketing for help">
              <Textarea rows={3} placeholder="What do you need? (wording, branding, visuals...)" value={helpNote} onChange={(e) => setHelpNote(e.target.value)} />
              <div className="mt-2 space-y-1 text-sm">
                {sections.map((s) => (
                  <label key={s.key} className="flex items-center gap-2"><input type="checkbox" checked={helpKeys.includes(s.key)} onChange={(e) => setHelpKeys((k) => (e.target.checked ? [...k, s.key] : k.filter((x) => x !== s.key)))} />{s.title}</label>
                ))}
              </div>
              <Input className="mt-2" type="date" value={helpDue} onChange={(e) => setHelpDue(e.target.value)} />
              <Button className="mt-2" disabled={!!busy || helpNote.trim().length < 3} onClick={() => run("help", () => help({ data: { id, note: helpNote, sections: helpKeys, dueDate: helpDue || null } }), "Sent to Marketing")}>Request Marketing help</Button>
            </Panel>
          )}
          {p.isOwner && d.assists.some((x: any) => x.status === "open") && (
            <Panel title="Waiting for Marketing">
              <Button variant="outline" size="sm" onClick={() => run("cancel", () => giveBack({ data: { id: d.assists.find((x: any) => x.status === "open")!.id, note: "Cancelled by rep" } }), "Request cancelled")}>Cancel request</Button>
            </Panel>
          )}

          <Panel title="Approval & sending">
            {p.canSubmit && <Button className="w-full" disabled={!!busy || dirty} onClick={() => run("submit", () => submit({ data: { id } }), "Submitted for approval")}>Submit for approval</Button>}
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
                {!doc.contact_id && <p className="text-sm text-muted-foreground">Link a contact to email it, or download the PDF/Word file.</p>}
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
                <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Short cover note" />
                <Button className="w-full" disabled={!!busy || !doc.contact_id} onClick={() => run("send", () => send({ data: { id, subject, message } }), "Sent")}>Email to {doc.recipient_name ?? "contact"}</Button>
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
