import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { decideTakeoverAdmissionFn, takeoverOverviewFn } from "@/lib/takeover-admission.functions";
import { ADMISSION_STATUSES, COMPLIANCE_ITEMS, COMPLIANCE_STATES, EVIDENCE_REQUIREMENTS, EVIDENCE_STATUSES, INVESTOR_ORIGINS } from "@/lib/takeover-admission-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const money = (c: number) => `$${((c ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const label = (list: readonly { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;

/** Staff view: admit existing investors from a takeover, one decision per investor. */
export function TakeoverAdmissionsPanel({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(takeoverOverviewFn);
  const decide = useServerFn(decideTakeoverAdmissionFn);
  const q = useQuery({ queryKey: ["takeover", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: (v: { admissionId: string; approve: boolean }) => decide({ data: { ...v, reason: reason.trim() || null } }),
    onSuccess: () => { toast.success("Decision recorded"); setReason(""); qc.invalidateQueries({ queryKey: ["takeover", offeringId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading existing investors…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data as any;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl">Admit existing investors</h2>
        <p className="text-sm text-muted-foreground">
          Investors who already owned an interest before Harmonious took over. Admission records the relationship from the prior administrator's records. It does not mean Harmonious completed KYC, AML, accreditation, tax forms or payout checks. Those stay open as follow-ups.
        </p>
      </div>

      <Card><CardContent className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-5">
        <div><div className="text-muted-foreground">Investors</div><div className="text-lg">{d.totals.investors}</div></div>
        <div><div className="text-muted-foreground">Commitments</div><div className="text-lg">{money(d.totals.commitmentCents)}</div></div>
        <div><div className="text-muted-foreground">Called to date</div><div className="text-lg">{money(d.totals.calledCents)}</div></div>
        <div><div className="text-muted-foreground">Paid in to date</div><div className="text-lg">{money(d.totals.contributedCents)}</div></div>
        <div><div className="text-muted-foreground">Can be called</div><div className="text-lg">{d.totals.eligible} of {d.totals.investors}</div></div>
      </CardContent></Card>

      <div className="space-y-2">
        {d.eligibility.map((r: any) => {
          const a = d.admissions.find((x: any) => x.position_id === r.positionId && !["rejected", "superseded"].includes(x.status));
          return (
            <Card key={r.positionId}><CardContent className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{r.name}</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{label(INVESTOR_ORIGINS, r.origin)}</Badge>
                  {a && <Badge variant="secondary">{label(ADMISSION_STATUSES, a.status)}</Badge>}
                  <Badge variant={r.eligible ? "default" : "destructive"}>{r.eligible ? "Can be called" : "Can't be called"}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
                <span>Commitment {money(r.commitmentCents)}</span><span>Called {money(r.calledCents)}</span>
                <span>Paid in {money(r.contributedCents)}</span><span>Remaining {money(r.remainingCents)}</span>
              </div>
              <div className="text-muted-foreground">{r.reason}</div>
              {r.flags.length > 0 && <div className="flex flex-wrap gap-1">{r.flags.map((f: string) => <Badge key={f} variant="outline">{f}</Badge>)}</div>}
              {a && (
                <div>
                  <Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide details" : "Show evidence and status"}</Button>
                  {open === a.id && (
                    <div className="mt-2 space-y-3 rounded-md border p-3">
                      <div>Source: {a.source_system} as of {a.as_of_date} · Batch {a.batch_ref} · Class {a.class_label ?? "-"} · Opening capital {money(a.opening_capital_cents)}</div>
                      <div><div className="font-medium">Evidence</div>
                        <ul className="mt-1 grid gap-1 sm:grid-cols-2">{EVIDENCE_REQUIREMENTS.map((req) => { const e = (a.evidence as any[]).find((x) => x.key === req.key); return <li key={req.key}>{req.label}: <span className="text-muted-foreground">{e ? label(EVIDENCE_STATUSES, e.status) : "Missing"}{e?.sourceRef ? ` (${e.sourceRef})` : ""}</span></li>; })}</ul>
                      </div>
                      <div><div className="font-medium">Compliance (separate from ownership)</div>
                        <ul className="mt-1 grid gap-1 sm:grid-cols-2">{COMPLIANCE_ITEMS.map((c) => <li key={c.key}>{c.label}: <span className="text-muted-foreground">{label(COMPLIANCE_STATES, a.compliance?.[c.key] ?? "missing")}</span></li>)}</ul>
                      </div>
                      {a.decided_by && <div className="text-muted-foreground">Decided {String(a.decided_at).slice(0, 10)}{a.decision_reason ? ` - ${a.decision_reason}` : ""}</div>}
                      {["prepared", "evidence_review", "approval_required"].includes(a.status) && (
                        <div className="space-y-2">
                          <Textarea placeholder="Note (required to reject)" value={reason} onChange={(e) => setReason(e.target.value)} />
                          <div className="flex gap-2">
                            <Button size="sm" disabled={m.isPending || a.status !== "approval_required"} onClick={() => m.mutate({ admissionId: a.id, approve: true })}>Admit existing investor</Button>
                            <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ admissionId: a.id, approve: false })}>Reject</Button>
                          </div>
                          <p className="text-xs text-muted-foreground">The person who prepared this can't decide it.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent></Card>
          );
        })}
      </div>
    </section>
  );
}
