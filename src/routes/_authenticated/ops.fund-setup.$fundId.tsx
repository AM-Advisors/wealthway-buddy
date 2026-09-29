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
    <header><h1 className="font-heading text-2xl font-semibold">{d.name}</h1><p className="text-muted-foreground">{d.clientName ?? "Client not assigned"} · {d.fundType ?? "Fund"}</p><p className="text-xs text-muted-foreground">Fund ID: {fundId}</p></header>
    {d.retired ? <p>This Fund is retired. Its setup cannot be changed.</p> : d.canSeeOperations ? <>
      <section className="space-y-3 border-t pt-6" aria-label="Entity formation and launch">
        <h2 className="font-heading text-xl font-semibold">Entity formation &amp; launch</h2>
        {!d.hasSetup ? <p className="text-sm">No setup record exists for this Fund. An administrator must review it before initialization.</p> : <>
          <p className="text-sm">Formation: {d.formationStep ?? "Not started"} · Launch: {d.launchState ?? "Not ready"}</p>
          <p className="text-sm text-muted-foreground">{d.tasks.filter((t) => t.status !== "complete").length} blocking tasks and {d.conditions.filter((c) => !c.satisfied).length} required conditions remain. {d.approvalCount} launch approvals recorded.</p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div><h3 className="font-medium">Formation evidence</h3><ul className="mt-2 space-y-1 text-sm"><li>Formation document: {d.evidence.formation ? "Recorded" : "Missing"}</li><li>Certificate: {d.evidence.certificate ? "Recorded" : "Missing"}</li><li>EIN letter: {d.evidence.einLetter ? "Recorded" : "Missing"}</li></ul></div>
            <div><h3 className="font-medium">Launch conditions</h3><ul className="mt-2 space-y-1 text-sm">{d.conditions.map((c) => <li key={c.id}>{c.satisfied ? "Complete" : "Pending"} · {c.label}</li>)}</ul></div>
          </div>
          <div><h3 className="font-medium">Blocking setup tasks</h3><ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{d.tasks.map((t) => <li key={t.id}>{t.status === "complete" ? "Complete" : "Pending"} · {t.label}</li>)}</ul></div>
          <p className="text-sm text-muted-foreground">Evidence, approvals and launch decisions remain in their authorized workflows.</p>
        </>}
        {d.canUseOperations && <Button variant="outline" asChild><Link to="/ops/funds/$fundId" params={{ fundId }}>Fund workspace</Link></Button>}
      </section>
      {d.canUseCanonical && <FundSetupCanonical offeringId={fundId} />}
    </> : <p>Fund details are available to the Operations team.</p>}
  </main>;
}