import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideMfaReset, listSecurityActivity, requestMfaReset } from "@/lib/account-security.functions";

/** Display only; all access and second-person checks remain in the existing engine. */
export function MfaResetPanel({ email, userId }: { email: string; userId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listSecurityActivity);
  const request = useServerFn(requestMfaReset);
  const decide = useServerFn(decideMfaReset);
  const q = useQuery({ queryKey: ["mfa-reset-panel", email], queryFn: () => list({ data: { email, page: 0 } }), retry: false });
  const [reason, setReason] = useState("");
  const [identityCheck, setIdentityCheck] = useState("");
  const [busy, setBusy] = useState(false);
  const resets = (q.data?.resets ?? []).filter(r => r.target_user_id === userId);
  const pending = resets.some(r => r.status === "pending");
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action(); toast.success(message);
      await Promise.all([qc.invalidateQueries({ queryKey: ["mfa-reset-panel"] }), qc.invalidateQueries({ queryKey: ["security-activity"] }), qc.invalidateQueries({ queryKey: ["person-activity"] })]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update the reset request."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 border-y py-4">
    <h2 className="text-lg">Authenticator reset</h2>
    {q.isPending ? <p className="text-sm text-muted-foreground">Loading reset access…</p> : q.error ? <div className="space-y-2">
      <p className="text-sm text-destructive">{q.error instanceof Error && q.error.message === "Forbidden" ? "Administrator access is required to reset an authenticator." : "Unable to load authenticator resets. Refresh and try again."}</p>
      <Button variant="outline" size="sm" onClick={() => void q.refetch()}>Try again</Button>
    </div> : <>
      <p className="text-sm text-muted-foreground">Confirm the account holder's identity. One administrator approval removes the authenticator and remembered devices; every reset is logged.</p>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void run(async () => { await request({ data: { email, reason, identityCheck } }); setReason(""); setIdentityCheck(""); }, "Reset requested — awaiting another administrator"); }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm"><span>Account email</span><Input type="email" value={email} readOnly /></label>
          <label className="space-y-1 text-sm"><span>Reason for reset</span><Input required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>How identity was confirmed</span><Input required minLength={5} maxLength={500} value={identityCheck} onChange={event => setIdentityCheck(event.target.value)} /></label>
        </div>
        <Button type="submit" size="sm" disabled={busy || pending || reason.trim().length < 5 || identityCheck.trim().length < 5}>Request authenticator reset</Button>
      </form>
      {resets.map(r => <div key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><span className="break-all font-medium">{r.target_email}</span><Badge variant="outline">{r.status}</Badge><span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span></div>
        <p className="break-words">{r.reason} · Identity: {r.identity_check}</p>
        {r.decision_reason && <p className="break-words text-muted-foreground">Decision: {r.decision_reason}</p>}
        {r.status === "pending" && !r.canDecide && <p className="text-muted-foreground">Another administrator must approve resets of your own account.</p>}
        {r.canDecide && <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => { if (window.confirm(`Remove the authenticator and remembered devices for ${r.target_email}?`)) void run(() => decide({ data: { id: r.id, approve: true } }), "Authenticator reset approved"); }}>Approve reset</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { const declineReason = window.prompt("Reason for declining"); if (declineReason?.trim()) void run(() => decide({ data: { id: r.id, approve: false, reason: declineReason.trim() } }), "Reset declined"); }}>Decline</Button>
        </div>}
      </div>)}
    </>}
  </section>;
}
