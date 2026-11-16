import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { enterVerificationFn, verificationCompaniesFn, verificationPeopleFn } from "@/lib/staff-verification.functions";
import {
  AML_RESULTS, FRESH_SCREENING_LISTS, ID_TYPES, KYB_METHODS, KYC_METHODS, SELFIE_RESULTS, cleanIdNumber, entryProblems,
  type AmlEntry, type KybEntry, type KycEntry, type PersonDetails, type SubjectKind,
} from "@/lib/staff-verification-model";

export const STATUS: Record<string, string> = { review: "Waiting for review", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn", not_started: "Not started", pending: "In progress" };
const sel = "h-10 w-full rounded-md border bg-background px-3 text-base";
const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyKyc = (): KycEntry => ({ legalName: "", dateOfBirth: "", idType: "drivers_license", issuingCountry: "United States", issuingRegion: "", idLast4: "", idExpires: "", method: "other_provider", verifiedOn: todayStr(), selfie: "passed" });
const emptyAml = (): AmlEntry => ({ screenedOn: todayStr(), listsChecked: "OFAC SDN and consolidated sanctions lists, PEP and adverse media", result: "no_matches", explanation: "" });
const emptyKyb = (): KybEntry => ({ legalName: "", entityType: "", formationJurisdiction: "", formationDate: "", method: "other_provider", verifiedOn: todayStr(), ownersChecked: "" });
const emptyDetails = (): PersonDetails => ({ addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "", country: "", citizenship: "", phone: "", occupation: "" });
type AmlMode = "run" | "past" | "none";

export function Field({ id, title, children, hint }: { id: string; title: string; children: React.ReactNode; hint?: string }) {
  return <div className="space-y-1"><Label htmlFor={id} className="text-sm">{title}</Label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

function blankToNull<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && !v.trim() ? null : v])) as T;
}

/** Enter one person's or company's KYC/KYB/AML details; saving sends them to a second reviewer. */
export function EnterVerificationDialog({ open, onOpenChange, initialPersonId, initialAccountUserId, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initialPersonId?: string | undefined; initialAccountUserId?: string | undefined; onSaved: () => void;
}) {
  const peopleFn = useServerFn(verificationPeopleFn);
  const companiesFn = useServerFn(verificationCompaniesFn);
  const enter = useServerFn(enterVerificationFn);
  const [subject, setSubject] = useState<SubjectKind>("person");
  const people = useQuery({ queryKey: ["staff-verification-people"], queryFn: () => peopleFn(), enabled: open });
  const companies = useQuery({ queryKey: ["staff-verification-companies"], queryFn: () => companiesFn(), enabled: open && subject === "company" });
  const [personId, setPersonId] = useState(initialPersonId ?? "");
  const [profileId, setProfileId] = useState("");
  const [doKyc, setDoKyc] = useState(true);
  const [doKyb, setDoKyb] = useState(true);
  const [amlMode, setAmlMode] = useState<AmlMode>("run");
  const [kyc, setKyc] = useState<KycEntry>(emptyKyc);
  const [kyb, setKyb] = useState<KybEntry>(emptyKyb);
  const [aml, setAml] = useState<AmlEntry>(emptyAml);
  const [details, setDetails] = useState<PersonDetails>(emptyDetails);
  const [idNumber, setIdNumber] = useState("");
  const [ssn, setSsn] = useState("");
  const [ein, setEin] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID());

  // Opened from an account page: pick the person linked to that login.
  useEffect(() => {
    if (!initialAccountUserId || personId || !people.data) return;
    const match = (people.data as any[]).find((p) => p.userId === initialAccountUserId);
    if (match) setPersonId(match.id);
  }, [initialAccountUserId, people.data, personId]);

  const personOptions = useMemo(() => (people.data ?? []).filter((p: any) => !p.isSelf).map((p: any) => {
    const ctx = [p.clients.length ? `Client contact · ${p.clients.join(", ")}` : null, p.investments ? `Investor · ${p.investments} investment${p.investments > 1 ? "s" : ""}` : null, p.testDemo ? "Test" : null].filter(Boolean).join(" · ");
    return { value: p.id, label: `${p.name}${p.email ? ` · ${p.email}` : ""}${ctx ? ` · ${ctx}` : ""}`, disabled: p.waiting };
  }), [people.data]);
  const companyOptions = useMemo(() => (companies.data ?? []).filter((c: any) => !c.isOwnCompany).map((c: any) => ({
    value: c.id, label: `${c.name} · ${c.type.replace(/_/g, " ")}${c.ownerName ? ` · owner ${c.ownerName}` : ""}`, disabled: c.waiting,
  })), [companies.data]);
  const person = (people.data ?? []).find((p: any) => p.id === personId);
  const company = (companies.data ?? []).find((c: any) => c.id === profileId);

  const reset = () => {
    setPersonId(initialPersonId ?? ""); setProfileId(""); setKyc(emptyKyc()); setKyb(emptyKyb()); setAml(emptyAml()); setDetails(emptyDetails());
    setIdNumber(""); setSsn(""); setEin(""); setSource(""); setNote(""); setFile(null); setProblems([]); setDoKyc(true); setDoKyb(true); setAmlMode("run");
    setClientKey(crypto.randomUUID());
  };
  const save = useMutation({
    mutationFn: async () => {
      const isPerson = subject === "person";
      const k = isPerson && doKyc ? { ...kyc, issuingRegion: kyc.issuingRegion || null } : null;
      const b = !isPerson && doKyb ? blankToNull({ ...kyb }) as KybEntry : null;
      const a = amlMode === "past" ? { ...aml, explanation: aml.explanation || null } : null;
      const d = blankToNull({ ...details, ...(isPerson ? {} : { citizenship: "", occupation: "" }) }) as PersonDetails;
      const input = { subject, kyc: k, kyb: b, aml: a, details: d, runScreening: amlMode === "run", sourceReference: source, idNumber: isPerson ? idNumber || null : null, ssn: isPerson ? ssn || null : null, ein: isPerson ? null : ein || null };
      const p = [...(isPerson && !personId ? ["Choose the person."] : []), ...(!isPerson && !profileId ? ["Choose the company."] : []), ...entryProblems(input, todayStr())];
      if (file && file.size > 15 * 1024 * 1024) p.push("The evidence file must be 15 MB or smaller.");
      setProblems(p);
      if (p.length) throw new Error(p[0]);
      let evidence = null;
      if (file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        evidence = { fileName: file.name, contentType: file.type as "application/pdf" | "image/png" | "image/jpeg", contentBase64: btoa(bin) };
      }
      return enter({ data: { ...input, personId: isPerson ? personId : null, profileId: isPerson ? null : profileId, note: note.trim() || null, evidence, clientKey } });
    },
    onSuccess: (r: any) => {
      const s = r?.screening;
      toast.success(s ? `Saved. Fresh screening: ${s.totalHits ? `${s.totalHits} possible match${s.totalHits > 1 ? "es" : ""} to review` : "no matches"}. It's waiting for another team member to review.` : "Saved. It's waiting for another team member to review.");
      onSaved(); reset(); onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const k = (patch: Partial<KycEntry>) => setKyc({ ...kyc, ...patch });
  const b = (patch: Partial<KybEntry>) => setKyb({ ...kyb, ...patch });
  const a = (patch: Partial<AmlEntry>) => setAml({ ...aml, ...patch });
  const dt = (patch: Partial<PersonDetails>) => setDetails({ ...details, ...patch });
  const isPerson = subject === "person";
  const current: any = isPerson ? person : company;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setProblems([]); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Enter verification details</DialogTitle>
          <DialogDescription>Type what was checked, exactly as it appears on the evidence. Saving sends it for review. Nothing changes on the record until another team member approves.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex gap-2" role="group" aria-label="Who is this for">
            <Button type="button" variant={isPerson ? "default" : "outline"} onClick={() => setSubject("person")}>A person</Button>
            <Button type="button" variant={!isPerson ? "default" : "outline"} onClick={() => setSubject("company")}>A company</Button>
          </div>
          {isPerson ? (
            <Field id="sv-person" title="Person" hint="Investors and client contacts. People already waiting for review can't be picked.">
              <SearchableSelect id="sv-person" aria-label="Person" placeholder={people.isLoading ? "Loading people…" : "Search by name or email…"} options={personOptions} value={personId} onValueChange={setPersonId} />
            </Field>
          ) : (
            <Field id="sv-company" title="Company" hint="Investing entities such as LLCs, trusts and partnerships. Record each owner's ID check under A person.">
              <SearchableSelect id="sv-company" aria-label="Company" placeholder={companies.isLoading ? "Loading companies…" : "Search by company name…"} options={companyOptions} value={profileId} onValueChange={setProfileId} />
            </Field>
          )}
          {current ? <p className="text-xs text-muted-foreground">Currently · {isPerson ? "Identity" : "Business check"}: {STATUS[isPerson ? current.kycStatus : current.kybStatus] ?? (isPerson ? current.kycStatus : current.kybStatus)} · Screening: {STATUS[current.amlStatus] ?? current.amlStatus}{isPerson && !current.hasLogin ? " · No login yet" : ""}</p> : null}

          {isPerson ? (
            <section className="space-y-3 rounded-md border p-4">
              <label className="flex items-center gap-2 text-base font-medium"><Checkbox checked={doKyc} onCheckedChange={(v) => setDoKyc(v === true)} />Past identity check (KYC)</label>
              {doKyc ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="sv-name" title="Full legal name on the ID"><Input id="sv-name" value={kyc.legalName} onChange={(e) => k({ legalName: e.target.value })} /></Field>
                  <Field id="sv-dob" title="Date of birth"><Input id="sv-dob" type="date" value={kyc.dateOfBirth} onChange={(e) => k({ dateOfBirth: e.target.value })} /></Field>
                  <Field id="sv-idtype" title="ID type"><select id="sv-idtype" className={sel} value={kyc.idType} onChange={(e) => k({ idType: e.target.value as KycEntry["idType"] })}>{ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field id="sv-idnum" title="Full ID number (optional)" hint="Stored encrypted. Screens only ever show the last 4.">
                    <Input id="sv-idnum" autoComplete="off" data-private value={idNumber} onChange={(e) => { setIdNumber(e.target.value); const c = cleanIdNumber(e.target.value); if (c.length >= 4) k({ idLast4: c.slice(-4) }); }} />
                  </Field>
                  <Field id="sv-last4" title="Last 4 of ID number"><Input id="sv-last4" maxLength={4} value={kyc.idLast4} onChange={(e) => k({ idLast4: e.target.value.replace(/[^A-Za-z0-9]/g, "") })} /></Field>
                  <Field id="sv-country" title="Issuing country"><Input id="sv-country" value={kyc.issuingCountry} onChange={(e) => k({ issuingCountry: e.target.value })} /></Field>
                  <Field id="sv-region" title="Issuing state (if any)"><Input id="sv-region" value={kyc.issuingRegion ?? ""} onChange={(e) => k({ issuingRegion: e.target.value })} /></Field>
                  <Field id="sv-exp" title="ID expiration date"><Input id="sv-exp" type="date" value={kyc.idExpires} onChange={(e) => k({ idExpires: e.target.value })} /></Field>
                  <Field id="sv-verified" title="Date verified"><Input id="sv-verified" type="date" max={todayStr()} value={kyc.verifiedOn} onChange={(e) => k({ verifiedOn: e.target.value })} /></Field>
                  <Field id="sv-method" title="How it was verified"><select id="sv-method" className={sel} value={kyc.method} onChange={(e) => k({ method: e.target.value as KycEntry["method"] })}>{KYC_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field id="sv-selfie" title="Selfie / face match"><select id="sv-selfie" className={sel} value={kyc.selfie} onChange={(e) => k({ selfie: e.target.value as KycEntry["selfie"] })}>{SELFIE_RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="space-y-3 rounded-md border p-4">
              <label className="flex items-center gap-2 text-base font-medium"><Checkbox checked={doKyb} onCheckedChange={(v) => setDoKyb(v === true)} />Past business check (KYB)</label>
              {doKyb ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="sv-bname" title="Full legal company name"><Input id="sv-bname" value={kyb.legalName} onChange={(e) => b({ legalName: e.target.value })} /></Field>
                  <Field id="sv-btype" title="Entity type" hint="For example: LLC, limited partnership, trust."><Input id="sv-btype" value={kyb.entityType ?? ""} onChange={(e) => b({ entityType: e.target.value })} /></Field>
                  <Field id="sv-bstate" title="State or country formed in"><Input id="sv-bstate" value={kyb.formationJurisdiction ?? ""} onChange={(e) => b({ formationJurisdiction: e.target.value })} /></Field>
                  <Field id="sv-bdate" title="Formation date"><Input id="sv-bdate" type="date" max={todayStr()} value={kyb.formationDate ?? ""} onChange={(e) => b({ formationDate: e.target.value })} /></Field>
                  <Field id="sv-ein" title="EIN (optional)" hint="Stored encrypted. Screens only ever show the last 4."><Input id="sv-ein" autoComplete="off" data-private inputMode="numeric" value={ein} onChange={(e) => setEin(e.target.value)} /></Field>
                  <Field id="sv-bverified" title="Date verified"><Input id="sv-bverified" type="date" max={todayStr()} value={kyb.verifiedOn} onChange={(e) => b({ verifiedOn: e.target.value })} /></Field>
                  <Field id="sv-bmethod" title="How it was verified"><select id="sv-bmethod" className={sel} value={kyb.method} onChange={(e) => b({ method: e.target.value as KybEntry["method"] })}>{KYB_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <div className="sm:col-span-2"><Field id="sv-owners" title="Owners and controllers checked" hint="Names and roles, for example: Avery Example, 100% owner and manager."><Textarea id="sv-owners" rows={2} value={kyb.ownersChecked} onChange={(e) => b({ ownersChecked: e.target.value })} /></Field></div>
                </div>
              ) : null}
            </section>
          )}

          <section className="space-y-3 rounded-md border p-4">
            <p className="text-base font-medium">{isPerson ? "Their details" : "Company address"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field id="sv-addr1" title="Street address"><Input id="sv-addr1" value={details.addressLine1 ?? ""} onChange={(e) => dt({ addressLine1: e.target.value })} /></Field></div>
              <Field id="sv-addr2" title="Apartment, suite (optional)"><Input id="sv-addr2" value={details.addressLine2 ?? ""} onChange={(e) => dt({ addressLine2: e.target.value })} /></Field>
              <Field id="sv-city" title="City"><Input id="sv-city" value={details.city ?? ""} onChange={(e) => dt({ city: e.target.value })} /></Field>
              <Field id="sv-state" title="State"><Input id="sv-state" value={details.region ?? ""} onChange={(e) => dt({ region: e.target.value })} /></Field>
              <Field id="sv-zip" title="ZIP / postal code"><Input id="sv-zip" value={details.postalCode ?? ""} onChange={(e) => dt({ postalCode: e.target.value })} /></Field>
              <Field id="sv-ctry" title="Country"><Input id="sv-ctry" value={details.country ?? ""} onChange={(e) => dt({ country: e.target.value })} /></Field>
              <Field id="sv-phone" title="Phone"><Input id="sv-phone" type="tel" value={details.phone ?? ""} onChange={(e) => dt({ phone: e.target.value })} /></Field>
              {isPerson ? <>
                <Field id="sv-cit" title="Citizenship"><Input id="sv-cit" value={details.citizenship ?? ""} onChange={(e) => dt({ citizenship: e.target.value })} /></Field>
                <Field id="sv-occ" title="Occupation"><Input id="sv-occ" value={details.occupation ?? ""} onChange={(e) => dt({ occupation: e.target.value })} /></Field>
                <Field id="sv-ssn" title="Social Security number (optional)" hint="Stored encrypted. Screens only ever show the last 4."><Input id="sv-ssn" autoComplete="off" data-private inputMode="numeric" value={ssn} onChange={(e) => setSsn(e.target.value)} /></Field>
              </> : null}
            </div>
            <p className="text-xs text-muted-foreground">On approval these only fill in blanks on the record. Anything already saved stays as it is.</p>
          </section>

          <section className="space-y-3 rounded-md border p-4">
            <p className="text-base font-medium">Watchlist screening (AML)</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Screening">
              <Button type="button" size="sm" variant={amlMode === "run" ? "default" : "outline"} onClick={() => setAmlMode("run")}>Run a fresh screening now</Button>
              <Button type="button" size="sm" variant={amlMode === "past" ? "default" : "outline"} onClick={() => setAmlMode("past")}>Record a past screening</Button>
              <Button type="button" size="sm" variant={amlMode === "none" ? "default" : "outline"} onClick={() => setAmlMode("none")}>Skip</Button>
            </div>
            {amlMode === "run" ? <p className="text-sm text-muted-foreground">When you save, we screen {isPerson ? "the name, birthday, citizenship and ID number" : "the company name and formation date"} above against {FRESH_SCREENING_LISTS.toLowerCase()}. It can take up to a minute. Each run is a paid check.</p> : null}
            {amlMode === "none" && current && current.amlStatus !== "approved" ? <p className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">Watchlist screening still needed. {isPerson ? "Identity" : "The business check"} alone won't finish this verification.</p> : null}
            {amlMode === "past" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="sv-aml-date" title="Date screened"><Input id="sv-aml-date" type="date" max={todayStr()} value={aml.screenedOn} onChange={(e) => a({ screenedOn: e.target.value })} /></Field>
                <Field id="sv-aml-result" title="Result"><select id="sv-aml-result" className={sel} value={aml.result} onChange={(e) => a({ result: e.target.value as AmlEntry["result"] })}>{AML_RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <div className="sm:col-span-2"><Field id="sv-aml-lists" title="Watchlists checked"><Input id="sv-aml-lists" value={aml.listsChecked} onChange={(e) => a({ listsChecked: e.target.value })} /></Field></div>
                {aml.result === "matches_ruled_out" ? <div className="sm:col-span-2"><Field id="sv-aml-why" title="Why each possible match was ruled out"><Textarea id="sv-aml-why" rows={3} value={aml.explanation ?? ""} onChange={(e) => a({ explanation: e.target.value })} /></Field></div> : null}
                {aml.result === "confirmed_match" ? <p className="text-sm text-destructive sm:col-span-2">A confirmed match can't be approved here. It will be recorded so compliance can decline and escalate it.</p> : null}
              </div>
            ) : null}
          </section>

          <Field id="sv-source" title="Where the original evidence is kept" hint="For example: the earlier provider's case number, or the folder holding the ID copy.">
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
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? (amlMode === "run" ? "Screening and saving…" : "Saving…") : amlMode === "run" ? "Screen and send for review" : "Save and send for review"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
