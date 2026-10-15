import { useEffect, useState } from "react";
import { SignHereTag, useSignHere } from "@/components/signature-adopt-dialog";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  cancelSs4RequestFn,
  resendSs4RequestFn,
  getSs4SignRequestFn,
  sendSs4RequestFn,
  signSs4RequestFn,
  ss4RequestContextFn,
  ss4SignedPdfUrlFn,
} from "@/lib/ss4-request.functions";

type Form = Record<string, string | boolean>;
type Opt = { value: string; label: string };

const ENTITY_KINDS: Opt[] = [
  { value: "partnership", label: "Partnership" }, { value: "corporation", label: "Corporation" },
  { value: "personal_service_corp", label: "Personal service corporation" }, { value: "trust", label: "Trust" },
  { value: "estate", label: "Estate" }, { value: "sole_proprietor", label: "Sole proprietor" }, { value: "other", label: "Other" },
];
const REASONS: Opt[] = [
  { value: "started_business", label: "Started a new business" }, { value: "banking_purpose", label: "Banking purpose" },
  { value: "hired_employees", label: "Hired employees" }, { value: "compliance", label: "Compliance with IRS withholding" },
  { value: "changed_type", label: "Changed type of organization" }, { value: "purchased_business", label: "Purchased a going business" },
  { value: "created_trust", label: "Created a trust" }, { value: "created_pension", label: "Created a pension plan" }, { value: "other", label: "Other" },
];
const ACTIVITIES: Opt[] = [
  { value: "finance_insurance", label: "Finance & insurance" }, { value: "real_estate", label: "Real estate" },
  { value: "rental_leasing", label: "Rental & leasing" }, { value: "construction", label: "Construction" },
  { value: "manufacturing", label: "Manufacturing" }, { value: "retail", label: "Retail" }, { value: "other", label: "Other" },
];

type Line = { key: string; line: string; label: string; kind?: "bool" | Opt[] };
export const SS4_LINES: Line[] = [
  { key: "legal_name", line: "1", label: "Legal name of entity" },
  { key: "trade_name", line: "2", label: "Trade name (if different)" },
  { key: "care_of", line: "3", label: "Executor, administrator, trustee, \"care of\" name" },
  { key: "mailing_street", line: "4a", label: "Mailing address (street)" },
  { key: "mailing_city_state_zip", line: "4b", label: "City, state and ZIP" },
  { key: "street_address", line: "5a", label: "Street address (if different)" },
  { key: "street_city_state_zip", line: "5b", label: "City, state and ZIP" },
  { key: "county_state", line: "6", label: "County and state of principal business" },
  { key: "responsible_party_name", line: "7a", label: "Responsible party name" },
  { key: "is_llc", line: "8a", label: "Is this a limited liability company?", kind: "bool" },
  { key: "llc_members", line: "8b", label: "Number of LLC members" },
  { key: "llc_us_organized", line: "8c", label: "LLC organized in the United States?", kind: "bool" },
  { key: "entity_kind", line: "9a", label: "Type of entity", kind: ENTITY_KINDS },
  { key: "entity_detail", line: "9a", label: "Entity detail (if required)" },
  { key: "state_incorporated", line: "9b", label: "State where incorporated / formed" },
  { key: "reason", line: "10", label: "Reason for applying", kind: REASONS },
  { key: "reason_detail", line: "10", label: "Reason detail" },
  { key: "date_started", line: "11", label: "Date business started (MM/DD/YYYY)" },
  { key: "closing_month", line: "12", label: "Closing month of accounting year" },
  { key: "employees_agricultural", line: "13", label: "Employees: agricultural" },
  { key: "employees_household", line: "13", label: "Employees: household" },
  { key: "employees_other", line: "13", label: "Employees: other" },
  { key: "first_wages_date", line: "15", label: "First date wages paid" },
  { key: "principal_activity", line: "16", label: "Principal activity", kind: ACTIVITIES },
  { key: "principal_activity_other", line: "16", label: "Activity (if other)" },
  { key: "principal_line", line: "17", label: "Principal line of business" },
  { key: "previous_ein_applied", line: "18", label: "Has the entity applied for an EIN before?", kind: "bool" },
  { key: "previous_ein", line: "18", label: "Previous EIN" },
  { key: "designee_name", line: "TPD", label: "Third party designee name" },
  { key: "designee_phone", line: "TPD", label: "Designee phone" },
  { key: "designee_address", line: "TPD", label: "Designee address and ZIP" },
  { key: "applicant_name_title", line: "Sign", label: "Applicant name and title" },
  { key: "applicant_phone", line: "Sign", label: "Applicant phone" },
];

const show = (l: Line, v: unknown) => {
  if (l.kind === "bool") return v === true ? "Yes" : v === false ? "No" : "—";
  if (Array.isArray(l.kind)) return l.kind.find((o) => o.value === v)?.label ?? (v ? String(v) : "—");
  return String(v ?? "").trim() || "—";
};

function LineEditor({ form, onChange }: { form: Form; onChange: (f: Form) => void }) {
  const set = (k: string, v: string | boolean) => onChange({ ...form, [k]: v });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {SS4_LINES.filter((l) => l.line !== "Sign").map((l) => (
        <div key={l.key} className="space-y-1">
          <Label className="text-xs"><span className="text-muted-foreground">Line {l.line} · </span>{l.label}</Label>
          {l.kind === "bool" ? (
            <div className="flex h-9 items-center gap-2"><Checkbox checked={form[l.key] === true} onCheckedChange={(v) => set(l.key, Boolean(v))} /><span className="text-sm">{form[l.key] === true ? "Yes" : "No"}</span></div>
          ) : Array.isArray(l.kind) ? (
            <Select value={String(form[l.key] ?? "")} onValueChange={(v) => set(l.key, v)}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{l.kind.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <Input value={String(form[l.key] ?? "")} onChange={(e) => set(l.key, e.target.value)} />
          )}
        </div>
      ))}
      <div className="space-y-1">
        <Label className="text-xs"><span className="text-muted-foreground">Signature · </span>Applicant name and title</Label>
        <Input value={String(form["applicant_name_title"] ?? "")} onChange={(e) => set("applicant_name_title", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs"><span className="text-muted-foreground">Signature · </span>Applicant phone</Label>
        <Input value={String(form["applicant_phone"] ?? "")} onChange={(e) => set("applicant_phone", e.target.value)} />
      </div>
    </div>
  );
}

const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "");

/** Staff: prefill the SS-4 from the fund and send it to a fund manager to sign. */
export function Ss4RequestPanel({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const loadFn = useServerFn(ss4RequestContextFn);
  const sendFn = useServerFn(sendSs4RequestFn);
  const cancelFn = useServerFn(cancelSs4RequestFn);
  const resendFn = useServerFn(resendSs4RequestFn);
  const pdfFn = useServerFn(ss4SignedPdfUrlFn);
  const [signer, setSigner] = useState<string | undefined>();
  const [form, setForm] = useState<Form | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["ss4-request", fundId, signer ?? null], queryFn: () => loadFn({ data: { offeringId: fundId, signerUserId: signer } }) });
  useEffect(() => { if (q.data) { setForm(q.data.form as Form); if (!signer && q.data.signerUserId) setSigner(q.data.signerUserId); } }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    mutationFn: () => sendFn({ data: { offeringId: fundId, signerUserId: signer!, form: form!, note: note || undefined } }),
    onSuccess: (r) => { toast.success(r.emailed ? `Sent to ${r.signerEmail} to sign.` : "Request created. The manager has no login email, so share the link with them."); setOpen(false); setNote(""); qc.invalidateQueries({ queryKey: ["ss4-request", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({ mutationFn: (id: string) => cancelFn({ data: { requestId: id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["ss4-request", fundId] }), onError: (e: Error) => toast.error(e.message) });
  const resend = useMutation({
    mutationFn: async (id: string) => {
      try { return await resendFn({ data: { requestId: id } }); }
      catch (e: any) {
        if (!/24 hours/.test(e?.message ?? "")) throw e;
        const reason = window.prompt("A reminder was already sent today. Super Admins can send another — enter a reason (it's logged):");
        if (!reason?.trim()) throw e;
        return await resendFn({ data: { requestId: id, overrideReason: reason.trim() } });
      }
    },
    onSuccess: (r) => { toast.success(`Reminder sent to ${r.signerEmail}.`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const openPdf = async (id: string) => { try { const r = await pdfFn({ data: { requestId: id } }); if (r.url) window.open(r.url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); } };

  if (q.isLoading) return <div className="h-20 animate-pulse rounded-lg bg-muted" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  return (
    <div className="space-y-4 rounded-lg border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Request Form SS-4 signature from the fund manager</h3>
          <p className="text-xs text-muted-foreground">Every line is filled in from the fund's details. The manager checks it, adds the Responsible Party SSN or ITIN, and signs. Harmonious files the signed form with the IRS by hand.</p>
        </div>
        {!open && <Button size="sm" onClick={() => setOpen(true)} disabled={!d.managers.length}>Prepare SS-4 to sign</Button>}
      </div>
      {!d.managers.length && <p className="text-sm text-muted-foreground">This fund has no fund manager with a login yet, so there's no one to send it to.</p>}

      {open && form && (
        <div className="space-y-4 border-t pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Send to</Label>
              <Select value={signer ?? ""} onValueChange={setSigner}>
                <SelectTrigger><SelectValue placeholder="Choose a fund manager" /></SelectTrigger>
                <SelectContent>{d.managers.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.name}{m.email ? ` (${m.email})` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note to the manager (optional)</Label>
              <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <LineEditor form={form} onChange={setForm} />
          <p className="text-xs text-muted-foreground">Line 7b (SSN/ITIN) is entered only by the manager when signing and is stored encrypted.</p>
          <div className="flex gap-2">
            <Button onClick={() => send.mutate()} disabled={!signer || send.isPending}>{send.isPending ? "Sending…" : "Send to sign"}</Button>
            <Button variant="outline" onClick={() => { setOpen(false); setForm(d.form as Form); }}>Cancel</Button>
          </div>
        </div>
      )}

      {d.requests.length > 0 && (
        <div className="divide-y border-t pt-2">
          {d.requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-medium">{r.signer}</div>
                <div className="text-xs text-muted-foreground">Sent {when(r.createdAt)}{r.signedAt ? ` · Signed ${when(r.signedAt)} by ${r.signedBy}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "signed" ? "default" : "outline"}>{r.status === "requested" ? "Waiting for signature" : r.status === "signed" ? "Signed" : "Cancelled"}</Badge>
                {r.hasPdf && <Button size="sm" variant="outline" onClick={() => openPdf(r.id)}>Open signed SS-4</Button>}
                {r.status === "requested" && <Button size="sm" variant="outline" onClick={() => resend.mutate(r.id)} disabled={resend.isPending}>{resend.isPending ? "Sending…" : "Send reminder"}</Button>}
                {r.status === "requested" && <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}>Cancel</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fund manager: review the prefilled SS-4, add the SSN/ITIN and sign. */
export function Ss4SignView({ requestId }: { requestId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getSs4SignRequestFn);
  const signFn = useServerFn(signSs4RequestFn);
  const pdfFn = useServerFn(ss4SignedPdfUrlFn);
  const q = useQuery({ queryKey: ["ss4-sign", requestId], queryFn: () => getFn({ data: { requestId } }), retry: false });
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [tin, setTin] = useState("");
  const [consent, setConsent] = useState(false);
  const sig = useSignHere(name);
  useEffect(() => {
    if (!q.data) return;
    const [n, ...t] = String(q.data.form["applicant_name_title"] ?? "").split(",");
    setName((n ?? "").trim()); setTitle(t.join(",").trim()); setPhone(String(q.data.form["applicant_phone"] ?? ""));
  }, [q.data]);
  const sign = useMutation({
    mutationFn: () => signFn({ data: { requestId, signerName: name, signerTitle: title, phone, responsiblePartyTin: tin, consent: true, signature: sig.signature ? { method: sig.signature.method, image: sig.signature.image } : undefined, userAgent: navigator.userAgent } }),
    onSuccess: () => { toast.success("Signed. Harmonious will file your SS-4 with the IRS."); setTin(""); qc.invalidateQueries({ queryKey: ["ss4-sign", requestId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const openPdf = async () => { try { const r = await pdfFn({ data: { requestId } }); if (r.url) window.open(r.url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); } };

  if (q.isLoading) return <div className="mx-auto max-w-4xl space-y-3 p-6">{[0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />)}</div>;
  if (q.error) return <p className="mx-auto max-w-4xl p-6 text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 bg-background p-4 md:p-6">
      <div>
        <Link to="/manager/fund/$fundId" params={{ fundId: d.offeringId }} className="text-xs text-muted-foreground hover:underline">← {d.fundName}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Form SS-4: EIN application</h1>
        <p className="text-sm text-muted-foreground">Harmonious filled this in from your fund's details. Check every line, then sign at the bottom.</p>
      </div>
      {d.note && <div className="rounded-lg border bg-muted/40 p-4 text-sm"><span className="font-medium">Note from Harmonious: </span>{d.note}</div>}

      <section className="rounded-lg border">
        <div className="border-b px-5 py-3 text-sm font-semibold">Form details</div>
        <dl className="divide-y">
          {SS4_LINES.map((l) => (
            <div key={l.key} className="grid grid-cols-[4rem_1fr] gap-2 px-5 py-2 text-sm md:grid-cols-[4rem_1fr_1fr]">
              <dt className="text-xs text-muted-foreground">{l.line}</dt>
              <dt className="text-muted-foreground md:col-auto">{l.label}</dt>
              <dd className="col-span-2 font-medium md:col-span-1">{show(l, d.form[l.key])}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[4rem_1fr] gap-2 px-5 py-2 text-sm md:grid-cols-[4rem_1fr_1fr]">
            <dt className="text-xs text-muted-foreground">7b</dt><dt className="text-muted-foreground">Responsible party SSN / ITIN</dt>
            <dd className="col-span-2 font-medium md:col-span-1">{d.tinOnFile ? `On file, ending ${d.tinLast4 ?? "••••"}` : "Add below"}</dd>
          </div>
        </dl>
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">Something wrong? Reply to Harmonious before signing and they'll send a corrected form.</p>
      </section>

      {d.status === "signed" ? (
        <section className="space-y-3 rounded-lg border p-5">
          <Badge>Signed</Badge>
          <p className="text-sm">Signed by {d.signedBy} on {when(d.signedAt)}. Harmonious will file it with the IRS and add your EIN to the fund.</p>
          <Button variant="outline" onClick={openPdf}>Open signed SS-4</Button>
        </section>
      ) : d.status === "cancelled" ? (
        <p className="rounded-lg border p-5 text-sm text-muted-foreground">Harmonious cancelled this request. Look for a newer one in your email.</p>
      ) : (
        <section className="space-y-4 rounded-lg border p-5">
          <h2 className="text-sm font-semibold">Sign</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label className="text-xs">Full legal name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Managing Member" /></div>
            <div className="space-y-1"><Label className="text-xs">Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1">
              <Label className="text-xs">Responsible party SSN or ITIN (line 7b){d.tinOnFile ? " — optional, replaces the one on file" : ""}</Label>
              <Input value={tin} onChange={(e) => setTin(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="123-45-6789" />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} className="mt-0.5" />
            <span>Under penalties of perjury, I declare that I have examined this application, and to the best of my knowledge and belief, it is true, correct and complete. I agree that the signature I adopt is my electronic signature.</span>
          </label>
          <div className="space-y-1"><Label className="text-xs">Signature</Label><SignHereTag signature={sig.signature} signed={sig.signed} onClick={sig.click} />{sig.dialog}</div>
          <Button onClick={() => sign.mutate()} disabled={!consent || !sig.signed || name.trim().length < 2 || title.trim().length < 2 || (!d.tinOnFile && !tin.trim()) || sign.isPending}>{sign.isPending ? "Signing…" : "Sign Form SS-4"}</Button>
        </section>
      )}
    </div>
  );
}
