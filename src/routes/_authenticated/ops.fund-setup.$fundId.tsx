import { FundSignoffQueue } from "@/components/signoff-board";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FundSetupCanonical } from "@/components/fund-setup-canonical";
import { getStaffFundSetup } from "@/lib/staff-funds.functions";
import { Button } from "@/components/ui/button";
import { OperationsBanking, OperationsSs4, OperationsTaxDocuments } from "@/components/operations-board";
import { FundSetupChecklist, SetupRequirementsProvider } from "@/components/fund-setup-checklist";

export const Route = createFileRoute("/_authenticated/ops/fund-setup/$fundId")({
  head: () => ({ meta: [
    { title: "Fund Setup Detail — Harmonious" },
    { name: "description", content: "Fund formation and launch readiness for Harmonious staff." },
    { property: "og:title", content: "Fund Setup Detail — Harmonious" },
    { property: "og:description", content: "Fund formation and launch readiness for Harmonious staff." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: FundSetupDetail,
});

function FundSetupDetail() {
  const { fundId } = Route.useParams();
  const get = useServerFn(getStaffFundSetup);
  const q = useQuery({ queryKey: ["staff-fund-setup", fundId], queryFn: () => get({ data: { offeringId: fundId } }), retry: false });
  if (q.isPending) return <main className="p-6">Loading setup…</main>;
  if (q.isError) return <main className="p-6" role="alert">{(q.error as Error).message}</main>;
  const d = q.data;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <Button variant="ghost" size="sm" asChild><Link to="/ops/fund-setup">← Funds &amp; SPVs</Link></Button>
    <header><h1 className="font-heading text-2xl font-semibold">{d.name}</h1><p className="text-muted-foreground">{d.clientName ?? "Client not assigned"} · {d.fundType ?? "Fund"}</p><p className="text-xs text-muted-foreground">Fund ID: {fundId}</p></header>
    {d.retired ? <p>This Fund is retired. Its setup cannot be changed.</p> : d.canSeeOperations ? <>
      <section className="space-y-3 border-t pt-6" aria-label="Entity formation and launch">
        <h2 className="font-heading text-xl font-semibold">Entity formation &amp; launch</h2>
        {!d.hasSetup ? <p className="text-sm">No setup record exists for this Fund. An administrator must review it before initialization.</p> : <>
          <p className="text-sm">Formation: {d.formationStep ?? "Not started"} · Launch: {d.launchState ?? "Not ready"}</p>
          <p className="text-sm text-muted-foreground">{d.tasks.filter((t) => t.status !== "complete").length} setup tasks and {d.conditions.filter((c) => !c.satisfied).length} launch conditions still to complete. {d.approvalCount} launch approvals recorded.</p>
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
      {d.canUseOperations && <section id="fund-operations" className="scroll-mt-6 space-y-4 border-t pt-6" aria-label="Banking, EIN and tax">
        <h2 className="font-heading text-xl font-semibold">Banking</h2>
        <OperationsBanking fundId={fundId} />
        <h2 className="font-heading text-xl font-semibold">EIN and Form SS-4</h2>
        <OperationsSs4 fundId={fundId} />
        <h2 className="font-heading text-xl font-semibold">Tax documents</h2>
        <OperationsTaxDocuments fundId={fundId} />
        <h2 className="font-heading text-xl font-semibold">Sign-off queue</h2>
        <FundSignoffQueue fundId={fundId} />
      </section>}
    </> : <p>Fund details are available to the Operations team.</p>}
  </main>;
}