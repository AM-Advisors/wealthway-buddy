import { createFileRoute } from "@tanstack/react-router";

import { Empty, WorkspaceSection, flatten, useProfessionalOverview } from "@/components/professional-workspace";
import { TaxFormTable, statusLabel, useProfessionalTax } from "@/components/professional-tax";

function Tax() {
  const q = useProfessionalTax();
  const overview = useProfessionalOverview();
  const docs = flatten<any>(overview.data?.views, (v) => v.taxDocuments);

  return (
    <WorkspaceSection
      title="Tax"
      description="Returns and forms for Funds and taxpayers that delegated tax permission to you. Every view and step is recorded."
    >
      {q.isLoading ? <Empty>Loading…</Empty> : q.error ? <Empty>{(q.error as Error).message}</Empty> : (
        <div className="space-y-8">
          {q.data!.funds.length === 0 && q.data!.individualReturns.length === 0 && (
            <Empty>No Fund or taxpayer has delegated tax permission to you yet.</Empty>
          )}
          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">Prepared returns <span className="text-sm font-normal text-muted-foreground">({q.data!.individualReturns.length})</span></h2>
            {q.data!.individualReturns.length === 0 ? <p className="text-sm text-muted-foreground">No individual returns in your scope.</p> : (
              <ul className="divide-y rounded-md border text-sm">
                {q.data!.individualReturns.map((r) => (
                  <li key={r.id} className="flex justify-between p-3"><span className="font-medium">{r.taxpayer} · {r.taxYear}</span><span className="text-muted-foreground">{statusLabel(r.status)}</span></li>
                ))}
              </ul>
            )}
          </section>
          <TaxFormTable title="Form 1065 partnership returns" rows={q.data!.returns1065} empty="No 1065s in your scope." />
          <TaxFormTable title="Form 1042 and 1042-S withholding" rows={q.data!.returns1042} empty="No 1042 packages in your scope." />
          <TaxFormTable title="Form 1099s" rows={q.data!.forms1099} empty="No 1099s in your scope." />
          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">Tax documents</h2>
            {docs.length === 0 ? <p className="text-sm text-muted-foreground">No tax documents are in scope.</p> : (
              <ul className="space-y-2 text-sm">
                {docs.map((t: any) => (
                  <li key={t.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{t.name}</span><span className="text-xs text-muted-foreground">{t.year ?? ""}</span></div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.client} — {String(t.type).replace(/_/g, " ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/tax")({
  head: () => ({
    meta: [
      { title: "Tax — Harmonious professional workspace" },
      { name: "description", content: "Delegated 1065s, 1042-Ss, 1099s and prepared returns to prepare and review." },
      { property: "og:title", content: "Tax — Harmonious professional workspace" },
      { property: "og:description", content: "Prepare and review delegated Fund tax work." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tax,
});
