/** Step 4 of a Drive migration: launch checklist, prior (off-platform) subscriptions, and manual invites. */
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { decidePriorSubscription, getFundLaunchFlow, recordPriorSubscription, sendFundLaunchInvites } from "@/lib/prior-subscription.functions";

const usd = (c: number | null | undefined) => c == null ? "—" : `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function FundLaunchInvestors({ fundId, items }: { fundId: string; items: any[] }) {
  const load = useServerFn(getFundLaunchFlow);
  const send = useServerFn(sendFundLaunchInvites);
  const qc = useQueryClient();
  const key = ["fund-launch-flow", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const evidence = items.filter((i) => i.category === "investor" || /subscription|wire/i.test(String(i.document_type ?? "")));

  const invite = async () => {
    setBusy(true);
    try {
      const r = await send({ data: { offeringId: fundId, onboardingIds: sel } });
      const bad = r.results.filter((x) => !x.ok);
      toast.success(`Sent ${r.sent} invite${r.sent === 1 ? "" : "s"}${bad.length ? `; ${bad.length} skipped (${bad[0]!.message})` : ""}.`);
      setSel([]); refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold text-foreground">Step 4 · Launch and investors</h2>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && <>
        <div className="grid gap-2 sm:grid-cols-4">{d.checklist.map((c) => (
          <div key={c.label} className={`rounded-lg border p-3 text-sm ${c.done ? "border-primary bg-primary/5" : ""}`}>{c.done ? "✓ " : ""}{c.label}</div>
        ))}</div>
        {!d.launched && <p className="text-xs text-muted-foreground">Launching uses the normal approval on <Link to="/ops/fund-setup/$fundId" params={{ fundId }} className="text-primary underline">Fund Setup</Link>. Invites unlock after launch.</p>}
        <p className="text-xs text-muted-foreground">Investors who signed and funded before Harmonious can be marked as a prior subscription. A second staff member confirms it. They still complete About You and identity verification, then skip Sign and Fund. Prior funding is labelled "Funded (prior, off-platform)" and is never counted as money Harmonious reconciled.</p>
        {!d.investors.length && <p className="text-sm text-muted-foreground">No investors yet. Accept investor suggestions in Step 3.</p>}
        {d.investors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="w-8" /><th>Investor</th><th>Commitment</th><th>Prior subscription</th><th>Progress</th><th /></tr></thead>
              <tbody className="divide-y">{d.investors.map((i) => (<Fragment key={i.onboardingId}>
                <tr>
                  <td>{d.canManage && d.launched && !i.invited && !i.joined && <Checkbox checked={sel.includes(i.onboardingId)} onCheckedChange={(v) => setSel((x) => v ? [...x, i.onboardingId] : x.filter((y) => y !== i.onboardingId))} aria-label={`Select ${i.name}`} />}</td>
                  <td className="py-2"><div className="font-medium text-foreground">{i.name}</div><div className="text-xs text-muted-foreground">{i.email ?? "No email"}</div></td>
                  <td>{usd(i.commitmentCents)}</td>
                  <td>{i.prior ? <div className="space-y-0.5">
                    <Badge variant={i.prior.status === "confirmed" ? "default" : i.prior.status === "rejected" ? "destructive" : "secondary"}>{i.prior.status === "confirmed" ? "Funded (prior, off-platform)" : i.prior.status === "rejected" ? "Rejected" : "Awaiting confirmation"}</Badge>
                    <div className="text-xs text-muted-foreground">{usd(i.prior.fundedCents)} of {usd(i.prior.commitmentCents)} · signed {i.prior.signedOn}{i.prior.version > 1 ? ` · v${i.prior.version}` : ""}</div>
                  </div> : <span className="text-xs text-muted-foreground">None</span>}</td>
                  <td><Badge variant="outline">{i.progress}</Badge></td>
                  <td className="space-x-1 whitespace-nowrap text-right">
                    {d.canManage && i.prior?.status === "awaiting" && !i.prior.recordedByMe && <PriorDecision fundId={fundId} priorId={i.prior.id} onDone={refresh} />}
                    {d.canManage && <Button size="sm" variant="outline" onClick={() => setOpen(open === i.onboardingId ? null : i.onboardingId)}>{i.prior ? "Correct" : "Mark prior subscription"}</Button>}
                  </td>
                </tr>
                {open === i.onboardingId && <tr key={`${i.onboardingId}-f`}><td colSpan={6}><PriorForm fundId={fundId} inv={i} evidence={evidence} onDone={() => { setOpen(null); refresh(); }} /></td></tr>}
              </Fragment>))}</tbody>
            </table>
          </div>
        )}
        {d.canManage && d.launched && <Button size="sm" disabled={!sel.length || busy} onClick={invite}>{busy ? "Sending…" : `Send invites${sel.length ? ` (${sel.length})` : ""}`}</Button>}
      </>}
    </section>
  );
}

function PriorDecision({ fundId, priorId, onDone }: { fundId: string; priorId: string; onDone: () => void }) {
  const decide = useServerFn(decidePriorSubscription);
  const go = async (confirm: boolean) => {
    const note = confirm ? null : window.prompt("Why is this being rejected?") ?? null;
    if (!confirm && !note) return;
    try { await decide({ data: { offeringId: fundId, priorId, confirm, note } }); toast.success(confirm ? "Prior subscription confirmed." : "Rejected."); onDone(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return <><Button size="sm" onClick={() => go(true)}>Confirm</Button><Button size="sm" variant="outline" onClick={() => go(false)}>Reject</Button></>;
}

function PriorForm({ fundId, inv, evidence, onDone }: { fundId: string; inv: any; evidence: any[]; onDone: () => void }) {
  const rec = useServerFn(recordPriorSubscription);
  const p = inv.prior;
  const [commit, setCommit] = useState(String(((p?.commitmentCents ?? inv.commitmentCents) ?? 0) / 100 || ""));
  const [funded, setFunded] = useState(String(((p?.fundedCents ?? inv.commitmentCents) ?? 0) / 100 || ""));
  const [signed, setSigned] = useState(p?.signedOn ?? "");
  const [ev, setEv] = useState<string[]>(p?.evidence ?? []);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = evidence.filter((e) => !e.investor_name || String(inv.name).toLowerCase().includes(String(e.investor_name).toLowerCase()) || String(e.investor_name).toLowerCase().includes(String(inv.name).toLowerCase()));
  const save = async () => {
    setBusy(true);
    try {
      await rec({ data: { offeringId: fundId, onboardingId: inv.onboardingId, commitmentCents: Math.round(Number(commit) * 100), fundedCents: Math.round(Number(funded) * 100), signedOn: signed, evidenceItemIds: ev, reason: reason || null } });
      toast.success("Recorded. Another staff member needs to confirm it."); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">Commitment (USD)<Input type="number" min="0" value={commit} onChange={(e) => setCommit(e.target.value)} /></label>
        <label className="text-xs">Funded (USD)<Input type="number" min="0" value={funded} onChange={(e) => setFunded(e.target.value)} /></label>
        <label className="text-xs">Date signed<Input type="date" value={signed} onChange={(e) => setSigned(e.target.value)} /></label>
      </div>
      <div className="text-xs font-medium">Evidence from the Drive files (executed subscription, wire proof)</div>
      <div className="max-h-40 space-y-1 overflow-y-auto">{(mine.length ? mine : evidence).map((e) => (
        <label key={e.id} className="flex items-center gap-2 text-xs"><Checkbox checked={ev.includes(e.id)} onCheckedChange={(v) => setEv((x) => v ? [...x, e.id] : x.filter((y) => y !== e.id))} />{e.file_name}</label>
      ))}{!evidence.length && <p className="text-xs text-muted-foreground">No investor files sorted yet.</p>}</div>
      {p && <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the correction (required)" />}
      <Button size="sm" disabled={busy || !commit || !signed} onClick={save}>{busy ? "Saving…" : p ? "Save new version" : "Record prior subscription"}</Button>
    </div>
  );
}
