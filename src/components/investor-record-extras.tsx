import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { addDistributionDestinationFn, editRelatedPartyFn, updateInvestorRecordFn } from "@/lib/investor-record.functions";
import { RELATED_REVIEW_MESSAGE } from "@/lib/related-person-model";
import { prettyStatus } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLES = ["beneficial_owner", "control_person", "authorized_signer", "joint_owner", "trustee", "owner", "officer", "manager", "member"] as const;

type Related = { id: string; name: string; role: string; ownershipPercent: number | null; signer: boolean; underReview?: boolean };

function RoleSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
      {ROLES.map((r) => <option key={r} value={r}>{prettyStatus(r)}</option>)}
    </select>
  );
}

/** Editable owners, control persons and signers. Every change is checked and recorded on the server. */
export function RelatedPartiesEditor({ onboardingId, related, editable, onChanged }: { onboardingId: string; related: Related[]; editable: boolean; onChanged: () => void }) {
  const edit = useServerFn(editRelatedPartyFn);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ firstName: "", lastName: "", email: "", role: "beneficial_owner", pct: "", signer: false });
  const [rows, setRows] = useState<Record<string, { role: string; pct: string; signer: boolean }>>({});
  const run = async (payload: any, ok: string) => {
    setBusy(true);
    try {
      const r: any = await edit({ data: { onboardingId, ...payload } });
      toast.success(r?.underReview ? `${ok}. ${RELATED_REVIEW_MESSAGE}` : ok);
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const pct = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="space-y-3 sm:col-span-2">
      <p className="text-sm font-medium">Owners, control persons & signers</p>
      {!editable ? <p className="text-xs text-muted-foreground">Signing or funding has started, so changes go through Harmonious.</p> : null}
      {related.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : (
        <ul className="space-y-2">
          {related.map((r) => {
            const cur = rows[r.id] ?? { role: r.role, pct: r.ownershipPercent == null ? "" : String(r.ownershipPercent), signer: r.signer };
            const setRow = (patch: Partial<typeof cur>) => setRows((s) => ({ ...s, [r.id]: { ...cur, ...patch } }));
            return (
              <li key={r.id} className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[1fr_10rem_6rem_auto_auto] sm:items-end">
                <div><p className="font-medium">{r.name}</p>{r.underReview ? <p className="text-xs text-muted-foreground">{RELATED_REVIEW_MESSAGE}</p> : null}</div>
                {editable ? <>
                  <div className="space-y-1"><Label htmlFor={`rr-${r.id}`}>Role</Label><RoleSelect id={`rr-${r.id}`} value={cur.role} onChange={(v) => setRow({ role: v })} /></div>
                  <div className="space-y-1"><Label htmlFor={`rp-${r.id}`}>Ownership %</Label><Input id={`rp-${r.id}`} inputMode="decimal" value={cur.pct} onChange={(e) => setRow({ pct: e.target.value })} /></div>
                  <label className="flex items-center gap-2 pb-2"><Checkbox checked={cur.signer} onCheckedChange={(v) => setRow({ signer: v === true })} />Signer</label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ update: { relationshipId: r.id, role: cur.role, ownershipPercent: pct(cur.pct), isSigner: cur.signer } }, "Saved")}>Save</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ removeId: r.id }, "Removed")}>Remove</Button>
                  </div>
                </> : <p className="text-muted-foreground sm:col-span-4">{prettyStatus(r.role)}{r.ownershipPercent != null ? ` · ${r.ownershipPercent}%` : ""}{r.signer ? " · signer" : ""}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {editable ? (
        <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="ra-first">First name</Label><Input id="ra-first" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-last">Last name</Label><Input id="ra-last" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-email">Email (optional)</Label><Input id="ra-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-role">Role</Label><RoleSelect id="ra-role" value={draft.role} onChange={(v) => setDraft({ ...draft, role: v })} /></div>
          <div className="space-y-1"><Label htmlFor="ra-pct">Ownership %</Label><Input id="ra-pct" inputMode="decimal" value={draft.pct} onChange={(e) => setDraft({ ...draft, pct: e.target.value })} /></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={draft.signer} onCheckedChange={(v) => setDraft({ ...draft, signer: v === true })} />Authorized signer</label>
          <Button className="sm:w-fit" size="sm" disabled={busy || !draft.firstName.trim() || !draft.lastName.trim()} onClick={async () => {
            await run({ add: { firstName: draft.firstName, lastName: draft.lastName, email: draft.email.trim() || null, role: draft.role, ownershipPercent: pct(draft.pct), isSigner: draft.signer } }, "Added");
            setDraft({ firstName: "", lastName: "", email: "", role: "beneficial_owner", pct: "", signer: false });
          }}>Add person</Button>
        </div>
      ) : null}
    </div>
  );
}

/** Tax ID entry: only the last four digits are ever shown back. */
export function InvestorTaxIdCard({ onboardingId, last4, editable, onChanged }: { onboardingId: string; last4: string | null; editable: boolean; onChanged: () => void }) {
  const update = useServerFn(updateInvestorRecordFn);
  const [tin, setTin] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tax ID</CardTitle>
        <CardDescription>{last4 ? `On file: ending ${last4}.` : "No tax ID on file."} It's stored encrypted; only the last four digits are shown.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {editable ? <>
          <Label htmlFor="ir-tin">SSN, ITIN or EIN (9 digits)</Label>
          <div className="flex gap-2">
            <Input id="ir-tin" inputMode="numeric" autoComplete="off" value={tin} onChange={(e) => setTin(e.target.value.replace(/\D/g, "").slice(0, 9))} className="max-w-xs" />
            <Button disabled={busy || tin.length !== 9} onClick={async () => {
              setBusy(true);
              try { await update({ data: { onboardingId, taxId: tin } }); toast.success("Tax ID saved"); setTin(""); onChanged(); }
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
