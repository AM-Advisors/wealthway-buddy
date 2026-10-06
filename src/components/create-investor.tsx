import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createInvestorFn, searchInvestorsFn } from "@/lib/investor-record.functions";
import { ENTITY_TYPES, PROFILE_TYPES, PROFILE_TYPE_LABELS, validateQuickAdd, type SafeMatch } from "@/lib/investor-record-model";
import { prettyStatus } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SECTIONS = ["Contact", "Investment Profile", "Entity / Ownership", "Investment", "Eligibility", "Documents", "Review"] as const;
type Related = { firstName: string; lastName: string; email: string; role: string; ownershipPercent: string };

/** Search first, then Quick Add or Full Details. Every write re-authorizes on the server. */
export function CreateInvestor({ fundId, isStaff, onDone }: { fundId: string; isStaff: boolean; onDone?: () => void }) {
  const search = useServerFn(searchInvestorsFn);
  const create = useServerFn(createInvestorFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState<Record<string, string>>({ profileType: "individual" });
  const set = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const [matches, setMatches] = useState<SafeMatch[] | null>(null);
  const [chosen, setChosen] = useState<{ personId: string; profileId: string | null } | null>(null);
  const [confirmedNew, setConfirmedNew] = useState(false);
  const [full, setFull] = useState(false);
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Contact");
  const [related, setRelated] = useState<Related[]>([]);
  const [busy, setBusy] = useState(false);

  const cents = (v?: string) => (v ? Math.round(Number(v.replace(/[$,\s]/g, "")) * 100) || null : null);
  const runSearch = async () => {
    if (!f['email'] && !f['lastName'] && !f['entityName']) return void toast.error("Enter an email, name, or entity name to search.");
    try {
      const r = await search({ data: { offeringId: fundId, email: f['email'] || null, name: `${f['firstName'] ?? ""} ${f['lastName'] ?? ""}`.trim() || null, entityName: f['entityName'] || null } });
      setMatches(r.matches); setChosen(null); setConfirmedNew(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  const save = async (continueToRecord: boolean) => {
    const amountCents = cents(f['amount']) ?? 0;
    if (!chosen) {
      const errs = validateQuickAdd({ firstName: f['firstName'], lastName: f['lastName'], email: f['email'], profileType: f['profileType'], amountCents });
      if (errs.length) return void toast.error(errs[0]);
    } else if (!(amountCents > 0)) return void toast.error("Enter the investment amount.");
    setBusy(true);
    try {
      const details: Record<string, string> = {};
      for (const k of ["entityType", "jurisdiction", "trustType", "custodianName", "custodianAccountRef"]) if (f[k]) details[k] = f[k]!;
      const r = await create({ data: {
        offeringId: fundId, personId: chosen?.personId ?? null, profileId: chosen?.profileId ?? null, confirmedNew,
        person: {
          firstName: f['firstName'], middleName: f['middleName'] || null, lastName: f['lastName'], preferredName: f['preferredName'] || null,
          email: f['email'], phone: f['phone'] || null, dateOfBirth: isStaff ? f['dob'] || null : null, citizenship: f['citizenship'] || null,
          addressLine1: f['address1'] || null, addressLine2: f['address2'] || null, city: f['city'] || null, region: f['region'] || null, postalCode: f['postal'] || null, country: f['country'] || null,
          mailingAddress: f['mailing'] ? { line1: f['mailing']! } : null,
        },
        profile: { type: f['profileType'] ?? "individual", subType: f['entityType'] || f['iraType'] || null, legalName: f['entityName'] || null, details },
        taxId: (f['taxId'] ?? "").replace(/\D/g, "") || null,
        investment: {
          amountCents, commitmentCents: cents(f['commitment']), acceptedCents: isStaff ? cents(f['accepted']) : null,
          investmentDate: f['investmentDate'] || null, unitCount: f['units'] ? Number(f['units']) : null,
          sourceReferral: f['referral'] || null, managerNotes: f['managerNotes'] || null, internalNotes: isStaff ? f['internalNotes'] || null : null,
        },
        related: related.filter((r) => r.firstName && r.lastName).map((r) => ({ ...r, email: r.email || null, ownershipPercent: r.ownershipPercent ? Number(r.ownershipPercent) : null })),
      } });
      toast.success("Investor added - Incomplete, additional information required.");
      qc.invalidateQueries({ queryKey: ["fund-investor-records", fundId] });
      qc.invalidateQueries({ queryKey: ["fund-readiness", fundId] });
      onDone?.();
      if (continueToRecord) navigate({ to: "/manager/fund/$fundId/investor/$onboardingId", params: { fundId, onboardingId: r.onboardingId } });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const field = (k: string, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1"><Label htmlFor={`ci-${k}`}>{label}</Label><Input id={`ci-${k}`} value={f[k] ?? ""} onChange={(e) => set(k)(e.target.value)} {...props} /></div>
  );
  const type = f['profileType'] ?? "individual";

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Create New Investor</CardTitle>
        <p className="text-sm text-muted-foreground">We search existing Harmonious records first so nobody is entered twice. Only name, email, how they invest and amount are needed to start.</p></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {field("firstName", "Legal first name")}{field("lastName", "Last name")}
          {field("email", "Email", { type: "email" })}{type !== "individual" ? field("entityName", type === "trust" ? "Trust name" : "Legal investor / entity name") : null}
        </div>
        <Button variant="outline" size="sm" onClick={runSearch}>Search existing investors</Button>

        {matches ? (
          <div className="space-y-2 rounded-md border p-3">
            {matches.length === 0 ? <p className="text-sm text-muted-foreground">No existing investor matches. Continue to create a new record.</p> : <p className="text-sm font-medium">Possible existing investors</p>}
            {matches.map((m) => (
              <div key={m.personId} className="flex flex-wrap items-start justify-between gap-2 border-t pt-2 first:border-0 first:pt-0">
                <div><p className="text-sm font-medium">{m.displayName}</p><p className="text-xs text-muted-foreground">{m.maskedEmail} · matched on {m.strength}{m.alreadyInFund ? " · already in this Fund" : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-1">{m.profiles.map((p) => <Badge key={p.id} variant="secondary">{p.label}</Badge>)}</div></div>
                <div className="flex flex-wrap gap-1">
                  {m.profiles.map((p) => <Button key={p.id} size="sm" variant={chosen?.profileId === p.id ? "default" : "outline"} onClick={() => setChosen({ personId: m.personId, profileId: p.id })}>Use {p.label.replace("Existing ", "")}</Button>)}
                  <Button size="sm" variant={chosen?.personId === m.personId && !chosen.profileId ? "default" : "outline"} onClick={() => setChosen({ personId: m.personId, profileId: null })}>Use person, new profile</Button>
                </div>
              </div>
            ))}
            {matches.some((m) => m.strength === "email") ? (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmedNew} onChange={(e) => { setConfirmedNew(e.target.checked); if (e.target.checked) setChosen(null); }} />Create New - this is a different person</label>
            ) : null}
          </div>
        ) : null}

        {!chosen?.profileId ? (
          <div className="space-y-1"><Label>Investing as</Label>
            <Select value={type} onValueChange={set("profileType")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROFILE_TYPES.map((t) => <SelectItem key={t} value={t}>{PROFILE_TYPE_LABELS[t]}</SelectItem>)}</SelectContent></Select></div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">{field("amount", "Investment amount (USD)", { inputMode: "decimal" })}</div>

        <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setFull((v) => !v)}>{full ? "Hide full investor details" : "Enter Full Investor Details"}</button>

        {full ? (
          <div className="space-y-4 rounded-md border p-3">
            <div className="flex gap-1 overflow-x-auto pb-1">{SECTIONS.map((s) => <Button key={s} size="sm" variant={s === section ? "default" : "ghost"} onClick={() => setSection(s)} className="shrink-0">{s}</Button>)}</div>
            {section === "Contact" ? <div className="grid gap-3 sm:grid-cols-2">
              {field("middleName", "Middle name")}{field("preferredName", "Preferred name")}{field("phone", "Phone")}{field("citizenship", "Citizenship (country)")}
              {isStaff ? field("dob", "Date of birth (Harmonious only)", { type: "date" }) : null}
              {field("address1", "Residential address")}{field("address2", "Address line 2")}{field("city", "City")}{field("region", "State / region")}{field("postal", "Postal code")}{field("country", "Country")}
              {field("mailing", "Mailing address (if different)")}
            </div> : null}
            {section === "Investment Profile" ? <div className="grid gap-3 sm:grid-cols-2">
              {type === "entity" ? <div className="space-y-1"><Label>Entity type</Label><Select value={f['entityType'] ?? ""} onValueChange={set("entityType")}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{prettyStatus(t)}</SelectItem>)}</SelectContent></Select></div> : null}
              {type === "entity" || type === "trust" ? field("jurisdiction", "Jurisdiction") : null}
              {type === "trust" ? field("trustType", "Trust type") : null}
              {type === "ira" ? <>{field("custodianName", "Custodian")}{field("custodianAccountRef", "Custodian account reference (last 4 only)", { maxLength: 4 })}</> : null}
              {type === "individual" || type === "joint" ? <p className="text-sm text-muted-foreground sm:col-span-2">Add joint owners under Entity / Ownership.</p> : null}
              {field("taxId", type === "entity" || type === "trust" ? "EIN / Tax ID (optional)" : "SSN / Tax ID (optional)", { inputMode: "numeric", autoComplete: "off", type: "password", placeholder: "9 digits" })}
              <p className="text-xs text-muted-foreground sm:col-span-2">Stored encrypted. Only the last 4 digits are ever shown.</p>
            </div> : null}
            {section === "Entity / Ownership" ? <div className="space-y-2">
              {related.map((r, i) => <div key={i} className="grid gap-2 sm:grid-cols-5">
                <Input aria-label="First name" placeholder="First name" value={r.firstName} onChange={(e) => setRelated((l) => l.map((x, j) => j === i ? { ...x, firstName: e.target.value } : x))} />
                <Input aria-label="Last name" placeholder="Last name" value={r.lastName} onChange={(e) => setRelated((l) => l.map((x, j) => j === i ? { ...x, lastName: e.target.value } : x))} />
                <Input aria-label="Email" placeholder="Email (optional)" value={r.email} onChange={(e) => setRelated((l) => l.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                <Select value={r.role} onValueChange={(v) => setRelated((l) => l.map((x, j) => j === i ? { ...x, role: v } : x))}><SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger><SelectContent>{["beneficial_owner", "control_person", "authorized_signer", "joint_owner", "trustee"].map((x) => <SelectItem key={x} value={x}>{prettyStatus(x)}</SelectItem>)}</SelectContent></Select>
                <Input aria-label="Ownership %" placeholder="Ownership %" inputMode="decimal" value={r.ownershipPercent} onChange={(e) => setRelated((l) => l.map((x, j) => j === i ? { ...x, ownershipPercent: e.target.value } : x))} />
              </div>)}
              <Button size="sm" variant="outline" onClick={() => setRelated((l) => [...l, { firstName: "", lastName: "", email: "", role: type === "joint" ? "joint_owner" : "beneficial_owner", ownershipPercent: "" }])}>Add person</Button>
            </div> : null}
            {section === "Investment" ? <div className="grid gap-3 sm:grid-cols-2">
              {field("commitment", "Commitment amount (USD)", { inputMode: "decimal" })}{isStaff ? field("accepted", "Accepted amount (Harmonious only)", { inputMode: "decimal" }) : null}
              {field("investmentDate", "Investment date", { type: "date" })}{field("units", "Shares / units", { inputMode: "decimal" })}{field("referral", "Source / referral")}
              <div className="space-y-1 sm:col-span-2"><Label htmlFor="ci-mn">Notes visible to the Fund Manager</Label><Textarea id="ci-mn" value={f['managerNotes'] ?? ""} onChange={(e) => set("managerNotes")(e.target.value)} /></div>
              {isStaff ? <div className="space-y-1 sm:col-span-2"><Label htmlFor="ci-in">Internal Harmonious notes</Label><Textarea id="ci-in" value={f['internalNotes'] ?? ""} onChange={(e) => set("internalNotes")(e.target.value)} /></div> : null}
            </div> : null}
            {section === "Eligibility" ? <p className="text-sm text-muted-foreground">Accreditation and eligibility are completed by the investor and reviewed by Harmonious. Readiness will show what remains after you save.</p> : null}
            {section === "Documents" ? <p className="text-sm text-muted-foreground">Subscription documents are prepared from this record once the investor continues onboarding. Upload supporting files from the investor record after saving.</p> : null}
            {section === "Review" ? <ul className="space-y-1 text-sm">
              <li><span className="text-muted-foreground">Name:</span> {`${f['firstName'] ?? ""} ${f['lastName'] ?? ""}`.trim() || "-"}</li>
              <li><span className="text-muted-foreground">Email:</span> {f['email'] || "-"}</li>
              <li><span className="text-muted-foreground">Investing as:</span> {PROFILE_TYPE_LABELS[type as keyof typeof PROFILE_TYPE_LABELS]} {f['entityName'] ? `· ${f['entityName']}` : ""}</li>
              <li><span className="text-muted-foreground">Amount:</span> {f['amount'] ? `$${f['amount']}` : "-"}</li>
              <li><span className="text-muted-foreground">Related people:</span> {related.filter((r) => r.firstName).length}</li>
              <li className="text-xs text-muted-foreground">Recorded as entered by {isStaff ? "Harmonious" : "the Fund Manager"}. The investor will be asked to confirm it.</li>
            </ul> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(true)} disabled={busy}>{busy ? "Saving…" : "Save & Continue"}</Button>
          <Button variant="outline" onClick={() => save(false)} disabled={busy}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
