import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { addDistributionDestinationFn, editRelatedPartyFn, updateInvestorRecordFn } from "@/lib/investor-record.functions";
import { isPaperworkContactRole, relatedRoleLabel } from "@/lib/investor-record-model";
import { RELATED_REVIEW_MESSAGE } from "@/lib/related-person-model";
import { entityRequirements, missingPersonFields, needsFullDetails } from "@/lib/entity-investor-requirements";
import { prettyStatus } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES = ["beneficial_owner", "control_person", "authorized_signer", "joint_owner", "trustee", "owner", "officer", "manager", "member"] as const;

type Related = {
  id: string; name: string; role: string; ownershipPercent: number | null; signer: boolean; underReview?: boolean;
  email?: string | null; phone?: string | null; hasAccount?: boolean; dobOnFile?: boolean; ssnOnFile?: boolean;
  dateOfBirth?: string | null; ssnLast4?: string | null; taxFormSigner?: boolean; responsibleParty?: boolean;
};

function RoleSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
      {ROLES.map((r) => <option key={r} value={r}>{prettyStatus(r)}</option>)}
    </select>
  );
}

const Req = ({ children }: { children: ReactNode }) => <>{children} <span className="text-destructive" aria-hidden>*</span></>;

/** Entity checklist: what is still required for an entity or trust investor. */
export function EntityRequirementsList({ legalName, einOnFile, related }: { legalName: string | null; einOnFile: boolean; related: Related[] }) {
  const people = related.filter((r) => !isPaperworkContactRole(r.role)).map((r) => ({ id: r.id, name: r.name, role: r.role, ownershipPercent: r.ownershipPercent, signer: r.signer, email: r.email ?? null, dobOnFile: Boolean(r.dobOnFile), ssnOnFile: Boolean(r.ssnOnFile), taxFormSigner: Boolean(r.taxFormSigner) }));
  const items = entityRequirements({ legalName, einOnFile, responsiblePartyId: related.find((r) => r.responsibleParty)?.id ?? null, people });
  const open = items.filter((i) => !i.done);
  return (
    <div className="rounded-md border bg-muted/40 p-3 sm:col-span-2">
      <p className="text-sm font-medium">{open.length ? `${open.length} required item${open.length === 1 ? "" : "s"} left` : "All required entity details are on file"}</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {items.map((i) => <li key={i.key} className="flex items-start gap-2"><span aria-hidden className={i.done ? "text-primary" : "text-destructive"}>{i.done ? "✓" : "○"}</span><span className={i.done ? "text-muted-foreground" : ""}>{i.label}</span></li>)}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Owners with 25% or more, control persons, trustees and signers need name, email, date of birth and SSN.</p>
    </div>
  );
}

type PersonDraft = { email: string; phone: string; dob: string; ssn: string };

/** Editable owners, control persons and signers. Every change is checked and recorded on the server. */
export function RelatedPartiesEditor({ onboardingId, related, editable, onChanged, entity = false }: { onboardingId: string; related: Related[]; editable: boolean; onChanged: () => void; entity?: boolean }) {
  const edit = useServerFn(editRelatedPartyFn);
  const [busy, setBusy] = useState(false);
  const blank = { firstName: "", lastName: "", email: "", phone: "", dob: "", ssn: "", role: "beneficial_owner", pct: "", signer: false };
  const [draft, setDraft] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [rows, setRows] = useState<Record<string, { role: string; pct: string; signer: boolean }>>({});
  const [details, setDetails] = useState<Record<string, PersonDraft>>({});
  const run = async (payload: any, ok: string) => {
    setBusy(true);
    try {
      const r: any = await edit({ data: { onboardingId, ...payload } });
      toast.success(r?.underReview ? `${ok}. ${RELATED_REVIEW_MESSAGE}` : ok);
      onChanged();
      return true;
    } catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(false); }
  };
  const pct = (v: string) => (v.trim() === "" ? null : Number(v));
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 9);

  const contacts = related.filter((r) => isPaperworkContactRole(r.role));
  const owners = related.filter((r) => !isPaperworkContactRole(r.role));
  const signers = owners.filter((r) => r.signer);

  return (
    <div className="space-y-4 sm:col-span-2">
      {contacts.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Paperwork contact</p>
          <ul className="space-y-2">
            {contacts.map((r) => (
              <li key={r.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{relatedRoleLabel(r.role)}{r.email ? ` · ${r.email}` : ""} · receives the invitation and reminders; the investor still signs{r.underReview ? ` · ${RELATED_REVIEW_MESSAGE}` : ""}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="text-sm font-medium">Owners, control persons & signers</p>
        {!editable ? <p className="text-xs text-muted-foreground">Signing or funding has started, so changes go through Harmonious.</p> : null}
      </div>

      {entity && owners.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="rp-resp"><Req>Responsible party</Req></Label>
            <select id="rp-resp" disabled={!editable || busy} value={owners.find((r) => r.responsibleParty)?.id ?? ""} onChange={(e) => e.target.value && run({ responsiblePartyId: e.target.value }, "Responsible party saved")} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Choose a person</option>
              {owners.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">The person who controls the entity for IRS purposes.</p></div>
          <div className="space-y-1"><Label htmlFor="rp-w9"><Req>W-9 signer</Req></Label>
            <select id="rp-w9" disabled={!editable || busy || !signers.length} value={signers.find((r) => r.taxFormSigner)?.id ?? ""} onChange={(e) => e.target.value && run({ taxFormSignerId: e.target.value }, "W-9 signer assigned")} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="">{signers.length ? "Choose a signer" : "Mark someone as a signer first"}</option>
              {signers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">One of the signers certifies the entity's W-9.</p></div>
        </div>
      ) : null}

      {owners.length === 0 ? <p className="text-sm text-muted-foreground">None recorded yet.</p> : (
        <ul className="space-y-3">
          {owners.map((r) => {
            const cur = rows[r.id] ?? { role: r.role, pct: r.ownershipPercent == null ? "" : String(r.ownershipPercent), signer: r.signer };
            const setRow = (patch: Partial<typeof cur>) => setRows((s) => ({ ...s, [r.id]: { ...cur, ...patch } }));
            const dd = details[r.id] ?? { email: "", phone: "", dob: "", ssn: "" };
            const setD = (patch: Partial<PersonDraft>) => setDetails((s) => ({ ...s, [r.id]: { ...dd, ...patch } }));
            const full = needsFullDetails({ role: cur.role, ownershipPercent: pct(cur.pct), signer: cur.signer });
            const missing = missingPersonFields({ id: r.id, name: r.name, role: r.role, ownershipPercent: r.ownershipPercent, signer: r.signer, email: r.email ?? null, dobOnFile: Boolean(r.dobOnFile), ssnOnFile: Boolean(r.ssnOnFile) });
            const hasDraft = Boolean(dd.email.trim() || dd.phone.trim() || dd.dob || dd.ssn);
            return (
              <li key={r.id} className="space-y-3 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{relatedRoleLabel(r.role)}{r.ownershipPercent != null ? ` · ${r.ownershipPercent}%` : ""}{r.signer ? " · signer" : ""}{r.taxFormSigner ? " · signs the W-9" : ""}{r.responsibleParty ? " · responsible party" : ""}{(r as any).hasAccount ? " · same person as their login account" : ""}</p>
                    {r.underReview ? <p className="text-xs text-muted-foreground">{RELATED_REVIEW_MESSAGE}</p> : null}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${missing.length ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{missing.length ? `Needs ${missing.join(", ")}` : "Details complete"}</span>
                </div>
                {editable ? <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                  <div className="space-y-1"><Label htmlFor={`rr-${r.id}`}>Role</Label><RoleSelect id={`rr-${r.id}`} value={cur.role} onChange={(v) => setRow({ role: v })} /></div>
                  <div className="space-y-1"><Label htmlFor={`rp-${r.id}`}>Ownership %</Label><Input id={`rp-${r.id}`} inputMode="decimal" value={cur.pct} onChange={(e) => setRow({ pct: e.target.value })} /></div>
                  <label className="flex items-center gap-2 pb-2"><Checkbox checked={cur.signer} onCheckedChange={(v) => setRow({ signer: v === true })} />Signer</label>
                </div> : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor={`re-${r.id}`}>{full ? <Req>Email</Req> : "Email"}</Label>
                    {r.email && (r.hasAccount || !editable) ? <p className="h-9 py-2">{r.email}</p> : <Input id={`re-${r.id}`} type="email" disabled={!editable} placeholder={r.email ?? ""} value={dd.email} onChange={(e) => setD({ email: e.target.value })} />}</div>
                  <div className="space-y-1"><Label htmlFor={`rph-${r.id}`}>Phone</Label>
                    <Input id={`rph-${r.id}`} disabled={!editable} placeholder={r.phone ?? ""} value={dd.phone} onChange={(e) => setD({ phone: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor={`rd-${r.id}`}>{full ? <Req>Date of birth</Req> : "Date of birth"}</Label>
                    {r.dobOnFile && !r.dateOfBirth ? <p className="h-9 py-2 text-muted-foreground">On file (visible to Harmonious only)</p>
                      : <Input id={`rd-${r.id}`} type="date" disabled={!editable} value={dd.dob || r.dateOfBirth || ""} onChange={(e) => setD({ dob: e.target.value })} />}</div>
                  <div className="space-y-1"><Label htmlFor={`rs-${r.id}`}>{full ? <Req>SSN</Req> : "SSN"}</Label>
                    {r.ssnOnFile && !r.ssnLast4 ? <p className="h-9 py-2 text-muted-foreground">On file, stored encrypted</p>
                      : <Input id={`rs-${r.id}`} inputMode="numeric" autoComplete="off" data-private disabled={!editable} placeholder={r.ssnLast4 ? `On file ending ${r.ssnLast4}` : "9 digits"} value={dd.ssn} onChange={(e) => setD({ ssn: digits(e.target.value) })} />}</div>
                </div>
                {editable ? <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || (dd.ssn !== "" && dd.ssn.length !== 9)} onClick={async () => {
                    const roleChanged = cur.role !== r.role || pct(cur.pct) !== r.ownershipPercent || cur.signer !== r.signer;
                    if (roleChanged && !(await run({ update: { relationshipId: r.id, role: cur.role, ownershipPercent: pct(cur.pct), isSigner: cur.signer } }, "Role saved"))) return;
                    if (hasDraft && await run({ details: { relationshipId: r.id, email: dd.email.trim() || null, phone: dd.phone.trim() || null, dateOfBirth: dd.dob || null, ssn: dd.ssn || null } }, "Details saved")) setDetails((s) => ({ ...s, [r.id]: { email: "", phone: "", dob: "", ssn: "" } }));
                  }}>Save {r.name.split(" ")[0] || "person"}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ removeId: r.id }, "Removed")}>Remove</Button>
                </div> : null}
              </li>
            );
          })}
        </ul>
      )}

      {editable ? (adding ? (
        <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-2">
          <p className="text-sm font-medium sm:col-span-2">Add an owner, control person or signer</p>
          <div className="space-y-1"><Label htmlFor="ra-first"><Req>First name</Req></Label><Input id="ra-first" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-last"><Req>Last name</Req></Label><Input id="ra-last" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-role"><Req>Role</Req></Label><RoleSelect id="ra-role" value={draft.role} onChange={(v) => setDraft({ ...draft, role: v })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-pct">Ownership %</Label><Input id="ra-pct" inputMode="decimal" value={draft.pct} onChange={(e) => setDraft({ ...draft, pct: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-email">Email</Label><Input id="ra-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-phone">Phone</Label><Input id="ra-phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-dob">Date of birth</Label><Input id="ra-dob" type="date" value={draft.dob} onChange={(e) => setDraft({ ...draft, dob: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-ssn">SSN</Label><Input id="ra-ssn" inputMode="numeric" autoComplete="off" data-private placeholder="9 digits" value={draft.ssn} onChange={(e) => setDraft({ ...draft, ssn: digits(e.target.value) })} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={draft.signer} onCheckedChange={(v) => setDraft({ ...draft, signer: v === true })} />Authorized signer</label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={busy || !draft.firstName.trim() || !draft.lastName.trim() || (draft.ssn !== "" && draft.ssn.length !== 9)} onClick={async () => {
              if (await run({ add: { firstName: draft.firstName, lastName: draft.lastName, email: draft.email.trim() || null, role: draft.role, ownershipPercent: pct(draft.pct), isSigner: draft.signer, phone: draft.phone.trim() || null, dateOfBirth: draft.dob || null, ssn: draft.ssn || null } }, "Added")) { setDraft(blank); setAdding(false); }
            }}>Add person</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(blank); setAdding(false); }}>Cancel</Button>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">SSNs are stored encrypted; only the last four digits are ever shown to Harmonious, and fund teams see only that one is on file.</p>
        </div>
      ) : <Button size="sm" variant="outline" className="w-fit" onClick={() => setAdding(true)}>Add owner, control person or signer</Button>) : null}
    </div>
  );
}

/** Tax ID entry: only the last four digits are ever shown back. */
export function InvestorTaxIdCard({ onboardingId, last4, editable, onChanged, entity = false, trust = false, taxIdType }: { onboardingId: string; last4: string | null; editable: boolean; onChanged: () => void; entity?: boolean; trust?: boolean; taxIdType?: string | null }) {
  const update = useServerFn(updateInvestorRecordFn);
  const [tin, setTin] = useState("");
  const [choice, setChoice] = useState<"ssn" | "ein" | null>(null);
  const selected = choice ?? (taxIdType === "ssn" ? "ssn" : "ein");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{trust ? "Trust tax ID" : entity ? <>EIN <span className="text-destructive">*</span></> : "Tax ID"}</CardTitle>
        <CardDescription>{last4 ? `On file${trust ? ` (${taxIdType === "ssn" ? "trustee SSN" : "EIN"})` : ""}: ending ${last4}.` : "No tax ID on file."} It's stored encrypted; only the last four digits are shown.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {editable ? <>
          {trust ? <div className="space-y-2">
            <Label htmlFor="ir-tax-type">Trust uses</Label>
            <Select value={selected} disabled={busy} onValueChange={(v) => { if (v === "ssn" || v === "ein") { setChoice(v); setTin(""); } }}>
              <SelectTrigger id="ir-tax-type" className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ssn">Trustee’s SSN</SelectItem><SelectItem value="ein">Separate trust EIN</SelectItem></SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Use the number appropriate for the trust’s tax treatment. Confirm with your tax adviser if unsure.</p>
          </div> : null}
          <Label htmlFor="ir-tin">{trust ? selected === "ssn" ? "Trustee’s SSN (9 digits)" : "Trust EIN (9 digits)" : entity ? "Entity EIN (9 digits)" : "SSN, ITIN or EIN (9 digits)"}</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="ir-tin" inputMode="numeric" autoComplete="off" data-private disabled={busy} value={tin} onChange={(e) => setTin(e.target.value.replace(/\D/g, "").slice(0, 9))} className="max-w-xs" />
            <Button disabled={busy || tin.length !== 9} onClick={async () => {
              setBusy(true);
              try { await update({ data: { onboardingId, taxId: tin, ...(trust ? { taxIdType: selected } : {}) } }); toast.success("Tax ID saved"); setTin(""); setChoice(null); onChanged(); }
              catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
            }}>{last4 ? "Replace" : "Save"}</Button>
          </div>
        </> : <p className="text-sm text-muted-foreground">Signing or funding has started, so ask Harmonious to update the tax ID.</p>}
      </CardContent>
    </Card>
  );
}

/** First distribution bank details. Harmonious verifies them; nothing is ever sent from this form. */
export function DistributionBankCard({ onboardingId, hasAccount }: { onboardingId: string; hasAccount: boolean }) {
  const add = useServerFn(addDistributionDestinationFn);
  const [f, setF] = useState({ method: "wire", beneficiaryName: "", bankName: "", accountNumber: "", routingNumber: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distribution bank details</CardTitle>
        <CardDescription>Where future distributions go. Harmonious verifies them before they can be used, and only the last digits are shown afterwards. Saving moves no money. Once details are approved, only the investor or Harmonious can change them.</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAccount ? <p className="text-sm text-muted-foreground">The investor needs to sign in once before distribution bank details can be saved.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="db-method">Method</Label>
              <select id="db-method" value={f.method} onChange={set("method")} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="wire">Wire</option><option value="ach">ACH</option></select></div>
            <div className="space-y-1"><Label htmlFor="db-ben">Account holder name</Label><Input id="db-ben" value={f.beneficiaryName} onChange={set("beneficiaryName")} /></div>
            <div className="space-y-1"><Label htmlFor="db-bank">Bank name</Label><Input id="db-bank" value={f.bankName} onChange={set("bankName")} /></div>
            <div className="space-y-1"><Label htmlFor="db-rt">Routing number</Label><Input id="db-rt" inputMode="numeric" autoComplete="off" value={f.routingNumber} onChange={set("routingNumber")} /></div>
            <div className="space-y-1"><Label htmlFor="db-acct">Account number</Label><Input id="db-acct" inputMode="numeric" autoComplete="off" value={f.accountNumber} onChange={set("accountNumber")} /></div>
            <Button className="self-end sm:w-fit" disabled={busy || !f.beneficiaryName || !f.bankName || !f.accountNumber || !f.routingNumber} onClick={async () => {
              setBusy(true);
              try {
                await add({ data: { onboardingId, destination: { ...f, method: f.method as "wire" | "ach", currency: "USD", country: "US" } } });
                toast.success("Sent to Harmonious for verification");
                setF({ method: "wire", beneficiaryName: "", bankName: "", accountNumber: "", routingNumber: "" });
              } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
            }}>Submit for verification</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
