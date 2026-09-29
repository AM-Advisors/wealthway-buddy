import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FundSetupCanonical } from "@/components/fund-setup-canonical";
import { getStaffFundSetup } from "@/lib/staff-funds.functions";
import { Button } from "@/components/ui/button";

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
    <header><h1 className="font-heading text-2xl font-semibold">{d.name}</h1><p className="text-muted-foreground">{d.clientName ?? "Client not assigned"} · {d.fundType ?? "Fund"}</p></header>
    {d.retired ? <p>This Fund is retired. Its setup cannot be changed.</p> : d.canSeeOperations ? <>
      {d.canUseCanonical && <FundSetupCanonical offeringId={fundId} />}
      <section className="space-y-3 border-t pt-6" aria-label="Entity formation and launch">
        <h2 className="font-heading text-xl font-semibold">Entity formation &amp; launch</h2>
        <p className="text-sm">Formation: {d.formationStep ?? "Not started"} · Launch: {d.launchState ?? "Not ready"}</p>
        <p className="text-sm text-muted-foreground">{d.pendingTasks} setup tasks and {d.unmetConditions} launch conditions remain. Evidence, approvals and launch decisions remain in their authorized workflows.</p>
        {d.canUseOperations && <Button variant="outline" asChild><Link to="/ops/funds/$fundId" params={{ fundId }}>Fund workspace</Link></Button>}
      </section>
    </> : <p>Fund details are available to the Operations team.</p>}
  </main>;
}