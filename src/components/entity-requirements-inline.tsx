import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { editRelatedPartyFn } from "@/lib/investor-record.functions";
import { investmentPartiesFn } from "@/lib/investment-parties.functions";
import { isPaperworkContactRole } from "@/lib/investor-record-model";
import { RELATED_REVIEW_MESSAGE } from "@/lib/related-person-model";
import { entityRequirements, missingPersonFields } from "@/lib/entity-investor-requirements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Related = {
  id: string; name: string; role: string; ownershipPercent: number | null; signer: boolean;
  email?: string | null; dobOnFile?: boolean; ssnOnFile?: boolean; taxFormSigner?: boolean; responsibleParty?: boolean; personId?: string;
};
const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 9);

/** Entity checklist with fill-in boxes for each open item and each person's recorded activity. Saves use the existing audited related-party save. */
export function EntityRequirementsInline({ onboardingId, legalName, einOnFile, related, editable, onChanged }: {
  onboardingId: string; legalName: string | null; einOnFile: boolean; related: Related[]; editable: boolean; onChanged: () => void;
}) {
  const edit = useServerFn(editRelatedPartyFn);
  const listParties = useServerFn(investmentPartiesFn);
  const qc = useQueryClient();
  const partiesKey = ["investment-parties", onboardingId];
  const parties = useQuery({ queryKey: partiesKey, queryFn: () => listParties({ data: { onboardingId } }), retry: false });
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { email: string; dob: string; ssn: string }>>({});
  const [controlPick, setControlPick] = useState("");

  const owners = related.filter((r) => !isPaperworkContactRole(r.role));
  const people = owners.map((r) => ({ id: r.id, name: r.name, role: r.role, ownershipPercent: r.ownershipPercent, signer: r.signer, email: r.email ?? null, dobOnFile: Boolean(r.dobOnFile), ssnOnFile: Boolean(r.ssnOnFile), taxFormSigner: Boolean(r.taxFormSigner) }));
  const items = entityRequirements({ legalName, einOnFile, responsiblePartyId: owners.find((r) => r.responsibleParty)?.id ?? null, people });
  const open = items.filter((i) => !i.done);
  const signers = owners.filter((r) => r.signer);

  const run = async (payload: any, ok: string) => {
    setBusy(true);
    try {
      const r: any = await edit({ data: { onboardingId, ...payload } });
      toast.success(r?.underReview ? `${ok}. ${RELATED_REVIEW_MESSAGE}` : `Done and saved: ${ok.toLowerCase()}.`);
      onChanged(); qc.invalidateQueries({ queryKey: partiesKey });
      return true;
    } catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(false); }
  };
  const scrollTo = (id: string) => { const el = document.getElementById(id); el?.scrollIntoView({ behavior: "smooth", block: "center" }); (el as HTMLElement | null)?.focus?.(); };

  const partyFor = (r: Related) => (parties.data?.parties ?? []).find((p: any) => (r.personId && p.personId === r.personId) || p.name === r.name);

  const inputFor = (key: string, personId?: string) => {
    if (!editable) return null;
    if (key === "responsible_party") return owners.length ? (
      <select aria-label="Choose responsible party" disabled={busy} defaultValue="" className={selectCls} onChange={(e) => e.target.value && run({ responsiblePartyId: e.target.value }, "Responsible party saved")}>
        <option value="">Choose a person</option>{owners.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>) : <span className="text-xs text-muted-foreground">Add a person first.</span>;
    if (key === "w9_signer") return signers.length ? (
      <select aria-label="Choose W-9 signer" disabled={busy} defaultValue="" className={selectCls} onChange={(e) => e.target.value && run({ taxFormSignerId: e.target.value }, "W-9 signer assigned")}>
        <option value="">Choose a signer</option>{signers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>) : <span className="text-xs text-muted-foreground">Mark someone as a signer below.</span>;
    if (key === "control_person") return (
      <div className="flex flex-wrap gap-2">
        {owners.length ? <>
          <select aria-label="Choose trustee or control person" value={controlPick} onChange={(e) => setControlPick(e.target.value)} className={selectCls}>
            <option value="">Make someone trustee</option>{owners.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Button size="sm" disabled={busy || !controlPick} onClick={async () => {
            const r = owners.find((o) => o.id === controlPick); if (!r) return;
            if (await run({ update: { relationshipId: r.id, role: "trustee", ownershipPercent: r.ownershipPercent, isSigner: r.signer } }, `${r.name} saved as trustee`)) setControlPick("");
          }}>Save</Button>
        </> : null}
        <Button size="sm" variant="outline" onClick={() => scrollTo("ra-first")}>Add someone new</Button>
      </div>);
    if (key === "ein") return <Button size="sm" variant="outline" onClick={() => scrollTo("ir-tin")}>Enter EIN</Button>;
    if (key === "signer") return <Button size="sm" variant="outline" onClick={() => scrollTo("rp-resp")}>Choose signer below</Button>;
    if (personId) {
      const r = owners.find((o) => o.id === personId); if (!r) return null;
      const missing = missingPersonFields(people.find((p) => p.id === personId)!);
      const d = drafts[personId] ?? { email: "", dob: "", ssn: "" };
      const set = (patch: Partial<typeof d>) => setDrafts((s) => ({ ...s, [personId]: { ...d, ...patch } }));
      const ready = (d.email.trim() || d.dob || d.ssn.length === 9) && (d.ssn === "" || d.ssn.length === 9);
      return (
        <div className="flex flex-wrap items-center gap-2">
          {missing.includes("email") && <Input aria-label={`${r.name} email`} type="email" placeholder="Email" className="h-9 w-48" value={d.email} onChange={(e) => set({ email: e.target.value })} />}
          {missing.includes("date of birth") && <Input aria-label={`${r.name} date of birth`} type="date" className="h-9 w-40" value={d.dob} onChange={(e) => set({ dob: e.target.value })} />}
          {missing.includes("SSN") && <Input aria-label={`${r.name} SSN`} inputMode="numeric" autoComplete="off" data-private placeholder="SSN, 9 digits" className="h-9 w-36" value={d.ssn} onChange={(e) => set({ ssn: digits(e.target.value) })} />}
          <Button size="sm" disabled={busy || !ready} onClick={async () => {
            if (await run({ details: { relationshipId: r.id, email: d.email.trim() || null, phone: null, dateOfBirth: d.dob || null, ssn: d.ssn || null } }, `${r.name} details saved`)) setDrafts((s) => ({ ...s, [personId]: { email: "", dob: "", ssn: "" } }));
          }}>Save</Button>
        </div>);
    }
    return null;
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3 sm:col-span-2">
      <p className="text-sm font-medium">{open.length ? `${open.length} required item${open.length === 1 ? "" : "s"} left` : "All required entity details are on file"}</p>
      <ul className="space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span aria-hidden className={i.done ? "text-primary" : "text-destructive"}>{i.done ? "✓" : "○"}</span>
            <span className={`min-w-[14rem] ${i.done ? "text-muted-foreground" : ""}`}>{i.label}</span>
            {!i.done ? inputFor(i.key, i.personId) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Owners with 25% or more, control persons, trustees and signers need name, email, date of birth and SSN. SSNs are stored encrypted. Every save is recorded.</p>

      {owners.length ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">Activity</p>
          {owners.map((r) => {
            const p: any = partyFor(r);
            return (
              <details key={r.id} className="rounded-md border bg-background p-2 text-sm">
                <summary className="cursor-pointer">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground"> · {p ? `${p.login} · ${p.accessLabel}${p.activity?.[0] ? ` · last: ${new Date(p.activity[0].at).toLocaleDateString()}` : " · no activity yet"}` : parties.isLoading ? "loading" : "no login yet"}</span>
                </summary>
                {p?.activity?.length ? <ul className="mt-1 space-y-0.5">{p.activity.map((a: any, k: number) => <li key={k}>{new Date(a.at).toLocaleString()} · {a.text}</li>)}</ul>
                  : <p className="mt-1 text-muted-foreground">No recorded activity yet.</p>}
              </details>
            );
          })}
          <p className="text-xs text-muted-foreground">Shows recorded events only, never whether someone is online.</p>
        </div>
      ) : null}
    </div>
  );
}
