import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { correctEmailEverywhere, getEmailFootprint } from "@/lib/access-admin.functions";
import { EMAIL_AREAS, looksLikeEmail, normalizeEmail, planEmailCorrection, summarizeCorrection, type EmailArea } from "@/lib/email-correction-model";

/**
 * One place to fix a mistyped email. Shows every address on file for this person and
 * where it is used, then updates the login, person record, client contacts, fund team
 * entries and open invitations together. Server checks decide who may do it.
 */
export function EmailCorrectionCard({ userId, personId }: { userId: string | null; personId: string | null }) {
  const qc = useQueryClient();
  const load = useServerFn(getEmailFootprint);
  const save = useServerFn(correctEmailEverywhere);
  const q = useQuery({ queryKey: ["email-footprint", userId, personId], queryFn: () => load({ data: { userId, personId } }), retry: false });
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (q.isError || !q.data) return null;
  const d = q.data;
  const mismatch = d.emails.length > 1;
  const target = normalizeEmail(email);
  const plan = looksLikeEmail(target) ? summarizeCorrection(planEmailCorrection(d.rows as any, target)) : [];
  const ready = looksLikeEmail(target) && reason.trim().length >= 5 && plan.length > 0;
  const placesFor = (address: string) => {
    const rows = d.rows.filter((r) => normalizeEmail(r.email) === address);
    const by = new Map<EmailArea, string[]>();
    for (const r of rows) by.set(r.area as EmailArea, [...(by.get(r.area as EmailArea) ?? []), ...(r.where ? [r.where] : [])]);
    return [...by.entries()].map(([a, w]) => `${EMAIL_AREAS[a]}${w.length ? ` (${[...new Set(w)].join(", ")})` : ""}`);
  };

  async function apply() {
    setBusy(true);
    try {
      await save({ data: { userId, personId, email: target, reason: reason.trim() } });
      toast.success("Email updated everywhere. Past emails and signed documents keep the address they were sent to.");
      setEmail(""); setReason(""); setConfirm(false);
      await Promise.all(["email-footprint", "person-activity", "account-subject", "access-profile"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the email.");
    } finally { setBusy(false); }
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg">Email address</h2>
        {mismatch ? <Badge variant="destructive">Different emails on file</Badge> : <Badge variant="outline">Same email everywhere</Badge>}
      </div>
      {mismatch && <p className="text-sm">This person is recorded under more than one email, so they may not be matched to their invitation when they sign in. Pick the correct one and update it everywhere.</p>}
      <ul className="space-y-2 text-sm">
        {d.emails.map((e) => (
          <li key={e.email} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2">
            <div className="min-w-0">
              <p className="break-all font-medium">{e.email}{d.loginEmail && normalizeEmail(d.loginEmail) === e.email ? <Badge variant="secondary" className="ml-2">Signs in with this</Badge> : null}</p>
              <p className="text-xs text-muted-foreground">{placesFor(e.email).join(" · ")}</p>
            </div>
            {mismatch && <Button size="sm" variant="outline" onClick={() => setEmail(e.email)}>Use this one</Button>}
          </li>
        ))}
        {!d.emails.length && <li className="text-muted-foreground">No email on file yet.</li>}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Correct email
          <Input type="email" autoComplete="off" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="name@company.com" className="mt-1" />
        </label>
        <label className="text-sm">Reason
          <Textarea rows={1} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="For example: typo when the fund team was added" className="mt-1" />
        </label>
      </div>
      {plan.length > 0 && <p className="text-xs text-muted-foreground">Will update: {plan.map((p) => `${p.label} (${p.count})`).join(", ")}.</p>}
      <Button disabled={!ready || busy} onClick={() => setConfirm(true)}>Update email everywhere</Button>
      <p className="text-xs text-muted-foreground">{d.hasLogin ? "They sign in with the new email from now on; their investments, verification and access stay the same." : "When they create a login with this email, it connects to their fund and client records automatically."} Emails already sent and signed documents keep the address they used.</p>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change to {target}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>These will all use the new email:</p>
                <ul className="list-disc pl-5">{plan.map((p) => <li key={p.area}>{p.label}: {p.count}</li>)}</ul>
                <p>The change is recorded with your reason.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(ev) => { ev.preventDefault(); void apply(); }}>{busy ? "Updating…" : "Update everywhere"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
