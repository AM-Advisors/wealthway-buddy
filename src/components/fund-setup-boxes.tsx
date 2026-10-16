import { invalidateFund } from "@/lib/fund-query-keys";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FileText, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BankingChoice } from "@/components/banking-choice";
import { EinChoice } from "@/components/ein-choice";
import { SubmitForm } from "@/components/fund-manager-setup-loader";
import { saveFundEinFn } from "@/lib/fund-entity.functions";
import { fundEinFn, listFundFilesFn, uploadFundFileFn } from "@/lib/fund-tabs.functions";
import { getFundWireInstructions, saveManagedWireInstructions } from "@/lib/wire-instructions.functions";
import { bankComplete, EIN_RE, einComplete, formatEin, validateBankEntry } from "@/lib/fund-setup-complete";

const inputCls = "h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });

/** A finished section: read-only values, a Complete tick, and a separate Edit panel. */
export function SummaryBox({ title, rows, note, onEdit }: { title: string; rows: [string, React.ReactNode][]; note?: React.ReactNode; onEdit?: () => void }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden />
        <h3 className="flex-1 font-heading text-base font-semibold text-primary">{title}</h3>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium">Complete</span>
        {onEdit && <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k} className="rounded-xl border bg-background px-4 py-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 break-words">{v || "—"}</dd></div>)}
      </dl>
      {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}

export function EditSheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Edit {title}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function LetterPicker({ label, file, setFile, existing }: { label: string; file: File | null; setFile: (f: File | null) => void; existing?: any }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-background px-4 py-3 text-sm">
      <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="flex-1">{file ? file.name : existing ? `${label}: ${existing.file_name ?? existing.title} (replace)` : `Upload ${label}`}</span>
      <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    </label>
  );
}

function useLetters(offeringId: string) {
  const list = useServerFn(listFundFilesFn);
  return useQuery({ queryKey: ["fund-files", offeringId], queryFn: () => list({ data: { fundId: offeringId } }), staleTime: 30_000 });
}
const latest = (files: any[] | undefined, cat: string) => (files ?? []).find((f) => f.category === cat);

async function uploadLetter(upload: any, offeringId: string, file: File, category: string, title: string) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
  await upload({ data: { fundId: offeringId, title, category, fileName: file.name, contentType: file.type || "application/pdf", base64: await toBase64(file) } });
}

/** EIN: type it and load the IRS letter. Becomes a permanent box once both are on file. */
export function EinBox({ offeringId, onChanged }: { offeringId: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const loadEin = useServerFn(fundEinFn);
  const [reveal, setReveal] = useState(false);
  const ein = useQuery({ queryKey: ["fund-ein", offeringId, reveal], queryFn: () => loadEin({ data: { fundId: offeringId, reveal } }) });
  const files = useLetters(offeringId);
  const [editing, setEditing] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const letter = latest(files.data as any[], "ein_letter");
  const status = (ein.data as any)?.status as string | undefined;
  const done = einComplete({ status, hasLetter: !!letter });
  const refresh = () => { void invalidateFund(qc, offeringId); onChanged?.(); };

  if (ein.isPending || files.isPending) return <div className="h-24 animate-pulse rounded-2xl bg-muted" />;
  if ((ein.data as any)?.allowed === false) return null;
  const form = <EinForm offeringId={offeringId} letter={letter} onSaved={() => { setEditing(false); refresh(); }} />;
  if (done) return (
    <>
      <SummaryBox title="EIN" onEdit={() => setEditing(true)} rows={[
        ["EIN", <span className="inline-flex items-center gap-2 font-mono">{(ein.data as any)?.ein}<button type="button" className="font-sans text-xs text-primary underline" onClick={() => setReveal((x) => !x)}>{reveal ? "Hide" : "Show"}</button></span>],
        ["IRS letter", letter?.url ? <a className="inline-flex items-center gap-1 text-primary underline" href={letter.url} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5" />{letter.file_name ?? letter.title}</a> : letter?.file_name],
      ]} note={letter?.created_at ? `Letter added ${new Date(letter.created_at).toLocaleDateString()}` : undefined} />
      <EditSheet open={editing} onOpenChange={setEditing} title="EIN">{form}</EditSheet>
    </>
  );
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2"><h3 className="flex-1 font-heading text-base font-semibold text-primary">EIN</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status === "in_review" ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"}`}>{status === "in_review" ? "Waiting on review" : "Needed"}</span></div>
      {form}
      {status !== "recorded" && <button type="button" className="text-sm text-primary underline" onClick={() => setShowChoice((x) => !x)}>{showChoice ? "Hide EIN options" : "Don't have an EIN yet?"}</button>}
      {showChoice && <EinChoice offeringId={offeringId} onChanged={refresh} />}
    </section>
  );
}

function EinForm({ offeringId, letter, onSaved }: { offeringId: string; letter: any; onSaved: () => void }) {
  const save = useServerFn(saveFundEinFn);
  const upload = useServerFn(uploadFundFileFn);
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (value && !EIN_RE.test(value)) return void toast.error("An EIN looks like 12-3456789.");
    if (!value && !file) return void toast.error("Enter the EIN or choose the IRS letter.");
    setBusy(true);
    try {
      if (value) await save({ data: { offering_id: offeringId, ein: value } });
      if (file) await uploadLetter(upload, offeringId, file, "ein_letter", "IRS EIN letter");
      toast.success("EIN saved"); setValue(""); setFile(null); onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <input className={`${inputCls} font-mono`} inputMode="numeric" placeholder="EIN (12-3456789)" value={value} onChange={(e) => setValue(formatEin(e.target.value))} aria-label="EIN" />
      <LetterPicker label="IRS letter (CP 575 or 147C)" file={file} setFile={setFile} existing={letter} />
      <div className="flex justify-end"><Button size="sm" disabled={busy} onClick={go}>{busy ? "Saving…" : "Save EIN"}</Button></div>
    </div>
  );
}

/** Banking: bank details and the bank letter. Staff enter full numbers; managers send details for Harmonious to enter. */
export function BankBox({ offeringId, isStaff, onChanged }: { offeringId: string; isStaff: boolean; onChanged?: () => void }) {
  const qc = useQueryClient();
  const loadWire = useServerFn(getFundWireInstructions);
  const wire = useQuery({ queryKey: ["fund-wire", offeringId], queryFn: () => loadWire({ data: { offering_id: offeringId } }), retry: false });
  const files = useLetters(offeringId);
  const [editing, setEditing] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const letter = latest(files.data as any[], "bank_letter");
  const det = ((wire.data as any)?.details ?? {}) as Record<string, string>;
  const done = bankComplete({ bankName: det["bank_name"], accountMasked: det["account_number"], hasLetter: !!letter });
  const refresh = () => { void invalidateFund(qc, offeringId); onChanged?.(); };
  if (wire.isPending || files.isPending) return <div className="h-24 animate-pulse rounded-2xl bg-muted" />;
  const form = isStaff
    ? <BankForm offeringId={offeringId} prior={det} letter={letter} onSaved={() => { setEditing(false); refresh(); }} />
    : <div className="space-y-3"><p className="text-sm text-muted-foreground">Send your bank name, account name and the bank letter. Harmonious enters and verifies the full numbers.</p><SubmitForm offeringId={offeringId} section="bank" onDone={() => { setEditing(false); refresh(); }} /></div>;
  if (done) return (
    <>
      <SummaryBox title="Banking" onEdit={() => setEditing(true)} rows={[
        ["Bank", det["bank_name"]], ["Account name", det["account_name"]], ["Account", <span className="font-mono">{det["account_number"]}</span>],
        ["Routing", <span className="font-mono">{det["routing_number"] ? `•••••${String(det["routing_number"]).slice(-4)}` : ""}</span>],
        ["Bank letter", letter?.url ? <a className="inline-flex items-center gap-1 text-primary underline" href={letter.url} target="_blank" rel="noreferrer"><FileText className="h-3.5 w-3.5" />{letter.file_name ?? letter.title}</a> : letter?.file_name],
      ]} note="Full numbers are stored encrypted and shown masked." />
      <EditSheet open={editing} onOpenChange={setEditing} title="Banking">{form}</EditSheet>
    </>
  );
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2"><h3 className="flex-1 font-heading text-base font-semibold text-primary">Banking</h3><span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">Needed</span></div>
      {form}
      <button type="button" className="text-sm text-primary underline" onClick={() => setShowChoice((x) => !x)}>{showChoice ? "Hide bank account options" : "Need a bank account?"}</button>
      {showChoice && <BankingChoice offeringId={offeringId} onChanged={refresh} />}
    </section>
  );
}

function BankForm({ offeringId, prior, letter, onSaved }: { offeringId: string; prior: Record<string, string>; letter: any; onSaved: () => void }) {
  const save = useServerFn(saveManagedWireInstructions);
  const upload = useServerFn(uploadFundFileFn);
  const [v, setV] = useState({ bankName: prior["bank_name"] ?? "", accountName: prior["account_name"] ?? "", account: "", account2: "", routing: "", routing2: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const f = (k: keyof typeof v, label: string, mono = false, type = "text") => (
    <input className={`${inputCls} ${mono ? "font-mono" : ""}`} type={type} autoComplete="off" inputMode={mono ? "numeric" : undefined} placeholder={label} aria-label={label} value={v[k]} onChange={(e) => setV({ ...v, [k]: mono ? e.target.value.replace(/[^\d]/g, "") : e.target.value })} />
  );
  const go = async () => {
    const err = validateBankEntry(v);
    if (err) return void toast.error(err);
    if (!file && !letter) return void toast.error("Add the bank letter.");
    setBusy(true);
    try {
      await save({ data: { offering_id: offeringId, bank_name: v.bankName, bank_address: prior["bank_address"] ?? "", account_name: v.accountName, account_number: v.account, routing_number: v.routing, swift: prior["swift"] ?? "", memo: prior["memo"] ?? "" } });
      if (file) await uploadLetter(upload, offeringId, file, "bank_letter", "Bank letter");
      toast.success("Banking saved"); onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">{f("bankName", "Bank name")}{f("accountName", "Account name")}</div>
      <div className="grid gap-3 sm:grid-cols-2">{f("account", "Account number", true, "password")}{f("account2", "Confirm account number", true)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{f("routing", "Routing number", true, "password")}{f("routing2", "Confirm routing number", true)}</div>
      <LetterPicker label="bank letter" file={file} setFile={setFile} existing={letter} />
      <div className="flex justify-end"><Button size="sm" disabled={busy} onClick={go}>{busy ? "Saving…" : "Save banking"}</Button></div>
    </div>
  );
}
