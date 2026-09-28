import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { fundReadinessFn, investmentReadinessFn, readinessQueueFn } from "@/lib/investor-onboarding.functions";
import { OWNER_LABELS, STATUS_LABELS, type ReadinessStatus } from "@/lib/investment-readiness";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const money = (c: number | null | undefined) => (c ? `$${(c / 100).toLocaleString("en-US")}` : "—");
const ownerText = (o: string | null | undefined) => (o ? OWNER_LABELS[o as keyof typeof OWNER_LABELS] : "—");

function StatusBadge({ status, label }: { status: ReadinessStatus; label?: string }) {
  const v = status === "complete" ? "secondary" : status === "blocked" ? "destructive" : "outline";
  return <Badge variant={v as any}>{label ?? STATUS_LABELS[status]}</Badge>;
}

function Checklist({ r, showReasons }: { r: any; showReasons: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-2xl font-semibold">{r.percentComplete}% Complete</p>
          <Progress value={r.percentComplete} className="mt-1" />
          <p className="mt-1 text-xs text-muted-foreground">{r.completeCount} of {r.requiredCount} required items. Not-applicable items are excluded.</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Next step</p>
          <p className="font-medium">{r.nextAction?.label ?? "Nothing outstanding"}</p>
          <p className="text-xs text-muted-foreground">Action required from: {ownerText(r.nextAction?.owner)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Close readiness</p>
          <p className="font-medium">{r.terminal === "closed" ? "Closed" : r.closeReady ? "Ready to Close" : "Not Ready to Close"}</p>
          {!r.closeReady && r.closeBlockers?.length ? <p className="text-xs text-muted-foreground">Still needed: {r.closeBlockers.slice(0, 3).join(", ")}{r.closeBlockers.length > 3 ? "…" : ""}</p> : null}
          {r.requestedCloseDate ? <p className="text-xs text-muted-foreground">Requested close: {r.requestedCloseDate}</p> : null}
        </div>
      </div>
      {!r.closeReady && r.percentComplete >= 90 && !r.terminal ? (
        <p className="text-xs text-muted-foreground">A nearly complete investment is still not ready to close while any blocking item remains.</p>
      ) : null}
      <ol className="space-y-2">
        {r.stages.map((s: any, idx: number) => (
          <li key={s.stage} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{idx + 1}. {s.title}{r.currentStage === s.stage ? <span className="ml-2 text-xs text-muted-foreground">Current stage</span> : null}</p>
              <StatusBadge status={s.status} label={s.safeLabel} />
            </div>
            <ul className="mt-2 space-y-1">
              {r.items.filter((i: any) => i.stage === s.stage && i.status !== "not_applicable").map((i: any) => (
                <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{i.label}{showReasons && i.reason ? <span className="text-muted-foreground"> — {i.reason}</span> : null}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {i.owner ? <span>{ownerText(i.owner)}</span> : null}
                    <StatusBadge status={i.status} />
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Investor / manager / staff view of one Investment's canonical checklist. */
export function InvestmentChecklist({ onboardingId }: { onboardingId: string }) {
  const load = useServerFn(investmentReadinessFn);
  const q = useQuery({ queryKey: ["investment-readiness", onboardingId], queryFn: () => load({ data: { onboardingId } }), retry: false });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !q.data) return null;
  const d = q.data as any;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{d.fundName} — Investment Readiness</CardTitle>
        <CardDescription>Investment Checklist{d.profileLabel ? ` · ${d.profileLabel}` : ""}. Updated automatically from verification, signing, tax and banking records.</CardDescription>
      </CardHeader>
      <CardContent><Checklist r={d.readiness} showReasons={d.viewer !== "manager"} /></CardContent>
    </Card>
  );
}

/** Fund → Readiness: one row per Investment, from the same engine. */
export function FundReadiness({ fundId }: { fundId: string }) {
  const load = useServerFn(fundReadinessFn);
  const q = useQuery({ queryKey: ["fund-readiness", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <p className="text-sm text-muted-foreground">Investor readiness is available to Harmonious staff and managers of this fund.</p>;
  const d = q.data as any;
  const sel = d.rows.find((r: any) => r.onboardingId === open);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investor Readiness</CardTitle>
          <CardDescription>Each investment's progress, next action and who owns it. Statuses are high level; underlying verification, tax and identity evidence is not shown here.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!d.rows.length ? <p className="text-sm text-muted-foreground">No investments in progress for this fund yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-2">Investor</th><th>Profile</th><th>Investment</th><th>Progress</th><th>Next Action</th><th>Owner</th><th>Close Ready</th></tr></thead>
              <tbody>
                {d.rows.map((r: any) => (
                  <tr key={r.onboardingId} className="border-t">
                    <td className="py-2"><Button variant="link" className="h-auto p-0" onClick={() => setOpen(r.onboardingId === open ? null : r.onboardingId)}>{r.investorName}</Button></td>
                    <td>{r.profileLabel ?? r.profileType ?? "—"}</td>
                    <td>{money(r.amountCents)}</td>
                    <td>{r.percentComplete}%</td>
                    <td>{r.nextAction?.label ?? "None"}</td>
                    <td>{ownerText(r.nextAction?.owner)}</td>
                    <td>{r.closeReady ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {sel ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{sel.investorName} — Investment Checklist</CardTitle></CardHeader>
          <CardContent><Checklist r={sel.readiness} showReasons={d.viewer === "staff"} /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** Operations → readiness queue: open internal tasks owned by Harmonious, oldest first. */
export function ReadinessQueue() {
  const load = useServerFn(readinessQueueFn);
  const q = useQuery({ queryKey: ["readiness-queue"], queryFn: () => load(), retry: false });
  const [owner, setOwner] = useState<string>("harmonious");
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <p className="text-sm text-muted-foreground">Harmonious operations access is required.</p>;
  const rows = ((q.data ?? []) as any[]).filter((r) => owner === "all" || r.owner === owner);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Investment readiness queue</CardTitle>
        <CardDescription>Open work items created automatically from each investment's checklist. They resolve on their own when the underlying record changes. No emails are sent from here.</CardDescription>
        <div className="flex gap-2 pt-2">
          {["harmonious", "investor", "fund_manager", "all"].map((o) => (
            <Button key={o} size="sm" variant={owner === o ? "default" : "outline"} onClick={() => setOwner(o)}>{o === "all" ? "All" : ownerText(o)}</Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!rows.length ? <p className="text-sm text-muted-foreground">Nothing waiting.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-2">Fund</th><th>Investor</th><th>Action</th><th>Owner</th><th>Age</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{r.fundName}</td><td>{r.investorName}</td><td>{r.title}</td><td>{ownerText(r.owner)}</td><td>{r.ageDays}d</td>
                  <td>{r.offeringId ? <Link to="/manager/fund/$fundId/readiness" params={{ fundId: r.offeringId }} className="text-primary underline">Open</Link> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
