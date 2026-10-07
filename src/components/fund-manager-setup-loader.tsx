import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { listFundSubmissionsFn, submitFundInfoFn, submissionFileFn, reviewFundSubmissionFn } from "@/lib/fund-manager-submissions.functions";

type Section = "fund_details" | "fees_team" | "bank" | "document";
const DOC_KINDS = [
  ["ein_letter", "IRS EIN letter"],
  ["signed_w9", "Signed W-9 (no EIN letter)"],
  ["operating_agreement", "Operating Agreement"],
  ["ppm", "PPM"],
  ["subscription_agreement", "Subscription Agreement"],
  ["other", "Other document"],
] as const;
const SECTION_LABEL: Record<Section, string> = { fund_details: "Fund details", fees_team: "Fees & team", bank: "Bank / wire instructions", document: "Document" };

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

const FIELDS: Record<Exclude<Section, "document">, [string, string, string?][]> = {
  fund_details: [["legalName", "Legal fund name"], ["displayName", "Display name"], ["entityType", "Entity type (e.g. LLC, LP)"], ["jurisdiction", "Formation state"], ["formationDate", "Formation date", "date"], ["principalAddress", "Principal address"], ["targetRaise", "Target raise ($)", "number"], ["minInvestment", "Minimum investment ($)", "number"]],
  fees_team: [["managementFeePercent", "Management fee (% per year)", "number"], ["carryPercent", "Carried interest (%)", "number"], ["preferredReturnPercent", "Preferred return (%)", "number"], ["gpName", "General partner / manager entity"], ["signers", "Signers & team (name, title, email — one per line)", "textarea"]],
  bank: [["bankName", "Bank name"], ["accountLast4", "Account number — last 4 only"], ["notes", "Notes"]],
};

export function FundManagerSetupLoader({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listFundSubmissionsFn);
  const q = useQuery({ queryKey: ["fund-submissions", offeringId], queryFn: () => list({ data: { offeringId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-submissions", offeringId] });
  const [open, setOpen] = useState<Section | null>(null);
  const items = q.data?.items ?? [];
  const latest = (s: Section) => items.find((i: any) => i.section === s && i.status !== "withdrawn");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Load your fund information</CardTitle>
        <CardDescription>Add what Harmonious needs to get your fund going. Each item is reviewed by Harmonious before it counts toward setup.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(Object.keys(SECTION_LABEL) as Section[]).map((s) => {
          const l = latest(s);
          return (
            <div key={s} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s === "document" ? "Documents" : SECTION_LABEL[s]}</span>
                  {l && <StatusBadge status={l.status} />}
                </div>
                <Button size="sm" variant={open === s ? "secondary" : "default"} onClick={() => setOpen(open === s ? null : s)}>{open === s ? "Close" : l ? "Update" : "Add"}</Button>
              </div>
              {l?.status === "returned" && l.review_note && <p className="mt-2 text-sm text-destructive">Harmonious asked: {l.review_note}</p>}
              {open === s && <SubmitForm offeringId={offeringId} section={s} prior={l?.payload} onDone={() => { setOpen(null); refresh(); }} />}
            </div>
          );
        })}
        <History items={items} isStaff={!!q.data?.isStaff} onChange={refresh} />
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, "default" | "secondary" | "destructive" | "outline"]> = { submitted: ["Waiting for Harmonious review", "secondary"], approved: ["Approved", "default"], returned: ["Needs changes", "destructive"], withdrawn: ["Replaced", "outline"] };
  const [t, v] = map[status] ?? [status, "outline"];
  return <Badge variant={v}>{t}</Badge>;
}

function SubmitForm({ offeringId, section, prior, onDone }: { offeringId: string; section: Section; prior?: Record<string, any>; onDone: () => void }) {
  const submit = useServerFn(submitFundInfoFn);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(prior ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)])));
  const [docKind, setDocKind] = useState<string>("operating_agreement");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = section === "document" ? (docKind === "ein_letter" ? [["ein", "EIN (9 digits)"]] as [string, string, string?][] : []) : FIELDS[section];

  async function go() {
    setBusy(true);
    try {
      if (section === "bank" && vals["accountLast4"] && !/^\d{4}$/.test(vals["accountLast4"])) throw new Error("Enter only the last 4 digits of the account number.");
      const payload: Record<string, string> = {};
      for (const [k] of fields) if (vals[k]?.trim()) payload[k] = vals[k].trim();
      const f = file ? { name: file.name, base64: await toBase64(file) } : null;
      if (file && file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
      await submit({ data: { offeringId, section, docKind: section === "document" ? (docKind as any) : null, payload, file: f } });
      toast.success("Sent to Harmonious for review");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {section === "document" && (
        <div className="sm:col-span-2">
          <Label>Document type</Label>
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={docKind} onChange={(e) => setDocKind(e.target.value)}>
            {DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}
      {fields.map(([k, l, t]) => (
        <div key={k} className={t === "textarea" ? "sm:col-span-2" : ""}>
          <Label>{l}</Label>
          {t === "textarea"
            ? <Textarea className="mt-1" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            : <Input className="mt-1" type={t ?? "text"} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
        </div>
      ))}
      {(section === "document" || section === "bank") && (
        <div className="sm:col-span-2">
          <Label>{section === "bank" ? "Wire instructions letter from your bank (PDF or image)" : "File (PDF or image, up to 10 MB)"}</Label>
          <Input className="mt-1" type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {section === "bank" && <p className="mt-1 text-xs text-muted-foreground">For security, Harmonious enters and verifies full account details from your bank's letter. Don't type full account numbers here.</p>}
        </div>
      )}
      <div className="sm:col-span-2"><Button onClick={go} disabled={busy}>{busy ? "Sending…" : "Submit for review"}</Button></div>
    </div>
  );
}

function History({ items, isStaff, onChange }: { items: any[]; isStaff: boolean; onChange: () => void }) {
  const fileLink = useServerFn(submissionFileFn);
  const review = useServerFn(reviewFundSubmissionFn);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const shown = items.filter((i) => i.status !== "withdrawn");
  if (!shown.length) return null;
  async function act(id: string, decision: "approve" | "return") {
    try { await review({ data: { id, decision, note: notes[id] ?? null } }); toast.success(decision === "approve" ? "Approved and applied to the fund" : "Sent back to the fund manager"); onChange(); }
    catch (e: any) { toast.error(e?.message ?? "Could not save"); }
  }
  return (
    <div className="space-y-2 pt-2">
      <p className="text-sm font-medium">{isStaff ? "Submissions to review" : "What you've sent"}</p>
      {shown.map((i) => (
        <div key={i.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{SECTION_LABEL[i.section as Section]}{i.doc_kind ? ` — ${DOC_KINDS.find((d) => d[0] === i.doc_kind)?.[1]}` : ""}</span>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{new Date(i.submitted_at).toLocaleDateString()}</span><StatusBadge status={i.status} /></div>
          </div>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {Object.entries(i.payload ?? {}).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{k}:</dt><dd className="whitespace-pre-wrap">{String(v)}</dd></div>)}
          </dl>
          {i.file_path && <Button size="sm" variant="link" className="px-0" onClick={async () => { const { url } = await fileLink({ data: { id: i.id } }); window.open(url, "_blank"); }}>Open {i.file_name}</Button>}
          {isStaff && i.status === "submitted" && (
            <div className="mt-2 space-y-2">
              <Textarea placeholder="Note to the fund manager (required to send back)" value={notes[i.id] ?? ""} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} />
              <div className="flex gap-2"><Button size="sm" onClick={() => act(i.id, "approve")}>Approve & apply</Button><Button size="sm" variant="outline" onClick={() => act(i.id, "return")}>Send back</Button></div>
              {i.section === "bank" && <p className="text-xs text-muted-foreground">Approving keeps the letter on file; enter and verify the account in Banking.</p>}
              {i.section === "fees_team" && <p className="text-xs text-muted-foreground">Approving applies fees; add listed signers on the Team step.</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
