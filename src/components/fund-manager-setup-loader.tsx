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
import { Progress } from "@/components/ui/progress";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { listFundSubmissionsFn, submitFundInfoFn, submissionFileFn, reviewFundSubmissionFn } from "@/lib/fund-manager-submissions.functions";

export type Section = "fund_details" | "fees_team" | "bank" | "document";
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

export const FIELDS: Record<Exclude<Section, "document">, [string, string, string?][]> = {
  fund_details: [["legalName", "Legal fund name"], ["displayName", "Display name"], ["entityType", "Entity type (e.g. LLC, LP)"], ["jurisdiction", "Formation state"], ["formationDate", "Formation date", "date"], ["addressLine1", "Address line 1"], ["addressLine2", "Address line 2"], ["addressCity", "City"], ["addressState", "State (address)"], ["addressZip", "ZIP code"], ["targetRaise", "Target raise ($)", "number"], ["minInvestment", "Minimum investment ($)", "number"]],
  fees_team: [["managementFeePercent", "Management fee (% per year)", "number"], ["carryPercent", "Carried interest (%)", "number"], ["preferredReturnPercent", "Preferred return (%)", "number"], ["gpName", "General partner / manager entity"], ["signers", "Signers & team (name, title, email — one per line)", "textarea"]],
  bank: [["bankName", "Bank name"], ["bankAddress", "Bank address"], ["beneficiaryAddress", "Beneficiary address"], ["accountLast4", "Account number — last 4 only"], ["notes", "Notes"]],
};

export function FundManagerSetupLoader({ offeringId, compact = false }: { offeringId: string; compact?: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listFundSubmissionsFn);
  const q = useQuery({ queryKey: ["fund-submissions", offeringId], queryFn: () => list({ data: { offeringId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-submissions", offeringId] });
  const [open, setOpen] = useState<Section | null>(null);
  const items = q.data?.items ?? [];
  const latest = (s: Section) => items.find((i: any) => i.section === s && i.status !== "withdrawn");

  const isStaff = !!q.data?.isStaff;
  const onFile = ((q.data as any)?.onFile ?? null) as null | (Record<string, Record<string, string>> & { documents: string[] });
  const known = (sec: Section): Record<string, string> => {
    if (sec === "document") return {};
    const base = { ...(onFile?.[sec] ?? {}) } as Record<string, string>;
    const l = latest(sec);
    for (const [k, v] of Object.entries((l?.payload ?? {}) as Record<string, unknown>)) if (v != null && String(v).trim()) base[k] = String(v);
    return base;
  };
  const missing = (sec: Section): string[] => sec === "document" ? (onFile?.documents?.length ? [] : ["at least one document"]) : sec === "bank" ? [] : FIELDS[sec].filter(([k]) => !known(sec)[k]?.trim()).map(([, l]) => l.replace(/ \(.*\)$/, ""));
  const order = Object.keys(SECTION_LABEL) as Section[];
  const onRecord = (s: Section) => s === "bank" && !!(onFile as any)?.bankOnFile && !["submitted", "returned"].includes(latest(s)?.status);
  const isApproved = (s: Section) => latest(s)?.status === "approved" || onRecord(s);
  const done = order.filter(isApproved).length;
  const firstOpen = order.find((s) => !isApproved(s)) ?? null;
  const [expanded, setExpanded] = useState<Section | null | undefined>(undefined);
  const current = expanded === undefined ? firstOpen : expanded;
  const waitingOn = (st?: string, s?: Section) => (st === "submitted" ? "Waiting for Harmonious review" : st === "returned" ? "Needs changes" : st === "approved" ? "Approved" : s && onRecord(s) ? "On file" : "Waiting on fund manager");
  if (q.isPending) return <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading fund setup…</CardContent></Card>;
  if (compact && done === order.length) return <p className="rounded-lg border bg-card px-4 py-3 text-sm"><Check className="mr-2 inline h-4 w-4 text-primary" />Fund setup complete.</p>;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle>{compact ? "Finish your fund setup" : "Load your fund information"}</CardTitle>
          <CardDescription>Fund information</CardDescription>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground"><span>{done} of {order.length} complete</span><span>{Math.round((done / order.length) * 100)}%</span></div>
          <Progress value={(done / order.length) * 100} />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {order.map((s, idx) => {
            const l = latest(s);
            const isDone = isApproved(s);
            const isOpen = current === s;
            const reviewNow = isStaff && l?.status === "submitted";
            const sectionItems = items.filter((i: any) => i.section === s);
            return (
              <li key={s} className={cn("rounded-lg border transition-colors", isOpen && "border-primary/60 bg-accent/20")}>
                <button type="button" className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setExpanded(isOpen ? null : s)} aria-expanded={isOpen}>
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", isDone ? "border-primary bg-primary text-primary-foreground" : l?.status === "submitted" ? "border-primary text-primary" : "text-muted-foreground")}>
                    {isDone ? <Check className="h-4 w-4" /> : idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s === "document" ? "Documents" : SECTION_LABEL[s]}</span>
                    <span className="block text-xs text-muted-foreground">{!l && missing(s).length && Object.values(known(s)).some(Boolean) ? "Missing info" : waitingOn(l?.status, s)}</span>
                  </span>
                  {l ? <StatusBadge status={l.status} /> : <Badge variant="outline">{Object.values(known(s)).some(Boolean) ? "Missing info" : "Not started"}</Badge>}
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t px-3 pb-3 pt-3">
                    {l?.status === "returned" && l.review_note && <p className="text-sm text-destructive">Harmonious asked: {l.review_note}</p>}
                    <OnFile section={s} values={known(s)} docs={onFile?.documents ?? []} />
                    {!isDone && missing(s).length > 0 && <p className="text-xs text-muted-foreground">Missing: {missing(s).join(", ")}</p>}
                    {!reviewNow && (open === s
                      ? <SubmitForm offeringId={offeringId} section={s} directSave={!!q.data?.directSetupEdits} prior={known(s)} onDone={() => { setOpen(null); refresh(); }} />
                      : <Button size="sm" variant={isDone ? "outline" : "default"} onClick={() => setOpen(s)}>{isDone || Object.values(known(s)).some(Boolean) && !missing(s).length ? "Edit" : "Complete this step"}</Button>)}
                    <History items={sectionItems} isStaff={isStaff} onChange={refresh} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export function OnFile({ section, values, docs }: { section: Section; values: Record<string, string>; docs: string[] }) {
  if (section === "document") return docs.length ? <div className="text-sm"><p className="text-xs font-medium text-muted-foreground">On file</p><ul className="mt-1 list-disc pl-5">{docs.map((d, i) => <li key={i}>{d}</li>)}</ul></div> : null;
  if (section === "bank") return <p className="text-xs text-muted-foreground">Upload your bank's wire instructions letter. Harmonious enters and verifies the full details.</p>;
  const rows = FIELDS[section].filter(([k]) => values[k]?.trim());
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">On file</p>
      <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{rows.map(([k, l]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{l}</dt><dd className="truncate">{values[k]}</dd></div>)}</dl>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, "default" | "secondary" | "destructive" | "outline"]> = { submitted: ["Waiting for Harmonious review", "secondary"], approved: ["Approved", "default"], returned: ["Needs changes", "destructive"], withdrawn: ["Replaced", "outline"] };
  const [t, v] = map[status] ?? [status, "outline"];
  return <Badge variant={v}>{t}</Badge>;
}

export function SubmitForm({ offeringId, section, prior, onDone, directSave = false }: { offeringId: string; section: Section; prior?: Record<string, any>; onDone: () => void; directSave?: boolean }) {
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
      const result = await submit({ data: { offeringId, section, docKind: section === "document" ? (docKind as any) : null, payload, file: f } });
      toast.success(result.applied ? "Saved to the fund record" : "Sent to Harmonious for review");
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
      <div className="sm:col-span-2"><Button onClick={go} disabled={busy}>{busy ? "Saving…" : directSave && (section === "fund_details" || section === "fees_team") ? "Save" : "Submit for review"}</Button></div>
    </div>
  );
}

export function History({ items, isStaff, onChange }: { items: any[]; isStaff: boolean; onChange: () => void }) {
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
            <span className="font-medium">{SECTION_LABEL[i.section as Section]}{i.doc_kind ? ` · ${DOC_KINDS.find((d) => d[0] === i.doc_kind)?.[1]}` : ""}</span>
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
