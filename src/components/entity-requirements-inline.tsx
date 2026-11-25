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
  email?: string | null; dobOnFile?: boolean; ssnOnFile?: boolean; taxFormSigner?: boolean; responsibleParty?: boolean; personId?: string; phoneOnFile?: boolean; citizenshipOnFile?: boolean; addressOnFile?: boolean;
};
const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 9);

type Draft = { email: string; dob: string; ssn: string; phone: string; citizenship: string; address1: string; city: string; region: string; postal: string; country: string };
const BLANK: Draft = { email: "", dob: "", ssn: "", phone: "", citizenship: "", address1: "", city: "", region: "", postal: "", country: "" };

/** Entity checklist with fill-in boxes for each open item and each person's recorded activity. Saves use the existing audited related-party save. */
export function EntityRequirementsInline({ onboardingId, legalName, einOnFile, related, editable, onChanged, trust = false, taxIdType = null, entity }: {
  onboardingId: string; legalName: string | null; einOnFile: boolean; related: Related[]; editable: boolean; onChanged: () => void;
  trust?: boolean; taxIdType?: string | null;
  entity?: { phone: boolean; address: boolean; jurisdiction: boolean };
}) {
  const edit = useServerFn(editRelatedPartyFn);
  const listParties = useServerFn(investmentPartiesFn);
  const qc = useQueryClient();
  const partiesKey = ["investment-parties", onboardingId];
  const parties = useQuery({ queryKey: partiesKey, queryFn: () => listParties({ data: { onboardingId } }), retry: false });
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [controlPick, setControlPick] = useState("");
  const blankNew = { firstName: "", lastName: "", email: "", role: "beneficial_owner", pct: "", dob: "", ssn: "", signer: false };
  const [nw, setNw] = useState(blankNew);
  const [linkId, setLinkId] = useState<string | null>(null);

  const owners = related.filter((r) => !isPaperworkContactRole(r.role));
  const people = owners.map((r) => ({ id: r.id, name: r.name, role: r.role, ownershipPercent: r.ownershipPercent, signer: r.signer, email: r.email ?? null, dobOnFile: Boolean(r.dobOnFile), ssnOnFile: Boolean(r.ssnOnFile), taxFormSigner: Boolean(r.taxFormSigner), phoneOnFile: Boolean(r.phoneOnFile), citizenshipOnFile: Boolean(r.citizenshipOnFile), addressOnFile: Boolean(r.addressOnFile) }));
  const items = entityRequirements({ legalName, einOnFile, trust, taxIdType, ...(entity ? { entityPhoneOnFile: entity.phone, entityAddressOnFile: entity.address, jurisdictionOnFile: entity.jurisdiction } : {}), responsiblePartyId: owners.find((r) => r.responsibleParty)?.id ?? null, people });
  const open = items.filter((i) => !i.done);
  const signers = owners.filter((r) => r.signer);
  const listedIds = new Set(owners.map((r) => r.personId).filter(Boolean));
  const typed = `${nw.firstName} ${nw.lastName}`.trim().toLowerCase();
  const pickable = ((parties.data?.parties ?? []) as any[])
    .filter((p) => p.personId && !listedIds.has(p.personId) && (p.roles ?? []).some((x: string) => x === "account holder" || x === "investor"))
    .filter((p) => !typed || String(p.name).toLowerCase().includes(typed.split(" ")[0] ?? ""));

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
        <Button size="sm" variant="outline" onClick={() => scrollTo("en-add-first")}>Add someone new</Button>
      </div>);
    if (key === "jurisdiction") return <Button size="sm" variant="outline" onClick={() => scrollTo("ir-entity-jurisdiction")}>Enter below</Button>;
    if (key === "entity_address") return <Button size="sm" variant="outline" onClick={() => scrollTo("ir-entity-address1")}>Enter below</Button>;
    if (key === "entity_phone") return <Button size="sm" variant="outline" onClick={() => scrollTo("ir-entity-phone")}>Enter below</Button>;
    if (key === "ein") return <Button size="sm" variant="outline" onClick={() => scrollTo(trust ? "ir-tax-type" : "ir-tin")}>{trust ? "Choose trust tax ID" : "Enter EIN"}</Button>;
    if (key === "signer") return <Button size="sm" variant="outline" onClick={() => scrollTo("rp-resp")}>Choose signer below</Button>;
    if (personId) {
      const r = owners.find((o) => o.id === personId); if (!r) return null;
      const missing = missingPersonFields(people.find((p) => p.id === personId)!);
      const d = drafts[personId] ?? BLANK;
      const set = (patch: Partial<typeof d>) => setDrafts((s) => ({ ...s, [personId]: { ...d, ...patch } }));
      const ready = (d.email.trim() || d.dob || d.ssn.length === 9 || d.phone.trim() || d.citizenship.trim() || (d.address1.trim() && d.city.trim())) && (d.ssn === "" || d.ssn.length === 9);
      return (
        <div className="flex flex-wrap items-center gap-2">
          {missing.includes("email") && <Input aria-label={`${r.name} email`} type="email" placeholder="Email" className="h-9 w-48" value={d.email} onChange={(e) => set({ email: e.target.value })} />}
          {missing.includes("date of birth") && <Input aria-label={`${r.name} date of birth`} type="date" className="h-9 w-40" value={d.dob} onChange={(e) => set({ dob: e.target.value })} />}
          {missing.includes("phone") && <Input aria-label={`${r.name} phone`} type="tel" placeholder="Phone" className="h-9 w-40" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />}
          {missing.includes("citizenship") && <Input aria-label={`${r.name} citizenship`} placeholder="Citizenship" className="h-9 w-36" value={d.citizenship} onChange={(e) => set({ citizenship: e.target.value })} />}
          {missing.includes("address") && <>
            <Input aria-label={`${r.name} street address`} placeholder="Street address" className="h-9 w-56" value={d.address1} onChange={(e) => set({ address1: e.target.value })} />
            <Input aria-label={`${r.name} city`} placeholder="City" className="h-9 w-32" value={d.city} onChange={(e) => set({ city: e.target.value })} />
            <Input aria-label={`${r.name} state`} placeholder="State" className="h-9 w-24" value={d.region} onChange={(e) => set({ region: e.target.value })} />
            <Input aria-label={`${r.name} postal code`} placeholder="ZIP" className="h-9 w-24" value={d.postal} onChange={(e) => set({ postal: e.target.value })} />
            <Input aria-label={`${r.name} country`} placeholder="Country" className="h-9 w-32" value={d.country} onChange={(e) => set({ country: e.target.value })} />
          </>}
          {missing.includes("SSN") && <Input aria-label={`${r.name} SSN`} inputMode="numeric" autoComplete="off" data-private placeholder="SSN, 9 digits" className="h-9 w-36" value={d.ssn} onChange={(e) => set({ ssn: digits(e.target.value) })} />}
          <Button size="sm" disabled={busy || !ready} onClick={async () => {
            if (await run({ details: { relationshipId: r.id, email: d.email.trim() || null, phone: d.phone.trim() || null, dateOfBirth: d.dob || null, ssn: d.ssn || null, citizenship: d.citizenship.trim() || null, addressLine1: d.address1.trim() || null, city: d.city.trim() || null, region: d.region.trim() || null, postalCode: d.postal.trim() || null, country: d.country.trim() || null } }, `${r.name} details saved`)) setDrafts((s) => ({ ...s, [personId]: BLANK }));
          }}>Save</Button>
        </div>);
    }
    return null;
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3 sm:col-span-2">
      <p className="text-sm font-medium">{open.length ? `${open.length} required item${open.length === 1 ? "" : "s"} left` : "All required entity details are on file"}</p>
      <ul className="space-y-2 text-sm">
        {items.filter((i) => !i.personId || !i.done).map((i) => (
          <li key={i.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span aria-hidden className={i.done ? "text-primary" : "text-destructive"}>{i.done ? "✓" : "○"}</span>
            <span className={`min-w-[14rem] ${i.done ? "text-muted-foreground" : ""}`}>{i.label}</span>
            {!i.done ? inputFor(i.key, i.personId) : null}
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t pt-3">
        {editable ? (
          <div className="grid gap-2 rounded-md border border-dashed bg-background p-3 sm:grid-cols-4 sm:items-end">
            <p className="text-sm font-medium sm:col-span-4">Add an owner or signer</p>
            {pickable.length && !linkId ? (
              <div className="flex flex-wrap items-center gap-2 sm:col-span-4 text-sm">
                <span className="text-muted-foreground">Already on this investment:</span>
                {pickable.map((p: any) => (
                  <Button key={p.personId} size="sm" variant="outline" onClick={() => { const [f, ...rest] = String(p.name).split(" "); setLinkId(p.personId); setNw({ ...nw, firstName: f ?? "", lastName: rest.join(" "), email: p.email ?? "" }); }}>Use {p.name}</Button>
                ))}
              </div>
            ) : null}
            {linkId ? (
              <p className="text-sm sm:col-span-4">Adding <span className="font-medium">{nw.firstName} {nw.lastName}</span> from their existing record. Pick a role below. <button type="button" className="underline" onClick={() => { setLinkId(null); setNw(blankNew); }}>Use someone else</button></p>
            ) : null}
            <label className="space-y-1 text-xs">First name *<Input id="en-add-first" className="h-9" value={nw.firstName} onChange={(e) => setNw({ ...nw, firstName: e.target.value })} /></label>
            <label className="space-y-1 text-xs">Last name *<Input className="h-9" value={nw.lastName} onChange={(e) => setNw({ ...nw, lastName: e.target.value })} /></label>
            <label className="space-y-1 text-xs">Email<Input type="email" className="h-9" value={nw.email} onChange={(e) => setNw({ ...nw, email: e.target.value })} /></label>
            <label className="space-y-1 text-xs">Role<select className={`${selectCls} w-full`} value={nw.role} onChange={(e) => setNw({ ...nw, role: e.target.value })}>
              {["beneficial_owner", "trustee", "control_person", "authorized_signer", "officer", "manager", "member"].map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
            </select></label>
            <label className="space-y-1 text-xs">Ownership %<Input inputMode="decimal" className="h-9" value={nw.pct} onChange={(e) => setNw({ ...nw, pct: e.target.value })} /></label>
            <label className="space-y-1 text-xs">Date of birth<Input type="date" className="h-9" value={nw.dob} onChange={(e) => setNw({ ...nw, dob: e.target.value })} /></label>
            <label className="space-y-1 text-xs">SSN<Input inputMode="numeric" autoComplete="off" data-private placeholder="9 digits" className="h-9" value={nw.ssn} onChange={(e) => setNw({ ...nw, ssn: digits(e.target.value) })} /></label>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={nw.signer} onChange={(e) => setNw({ ...nw, signer: e.target.checked })} />Signer</label>
            <Button size="sm" className="sm:col-span-4 sm:w-fit" disabled={busy || !nw.firstName.trim() || !nw.lastName.trim() || (nw.ssn !== "" && nw.ssn.length !== 9)} onClick={async () => {
              if (linkId) {
                if (await run({ link: { personId: linkId, role: nw.role, ownershipPercent: nw.pct.trim() === "" ? null : Number(nw.pct), isSigner: nw.signer } }, `${nw.firstName.trim()} added`)) { setNw(blankNew); setLinkId(null); }
                return;
              }
              if (await run({ add: { firstName: nw.firstName.trim(), lastName: nw.lastName.trim(), email: nw.email.trim() || null, role: nw.role, ownershipPercent: nw.pct.trim() === "" ? null : Number(nw.pct), isSigner: nw.signer, phone: null, dateOfBirth: nw.dob || null, ssn: nw.ssn || null } }, `${nw.firstName.trim()} added`)) setNw(blankNew);
            }}>Add person</Button>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Owners with 25% or more, control persons, trustees and signers need name, email, phone, citizenship, date of birth, address and SSN. SSNs are stored encrypted. Every save is recorded.</p>

    </div>
  );
}
