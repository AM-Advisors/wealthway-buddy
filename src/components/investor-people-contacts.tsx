import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addPersonForKycFn, assignParticipantFn, changeInvestingAsFn, listParticipantsFn, removeParticipantFn } from "@/lib/investor-helpers.functions";

const ROLES: [string, string][] = [["joint_owner", "Joint owner"], ["authorized_signer", "Authorized signer"], ["beneficial_owner", "Beneficial owner"], ["control_person", "Control person"], ["trustee", "Trustee"], ["officer", "Officer"], ["manager", "Manager"], ["member", "Member"]];
type AddForm = { firstName: string; lastName: string; email: string; role: string; title: string; ownership: string; sendKyc: boolean; sendSignature: boolean };

/** Points of contact (joint/entity/trust), changing an individual investment, and adding another person for KYC + signature. */
export function InvestorPeopleAndContacts({ onboardingId, onSaved }: { onboardingId: string; onSaved?: () => void }) {
  const qc = useQueryClient();
  const key = ["investor-participants", onboardingId];
  const listFn = useServerFn(listParticipantsFn);
  const assignFn = useServerFn(assignParticipantFn);
  const removeFn = useServerFn(removeParticipantFn);
  const changeFn = useServerFn(changeInvestingAsFn);
  const addFn = useServerFn(addPersonForKycFn);
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { onboardingId } }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["investor-email-history", onboardingId] }); onSaved?.(); };

  const [contact, setContact] = useState<{ fullName: string; email: string; title: string } | null>(null);
  const [change, setChange] = useState<{ type: "joint" | "entity" | "trust"; subType: string; legalName: string } | null>(null);
  const [add, setAdd] = useState<AddForm | null>(null);

  const addContact = useMutation({
    mutationFn: () => assignFn({ data: { onboardingId, role: "contact", fullName: contact!.fullName, email: contact!.email, title: contact!.title || null } }),
    onSuccess: (r) => { r.emailSent ? toast.success("Added and emailed a view link.") : toast.warning("Added, but the email couldn't be sent."); setContact(null); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({ mutationFn: (id: string) => removeFn({ data: { participantId: id } }), onSuccess: () => { toast.success("Access ended. Their history is kept."); refresh(); }, onError: (e) => toast.error((e as Error).message) });
  const doChange = useMutation({
    mutationFn: () => changeFn({ data: { onboardingId, type: change!.type, subType: change!.subType || null, legalName: change!.legalName || null } }),
    onSuccess: () => { toast.success("Updated how they're investing. Add the other people below."); setChange(null); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const doAdd = useMutation({
    mutationFn: () => addFn({ data: { onboardingId, firstName: add!.firstName, lastName: add!.lastName, email: add!.email, role: add!.role as any, title: add!.title || null, ownershipPercent: add!.ownership ? Number(add!.ownership) : null, sendKyc: add!.sendKyc, sendSignature: add!.sendSignature } }),
    onSuccess: (r) => {
      const bits = [r.underReview ? "Added (Harmonious will confirm it isn't a duplicate person)" : "Added"];
      if (r.kyc) bits.push(r.kyc === "emailed" ? "identity check emailed" : "identity check created");
      if (r.signer) bits.push("named signer, they'll get the signature page by email when signing starts");
      toast.success(bits.join(" · ")); r.warnings.forEach((w) => toast.warning(w)); setAdd(null); refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const d = q.data;
  const contacts = (d?.participants ?? []).filter((p) => p.role === "contact" && p.status !== "removed");
  const individual = d ? !d.multipleContacts : false;

  return (
    <section className="rounded-lg border p-3 space-y-3">
      <div>
        <h4 className="font-medium">People on this investment</h4>
        <p className="text-xs text-muted-foreground">Joint accounts, entities and trusts can have several points of contact who sign in and see the investment (view only). Anyone added as an owner or signer runs their own identity check.</p>
      </div>
      {q.isError && <p className="text-xs text-destructive">Couldn't load. <button className="underline" onClick={() => q.refetch()}>Retry</button></p>}

      {individual && !change && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Investing as an individual.</span>
          <Button size="sm" variant="outline" onClick={() => setChange({ type: "joint", subType: "", legalName: "" })}>Change to joint, entity or trust</Button>
        </div>
      )}
      {change && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Investing as</Label>
            <div className="flex flex-wrap gap-2">{(["joint", "entity", "trust"] as const).map((t) => <Button key={t} size="sm" type="button" variant={change.type === t ? "default" : "outline"} onClick={() => setChange({ ...change, type: t })}>{t === "joint" ? "Joint account" : t === "entity" ? "Entity" : "Trust"}</Button>)}</div></div>
          {change.type === "entity" && <div className="space-y-1"><Label htmlFor="ch-sub">Entity type</Label>
            <select id="ch-sub" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={change.subType} onChange={(e) => setChange({ ...change, subType: e.target.value })}>
              <option value="">Other</option><option value="llc">LLC</option><option value="corporation">Corporation</option><option value="partnership">Partnership</option>
            </select></div>}
          {change.type !== "joint" && <div className="space-y-1"><Label htmlFor="ch-name">Legal name</Label><Input id="ch-name" value={change.legalName} onChange={(e) => setChange({ ...change, legalName: e.target.value })} /></div>}
          <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={doChange.isPending} onClick={() => doChange.mutate()}>{doChange.isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="ghost" onClick={() => setChange(null)}>Cancel</Button></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Only before signing or funding starts. The change is kept in History.</p>
        </div>
      )}

      {/* Add another person: identity check + optional signature page */}
      {add ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="ap-first">First name</Label><Input id="ap-first" value={add.firstName} onChange={(e) => setAdd({ ...add, firstName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ap-last">Last name</Label><Input id="ap-last" value={add.lastName} onChange={(e) => setAdd({ ...add, lastName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ap-email">Email</Label><Input id="ap-email" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ap-role">Role</Label>
            <select id="ap-role" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div className="space-y-1"><Label htmlFor="ap-title">Title (optional)</Label><Input id="ap-title" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ap-own">Ownership % (optional)</Label><Input id="ap-own" inputMode="decimal" value={add.ownership} onChange={(e) => setAdd({ ...add, ownership: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={add.sendKyc} onCheckedChange={(v) => setAdd({ ...add, sendKyc: !!v })} />Email them an identity check (ID + selfie)</label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={add.sendSignature} onCheckedChange={(v) => setAdd({ ...add, sendSignature: !!v })} />Make them the signer and send them the signature page</label>
          <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={doAdd.isPending || !add.firstName || !add.lastName || !add.email} onClick={() => doAdd.mutate()}>{doAdd.isPending ? "Adding…" : "Add person"}</Button><Button size="sm" variant="ghost" onClick={() => setAdd(null)}>Cancel</Button></div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdd({ firstName: "", lastName: "", email: "", role: individual ? "joint_owner" : "authorized_signer", title: "", ownership: "", sendKyc: true, sendSignature: false })}>Add another person (identity check & signature)</Button>
      )}

      {/* Points of contact */}
      {d?.multipleContacts && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Points of contact</p>
          {contacts.length ? (
            <ul className="space-y-1">{contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span><span className="font-medium">{c.name}</span> · {c.email}{c.title ? ` · ${c.title}` : ""} · {c.status === "invited" ? "invited" : "active"}</span>
                <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>Remove</Button>
              </li>))}</ul>
          ) : <p className="text-xs text-muted-foreground">No extra points of contact yet.</p>}
          {contact ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1"><Label htmlFor="pc-name">Full name</Label><Input id="pc-name" value={contact.fullName} onChange={(e) => setContact({ ...contact, fullName: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="pc-email">Email</Label><Input id="pc-email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="pc-title">Title (optional)</Label><Input id="pc-title" value={contact.title} onChange={(e) => setContact({ ...contact, title: e.target.value })} /></div>
              <div className="flex gap-2 sm:col-span-3"><Button size="sm" disabled={addContact.isPending || !contact.fullName || !contact.email} onClick={() => addContact.mutate()}>{addContact.isPending ? "Sending…" : "Add and email view link"}</Button><Button size="sm" variant="ghost" onClick={() => setContact(null)}>Cancel</Button></div>
            </div>
          ) : <Button size="sm" variant="outline" onClick={() => setContact({ fullName: "", email: "", title: "" })}>Add point of contact</Button>}
        </div>
      )}
    </section>
  );
}
