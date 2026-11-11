import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { decideVerificationFn, enterVerificationFn, verificationEntriesFn, verificationEvidenceLinkFn, verificationPeopleFn } from "@/lib/staff-verification.functions";
import { AML_RESULTS, ID_TYPES, KYC_METHODS, SELFIE_RESULTS, entryProblems, type AmlEntry, type KycEntry } from "@/lib/staff-verification-model";

const STATUS: Record<string, string> = { review: "Waiting for review", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn", not_started: "Not started", pending: "In progress" };
const label = (list: readonly (readonly [string, string])[], v: string | undefined | null) => list.find(([k]) => k === v)?.[1] ?? v ?? "";
const sel = "h-10 w-full rounded-md border bg-background px-3 text-base";
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : "");

const emptyKyc = (): KycEntry => ({ legalName: "", dateOfBirth: "", idType: "drivers_license", issuingCountry: "United States", issuingRegion: "", idLast4: "", idExpires: "", method: "other_provider", verifiedOn: todayStr(), selfie: "passed" });
const emptyAml = (): AmlEntry => ({ screenedOn: todayStr(), listsChecked: "OFAC SDN and consolidated sanctions lists, PEP and adverse media", result: "no_matches", explanation: "" });

function Field({ id, title, children, hint }: { id: string; title: string; children: React.ReactNode; hint?: string }) {
  return <div className="space-y-1"><Label htmlFor={id} className="text-sm">{title}</Label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

/** Operations enter KYC/AML details for investors and client contacts; a second reviewer decides. */
export function StaffVerificationCenter({ initialPersonId }: { initialPersonId?: string | undefined }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"review" | "all">("review");
  const [open, setOpen] = useState(Boolean(initialPersonId));
  const listFn = useServerFn(verificationEntriesFn);
  const q = useQuery({ queryKey: ["staff-verification", filter], queryFn: () => listFn({ data: { filter } }) });
  const decide = useServerFn(decideVerificationFn);
  const linkFn = useServerFn(verificationEvidenceLinkFn);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refresh = () => { qc.invalidateQueries({ queryKey: ["staff-verification"] }); qc.invalidateQueries({ queryKey: ["staff-verification-people"] }); qc.invalidateQueries({ queryKey: ["account-identity-queue"] }); qc.invalidateQueries({ queryKey: ["investor-record"] }); qc.invalidateQueries({ queryKey: ["investment-readiness"] }); };
  const m = useMutation({
    mutationFn: (v: { entryId: string; action: "approve" | "decline" | "withdraw" }) => decide({ data: { ...v, note: notes[v.entryId]?.trim() || null } }),
    onSuccess: (_r, v) => { toast.success(v.action === "approve" ? "Approved. The person's verification is updated." : v.action === "decline" ? "Declined. Nothing changed on the person." : "Withdrawn."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const openEvidence = async (entryId: string) => {
    const w = window.open("", "_blank");
    try { const { url } = await linkFn({ data: { entryId } }); if (w) w.location.href = url; else window.location.href = url; }
    catch (e) { w?.close(); toast.error((e as Error).message); }
  };
  const rows = q.data ?? [];
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="max-w-2xl">
          <CardTitle className="text-lg">Verification details entered by Operations</CardTitle>
          <CardDescription className="text-sm">Enter identity (KYC) and watchlist screening (AML) details for an investor or client contact. A different team member reviews and approves before anything changes on the person.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={filter === "review" ? "default" : "outline"} onClick={() => setFilter("review")}>Waiting for review</Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
          <Button onClick={() => setOpen(true)}>Enter verification details</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          : !rows.length ? <p className="py-6 text-center text-sm text-muted-foreground">{filter === "review" ? "Nothing waiting for review." : "No details entered yet."}</p>
          : rows.map((r: any) => (
            <div key={r.id} className="space-y-2 rounded-md border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><p className="break-words text-base font-medium">{r.person.name}</p>{r.person.email ? <p className="break-all text-xs text-muted-foreground">{r.person.email}</p> : null}</div>
                <Badge variant={r.status === "review" ? "destructive" : "outline"}>{STATUS[r.status] ?? r.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Entered by {r.enteredBy} on {fmt(r.enteredAt)}{r.decidedBy ? ` · ${STATUS[r.status]} by ${r.decidedBy} on ${fmt(r.decidedAt)}` : ""}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">Identity (KYC)</p>
                  {r.kyc ? (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      <li>Name on ID: <strong>{r.kyc.legalName}</strong>{r.person.name && r.kyc.legalName.toLowerCase().replace(/[^a-z]/g, "") !== r.person.name.toLowerCase().replace(/[^a-z]/g, "") ? <span className="text-destructive"> · Record says {r.person.name}</span> : null}</li>
                      <li>Date of birth: {r.kyc.dateOfBirth}{r.person.dateOfBirth && r.person.dateOfBirth !== r.kyc.dateOfBirth ? <span className="text-destructive"> · Record says {r.person.dateOfBirth}</span> : null}</li>
                      <li>{label(ID_TYPES, r.kyc.idType)} · {r.kyc.issuingCountry}{r.kyc.issuingRegion ? `, ${r.kyc.issuingRegion}` : ""} · ending {r.kyc.idLast4} · expires {r.kyc.idExpires}</li>
                      <li>{label(KYC_METHODS, r.kyc.method)} on {r.kyc.verifiedOn}</li>
                      <li className={r.kyc.selfie === "passed" ? "" : "text-destructive"}>{label(SELFIE_RESULTS, r.kyc.selfie)}</li>
                    </ul>
                  ) : <p className="mt-1 text-xs text-muted-foreground">Not included</p>}
                </div>
                <div className="rounded-md bg-muted p-3">
                  <p className="font-medium">Watchlist screening (AML)</p>
                  {r.aml ? (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      <li className={r.aml.result === "confirmed_match" ? "font-medium text-destructive" : ""}>{label(AML_RESULTS, r.aml.result)}</li>
                      <li>Screened on {r.aml.screenedOn}</li>
                      <li className="break-words">Lists: {r.aml.listsChecked}</li>
                      {r.aml.explanation ? <li className="break-words">Why ruled out: {r.aml.explanation}</li> : null}
                    </ul>
                  ) : <p className="mt-1 text-xs text-muted-foreground">Not included</p>}
                </div>
              </div>
              <p className="break-words text-xs">Original evidence: {r.sourceReference}</p>
              {r.note ? <p className="break-words text-xs">Note: {r.note}</p> : null}
              {r.decisionNote ? <p className="break-words text-xs">Decision note: {r.decisionNote}</p> : null}
              {r.hasEvidence ? <Button size="sm" variant="outline" onClick={() => void openEvidence(r.id)}>Open evidence ({r.evidenceName})</Button> : null}
              {r.status === "review" ? (
                <div className="space-y-2 border-t pt-3">
                  <Textarea rows={2} aria-label={`Review note for ${r.person.name}`} placeholder={r.enteredByMe ? "Someone else must approve details you entered. Super Admins may approve with a reason." : "Note (required to decline, or when the name differs or no selfie was done)"} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={m.isPending} onClick={() => m.mutate({ entryId: r.id, action: "approve" })}>Approve</Button>
                    <Button variant="destructive" disabled={m.isPending} onClick={() => m.mutate({ entryId: r.id, action: "decline" })}>Decline</Button>
                    {r.enteredByMe ? <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate({ entryId: r.id, action: "withdraw" })}>Withdraw</Button> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
      </CardContent>
      <EnterVerificationDialog open={open} onOpenChange={setOpen} initialPersonId={initialPersonId} onSaved={refresh} />
    </Card>
  );
}

function EnterVerificationDialog({ open, onOpenChange, initialPersonId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; initialPersonId?: string | undefined; onSaved: () => void }) {
  const peopleFn = useServerFn(verificationPeopleFn);
  const enter = useServerFn(enterVerificationFn);
  const people = useQuery({ queryKey: ["staff-verification-people"], queryFn: () => peopleFn(), enabled: open });
  const [personId, setPersonId] = useState(initialPersonId ?? "");
  const [doKyc, setDoKyc] = useState(true);
  const [doAml, setDoAml] = useState(true);
  const [kyc, setKyc] = useState<KycEntry>(emptyKyc);
  const [aml, setAml] = useState<AmlEntry>(emptyAml);
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const options = useMemo(() => (people.data ?? []).filter((p: any) => !p.isSelf).map((p: any) => {
    const ctx = [p.clients.length ? `Client contact · ${p.clients.join(", ")}` : null, p.investments ? `Investor · ${p.investments} investment${p.investments > 1 ? "s" : ""}` : null, p.testDemo ? "Test" : null].filter(Boolean).join(" · ");
    return { value: p.id, label: `${p.name}${p.email ? ` · ${p.email}` : ""}${ctx ? ` · ${ctx}` : ""}`, disabled: p.waiting };
  }), [people.data]);
  const person = (people.data ?? []).find((p: any) => p.id === personId);
  const reset = () => { setPersonId(initialPersonId ?? ""); setKyc(emptyKyc()); setAml(emptyAml()); setSource(""); setNote(""); setFile(null); setProblems([]); setDoKyc(true); setDoAml(true); };
  const save = useMutation({
    mutationFn: async () => {
      const k = doKyc ? kyc : null, a = doAml ? aml : null;
      const p = [...(!personId ? ["Choose the person."] : []), ...entryProblems({ kyc: k, aml: a, sourceReference: source }, todayStr())];
      if (file && file.size > 15 * 1024 * 1024) p.push("The evidence file must be 15 MB or smaller.");
      setProblems(p);
      if (p.length) throw new Error(p[0]);
      let evidence = null;
      if (file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        evidence = { fileName: file.name, contentType: file.type as "application/pdf" | "image/png" | "image/jpeg", contentBase64: btoa(bin) };
      }
      return enter({ data: { personId, kyc: k ? { ...k, issuingRegion: k.issuingRegion || null } : null, aml: a ? { ...a, explanation: a.explanation || null } : null, sourceReference: source, note: note.trim() || null, evidence } });
    },
    onSuccess: () => { toast.success("Saved. It's waiting for another team member to review."); onSaved(); reset(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const k = (patch: Partial<KycEntry>) => setKyc({ ...kyc, ...patch });
  const a = (patch: Partial<AmlEntry>) => setAml({ ...aml, ...patch });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setProblems([]); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Enter verification details</DialogTitle>
          <DialogDescription>Type what you checked, exactly as it appears on the evidence. Saving sends it for review. Nothing changes on the person until another team member approves.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Field id="sv-person" title="Person" hint="Investors and client contacts. People already waiting for review can't be picked.">
            <SearchableSelect id="sv-person" aria-label="Person" placeholder={people.isLoading ? "Loading people…" : "Search by name or email…"} options={options} value={personId} onValueChange={setPersonId} />
          </Field>
          {person ? <p className="text-xs text-muted-foreground">Currently · Identity: {STATUS[person.kycStatus] ?? person.kycStatus} · Screening: {STATUS[person.amlStatus] ?? person.amlStatus}{person.hasLogin ? "" : " · No login yet"}</p> : null}

          <section className="space-y-3 rounded-md border p-4">
            <label className="flex items-center gap-2 text-base font-medium"><Checkbox checked={doKyc} onCheckedChange={(v) => setDoKyc(v === true)} />Identity (KYC)</label>
            {doKyc ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="sv-name" title="Full legal name on the ID"><Input id="sv-name" value={kyc.legalName} onChange={(e) => k({ legalName: e.target.value })} /></Field>
                <Field id="sv-dob" title="Date of birth"><Input id="sv-dob" type="date" value={kyc.dateOfBirth} onChange={(e) => k({ dateOfBirth: e.target.value })} /></Field>
                <Field id="sv-idtype" title="ID type"><select id="sv-idtype" className={sel} value={kyc.idType} onChange={(e) => k({ idType: e.target.value as KycEntry["idType"] })}>{ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <Field id="sv-last4" title="Last 4 of ID number" hint="Never the full number."><Input id="sv-last4" maxLength={4} value={kyc.idLast4} onChange={(e) => k({ idLast4: e.target.value.replace(/[^A-Za-z0-9]/g, "") })} /></Field>
                <Field id="sv-country" title="Issuing country"><Input id="sv-country" value={kyc.issuingCountry} onChange={(e) => k({ issuingCountry: e.target.value })} /></Field>
                <Field id="sv-region" title="Issuing state (if any)"><Input id="sv-region" value={kyc.issuingRegion ?? ""} onChange={(e) => k({ issuingRegion: e.target.value })} /></Field>
                <Field id="sv-exp" title="ID expiration date"><Input id="sv-exp" type="date" value={kyc.idExpires} onChange={(e) => k({ idExpires: e.target.value })} /></Field>
                <Field id="sv-verified" title="Date verified"><Input id="sv-verified" type="date" max={todayStr()} value={kyc.verifiedOn} onChange={(e) => k({ verifiedOn: e.target.value })} /></Field>
                <Field id="sv-method" title="How it was verified"><select id="sv-method" className={sel} value={kyc.method} onChange={(e) => k({ method: e.target.value as KycEntry["method"] })}>{KYC_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <Field id="sv-selfie" title="Selfie / face match"><select id="sv-selfie" className={sel} value={kyc.selfie} onChange={(e) => k({ selfie: e.target.value as KycEntry["selfie"] })}>{SELFIE_RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-md border p-4">
            {!doAml && person && person.amlStatus !== "cleared" && person.amlStatus !== "verified" ? <p className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">Watchlist screening still needed. Identity alone won't finish this person's verification.</p> : null}
            <label className="flex items-center gap-2 text-base font-medium"><Checkbox checked={doAml} onCheckedChange={(v) => setDoAml(v === true)} />Watchlist screening (AML)</label>
            {doAml ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="sv-aml-date" title="Date screened"><Input id="sv-aml-date" type="date" max={todayStr()} value={aml.screenedOn} onChange={(e) => a({ screenedOn: e.target.value })} /></Field>
                <Field id="sv-aml-result" title="Result"><select id="sv-aml-result" className={sel} value={aml.result} onChange={(e) => a({ result: e.target.value as AmlEntry["result"] })}>{AML_RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <div className="sm:col-span-2"><Field id="sv-aml-lists" title="Watchlists checked"><Input id="sv-aml-lists" value={aml.listsChecked} onChange={(e) => a({ listsChecked: e.target.value })} /></Field></div>
                {aml.result === "matches_ruled_out" ? <div className="sm:col-span-2"><Field id="sv-aml-why" title="Why each possible match was ruled out"><Textarea id="sv-aml-why" rows={3} value={aml.explanation ?? ""} onChange={(e) => a({ explanation: e.target.value })} /></Field></div> : null}
                {aml.result === "confirmed_match" ? <p className="text-sm text-destructive sm:col-span-2">A confirmed match can't be approved here. It will be recorded so compliance can decline and escalate it.</p> : null}
              </div>
            ) : null}
          </section>

          <Field id="sv-source" title="Where the original evidence is kept" hint="For example: the other provider's case number, or the folder holding the ID copy.">
            <Input id="sv-source" value={source} onChange={(e) => setSource(e.target.value)} />
          </Field>
          <Field id="sv-file" title="Evidence file (optional)" hint="PDF, PNG or JPEG, up to 15 MB. Stored privately; each view is logged.">
            <Input id="sv-file" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field id="sv-note" title="Note for the reviewer (optional)"><Textarea id="sv-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {problems.length ? <ul className="list-disc space-y-0.5 pl-5 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save and send for review"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
