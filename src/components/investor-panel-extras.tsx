import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignParticipantFn, checkEmailDeliveryFn, investorEmailHistoryFn, listParticipantsFn, removeParticipantFn } from "@/lib/investor-helpers.functions";
import { updateInvestorRecordFn } from "@/lib/investor-record.functions";

const KIND: Record<string, string> = { invitation: "Invitation", reminder: "Reminder", message: "Message", preparer_invite: "Preparer invitation", signer_invite: "Signer notice" };
const when = (s: string) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Every invitation, reminder and message to this investor, with what the email provider reported. */
export function InvestorEmailHistory({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const historyFn = useServerFn(investorEmailHistoryFn);
  const checkFn = useServerFn(checkEmailDeliveryFn);
  const key = ["investor-email-history", onboardingId];
  const q = useQuery({ queryKey: key, queryFn: () => historyFn({ data: { onboardingId } }) });
  const check = useMutation({
    mutationFn: () => checkFn({ data: { onboardingId } }),
    onSuccess: (r) => { toast.success(`Checked delivery: ${r.messages} email${r.messages === 1 ? "" : "s"} found.`); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <section className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-medium">Emails sent</h4>
        <Button size="sm" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>{check.isPending ? "Checking…" : "Check delivery"}</Button>
      </div>
      {q.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
        : q.isError ? <p className="text-xs text-destructive">Email history couldn't be loaded. <button className="underline" onClick={() => q.refetch()}>Retry</button></p>
        : !q.data?.items.length ? <p className="text-xs text-muted-foreground">No emails sent to this investor yet.</p>
        : (
          <ul className="space-y-2">
            {q.data.items.map((m) => (
              <li key={m.id} className="rounded-md border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{KIND[m.kind] ?? m.kind}</span>
                  <Badge variant={m.status.tone === "bad" ? "destructive" : m.status.tone === "good" ? "secondary" : "outline"}>{m.status.label}</Badge>
                </div>
                {m.subject ? <p className="text-xs">{m.subject}</p> : null}
                <p className="text-xs text-muted-foreground">To {m.recipient} · {when(m.sentAt)} · by {m.sentBy}{m.status.tone === "good" && m.status.detail ? ` · ${m.status.label.toLowerCase()} ${when(m.status.detail)}` : ""}</p>
                {m.status.tone !== "good" && m.status.detail ? <p className="text-xs text-muted-foreground">{m.status.detail}</p> : null}
              </li>
            ))}
          </ul>
        )}
      <p className="mt-2 text-xs text-muted-foreground">Delivered and opened come only from the email provider's reports.</p>
    </section>
  );
}

/** Someone who completes details for the investor, and who signs. */
export function InvestorHelpers({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listParticipantsFn);
  const assignFn = useServerFn(assignParticipantFn);
  const removeFn = useServerFn(removeParticipantFn);
  const key = ["investor-participants", onboardingId];
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { onboardingId } }) });
  const [form, setForm] = useState<{ role: "preparer" | "signer"; fullName: string; email: string; title: string } | null>(null);
  const assign = useMutation({
    mutationFn: () => assignFn({ data: { onboardingId, role: form!.role, fullName: form!.fullName, email: form!.email, title: form!.title || null } }),
    onSuccess: (r) => { r.emailSent ? toast.success("Assigned and emailed.") : toast.warning("Assigned, but the email couldn't be sent."); setForm(null); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["investor-email-history", onboardingId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({ mutationFn: (id: string) => removeFn({ data: { participantId: id } }), onSuccess: () => { toast.success("Access ended. Their history is kept."); qc.invalidateQueries({ queryKey: key }); }, onError: (e) => toast.error((e as Error).message) });
  const active = (q.data?.participants ?? []).filter((p) => p.status !== "removed");
  const preparers = active.filter((p) => p.role === "preparer"); const signer = active.find((p) => p.role === "signer");
  return (
    <section className="rounded-lg border p-3">
      <h4 className="font-medium">Completed by</h4>
      <p className="mb-2 text-xs text-muted-foreground">For family offices, advisors or fund teams: a preparer fills in details and documents, and the named signer reviews and signs. Preparers can't pass identity checks, sign or send money.</p>
      {q.isError ? <p className="text-xs text-destructive">Couldn't load. <button className="underline" onClick={() => q.refetch()}>Retry</button></p> : (
        <>
          <p className="text-sm">Prepared by: {preparers.length ? preparers.map((p) => p.name).join(", ") : "the investor"} · Signs: {signer ? `${signer.name}${signer.title ? ` (${signer.title})` : ""}` : "the investor"}</p>
          <ul className="mt-2 space-y-1">
            {active.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span><span className="font-medium">{p.name}</span> · {p.email} · {p.roleLabel}{p.status === "invited" ? " · invited" : " · active"}</span>
                <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(p.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {form ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Role</Label>
            <div className="flex gap-2">{(["preparer", "signer"] as const).map((r) => <Button key={r} size="sm" type="button" variant={form.role === r ? "default" : "outline"} onClick={() => setForm({ ...form, role: r })}>{r === "preparer" ? "Prepares details" : "Signs"}</Button>)}</div></div>
          <div className="space-y-1"><Label htmlFor="hp-name">Full name</Label><Input id="hp-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="hp-email">Email</Label><Input id="hp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="hp-title">Title (optional)</Label><Input id="hp-title" placeholder="e.g. Analyst, Family office CFO, General Partner" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={assign.isPending || !form.fullName || !form.email} onClick={() => assign.mutate()}>{assign.isPending ? "Sending…" : "Assign and email"}</Button><Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
        </div>
      ) : <Button className="mt-3" size="sm" variant="outline" onClick={() => setForm({ role: "preparer", fullName: "", email: "", title: "" })}>Assign someone to complete</Button>}
    </section>
  );
}

const FIELDS: { k: string; label: string; group: "person" | "profile" | "investment" }[] = [
  { k: "firstName", label: "Legal first name", group: "person" }, { k: "middleName", label: "Middle name", group: "person" },
  { k: "lastName", label: "Last name", group: "person" },
  { k: "email", label: "Email", group: "person" }, { k: "phone", label: "Phone", group: "person" },
  { k: "dateOfBirth", label: "Date of birth (YYYY-MM-DD)", group: "person" }, { k: "citizenship", label: "Citizenship", group: "person" },
  { k: "addressLine1", label: "Street address", group: "person" }, { k: "addressLine2", label: "Apt / suite", group: "person" },
  { k: "city", label: "City", group: "person" },
  { k: "region", label: "State / region", group: "person" }, { k: "postalCode", label: "Postal code", group: "person" },
  { k: "country", label: "Country", group: "person" }, { k: "legalName", label: "Entity / business legal name", group: "profile" },
  { k: "jurisdiction", label: "Entity jurisdiction", group: "profile" }, { k: "amount", label: "Commitment (USD)", group: "investment" },
];

/** Manager or Harmonious fills in whatever they know. Server enforces the edit window. */
export function InvestorQuickEdit({ onboardingId, onSaved }: { onboardingId: string; onSaved?: () => void }) {
  const save = useServerFn(updateInvestorRecordFn);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => {
      const v = (k: string) => (f[k] ?? "").trim();
      const person: Record<string, string> = {}; for (const x of FIELDS.filter((x) => x.group === "person")) if (v(x.k)) person[x.k] = v(x.k);
      const details: Record<string, string> = {}; if (v("jurisdiction")) details['jurisdiction'] = v("jurisdiction");
      const amount = v("amount") ? Math.round(Number(v("amount").replace(/[$,]/g, "")) * 100) : null;
      if (amount !== null && !Number.isFinite(amount)) throw new Error("Enter the commitment as a number.");
      return save({ data: {
        onboardingId,
        ...(Object.keys(person).length ? { person } : {}),
        ...(v("legalName") || Object.keys(details).length ? { profile: { ...(v("legalName") ? { legalName: v("legalName") } : {}), ...(Object.keys(details).length ? { details } : {}) } } : {}),
        ...(amount !== null ? { investment: { amountCents: amount, commitmentCents: amount } } : {}),
      } });
    },
    onSuccess: (r: any) => { toast.success(r?.suggested ? `Saved ${r.changed} change(s); ${r.suggested} sent to Harmonious to review.` : `Saved ${r?.changed ?? 0} change(s).`); setF({}); setOpen(false); onSaved?.(); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit details</Button>;
  return (
    <section className="rounded-lg border p-3">
      <h4 className="font-medium">Edit details</h4>
      <p className="mb-2 text-xs text-muted-foreground">Fill in only what you know; blank fields stay as they are. Changes apply directly before signing or funding and are recorded in History. Tax ID, owners and signers have their own sections.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map((x) => <div key={x.k} className="space-y-1"><Label htmlFor={`qe-${x.k}`}>{x.label}</Label><Input id={`qe-${x.k}`} value={f[x.k] ?? ""} inputMode={x.k === "amount" ? "decimal" : undefined} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} /></div>)}
      </div>
      <div className="mt-3 flex gap-2"><Button size="sm" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </section>
  );
}
