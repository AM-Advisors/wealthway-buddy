import { FundManagerSetupLoader } from "@/components/fund-manager-setup-loader";
import { FundSignoffQueue } from "@/components/signoff-board";
import { Link } from "@tanstack/react-router";
import { OpsRecordPage } from "@/components/ops-record";
import { FundWorkspace, FUND_TABS } from "@/components/fund-workspace";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FundSetupCanonical } from "@/components/fund-setup-canonical";
import { getStaffFundSetup } from "@/lib/staff-funds.functions";
import { Button } from "@/components/ui/button";
import { OperationsSs4, OperationsTaxDocuments } from "@/components/operations-board";
import { FundSetupChecklist, SetupRequirementsProvider } from "@/components/fund-setup-checklist";
import { fundSetupSummary } from "@/lib/fund-launch-summary";

/** The single Operations fund page: Setup (incl. launch readiness), Investors and every client tab. */
export function OpsFundPage({ fundId, tab = "setup", onTab }: { fundId: string; tab?: string; onTab: (v: string) => void }) {
  const get = useServerFn(getStaffFundSetup);
  const q = useQuery({ queryKey: ["staff-fund-setup", fundId], queryFn: () => get({ data: { offeringId: fundId } }), retry: false });
  if (q.isPending) return <main className="p-6">Loading setup…</main>;
  if (q.isError) return <main className="p-6" role="alert">{(q.error as Error).message}</main>;
  const d = q.data;
  const setupBody = <>
{d.retired ? <p>This Fund is retired. Its setup cannot be changed.</p> : d.canSeeOperations ? <>
      <section className="space-y-3 border-t pt-6" aria-label="Entity formation and launch">
        <h2 className="font-heading text-xl font-semibold">Entity formation &amp; launch</h2>
        {!d.hasSetup ? <p className="text-sm">No setup record exists for this Fund. An administrator must review it before initialization.</p> : <>
          {(() => { const s = fundSetupSummary(d); return <>
          <p className="text-sm">Formation: {d.formationStep ?? "Not started"} · Setup {s.percent}% complete · Launch: <span className="capitalize">{s.launchLabel}</span></p>
          <p className="text-sm text-muted-foreground">{s.openTasks} setup tasks and {s.openConditions} launch conditions still to complete. {d.approvalCount} launch approvals recorded.</p>
          </>; })()}
          <p className="text-sm"><Link className="underline" to="/ops/fund/$fundId" params={{ fundId }} search={{ tab: "investors" }}>Investor readiness for each investor</Link></p>
          {d.canUseCanonical
            ? <p className="text-sm text-muted-foreground">Each required item is listed inside its Fund Setup section below.</p>
            : <FundSetupChecklist tasks={d.tasks} conditions={d.conditions} evidence={d.evidence} canEdit={d.canUseOperations} canNavigate={false} onChanged={() => q.refetch()} />}
        </>}
      </section>
      {d.canUseCanonical && (
        <SetupRequirementsProvider value={{ tasks: d.tasks, conditions: d.conditions, evidence: d.evidence, canEdit: d.canUseOperations, approvalCount: d.approvalCount, setupId: d.setupId, isPreparer: d.isPreparer, approvals: d.approvals, onChanged: () => q.refetch() }}>
          <FundSetupCanonical offeringId={fundId} />
        </SetupRequirementsProvider>
      )}
      {d.canUseOperations && <section id="fund-operations" className="scroll-mt-6 space-y-4 border-t pt-6" aria-label="EIN, tax and sign-off">
        <h2 className="font-heading text-xl font-semibold">EIN and Form SS-4</h2>
        <OperationsSs4 fundId={fundId} />
        <h2 className="font-heading text-xl font-semibold">Tax documents</h2>
        <OperationsTaxDocuments fundId={fundId} />
        <h2 className="font-heading text-xl font-semibold">Sign-off queue</h2>
        <FundSignoffQueue fundId={fundId} />
      </section>}
    </> : <p>Fund details are available to the Operations team.</p>}
  </>;
  const openTask = (d.tasks ?? []).find((t: { status: string }) => t.status !== "complete") as { label: string } | undefined;
  const openCond = (d.conditions ?? []).find((c: { satisfied: boolean }) => !c.satisfied) as { label: string } | undefined;
  const next = openTask
    ? { label: openTask.label, tab: "setup" }
    : openCond ? { label: openCond.label, tab: "setup" } : d.hasSetup ? { label: "Invite and onboard investors", tab: "investors" } : null;
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
    <Button variant="ghost" size="sm" asChild><Link to="/ops/funds">← Funds</Link></Button>
    {next && !d.retired && d.canSeeOperations && (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next step</p><p className="font-medium">{next.label}</p></div>
        <Button size="sm" onClick={() => { onTab(next.tab); setTimeout(() => document.getElementById("fund-workspace-tabs")?.scrollIntoView({ behavior: "smooth" }), 50); }}>{next.tab === "setup" ? "Go to Setup" : "Go to Investors"}</Button>
      </div>
    )}
    {(d.retired || !d.canSeeOperations) && <header><h1 className="font-heading text-2xl font-semibold">{d.name}</h1><p className="text-muted-foreground">{d.clientName ?? "Client not assigned"} · {d.fundType ?? "Fund"}</p><p className="text-xs text-muted-foreground">Fund ID: {fundId}</p></header>}
    {d.retired || !d.canSeeOperations ? setupBody : <FundWorkspace fundId={fundId} mode="harmonious" tab={tab} onTab={(v) => onTab(v)}
      headerExtra={<>
        <Button size="sm" variant="outline" asChild><Link to="/admin/fund-payments/$fundId" params={{ fundId }}>Payments</Link></Button>
      </>}
      extraTabs={[{ value: "setup", label: "Setup", content: <div className="space-y-6"><FundManagerSetupLoader offeringId={fundId} />{setupBody}</div> }, { value: "record", label: "Activity & record", content: <OpsRecordPage type="fund" id={fundId} /> }]} />}
  </main>;
}