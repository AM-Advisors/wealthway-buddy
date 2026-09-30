import { createFileRoute } from "@tanstack/react-router";

import { TaxFormTable, statusLabel, useProfessionalTax } from "@/components/professional-tax";

export const Route = createFileRoute("/_authenticated/ops/tax")({
  head: () => ({
    meta: [
      { title: "Tax workspace — Harmonious Operations" },
      { name: "description", content: "Prepared returns, 1065s, 1042-Ss and 1099s across every Fund, with prepare and review." },
      { property: "og:title", content: "Tax workspace — Harmonious Operations" },
      { property: "og:description", content: "Prepare and review Fund tax returns and forms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StaffTax,
});

function StaffTax() {
  const q = useProfessionalTax("staff");
  const d = q.data;
  const inReview = d ? [...d.returns1065, ...d.returns1042, ...d.forms1099].filter((r) => r.status === "review").length : 0;
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Tax workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every Fund's returns and forms. Whoever prepares or submits a form can't approve it. Nothing is filed or delivered from here.</p>
      </header>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : d ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["1065s", d.returns1065.length], ["1042 packages", d.returns1042.length], ["1099s", d.forms1099.length], ["Waiting for review", inReview]].map(([l, n]) => (
              <div key={l as string} className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="font-heading text-2xl font-semibold">{n}</p></div>
            ))}
          </div>
          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">Prepared returns <span className="text-sm font-normal text-muted-foreground">({d.individualReturns.length})</span></h2>
            {d.individualReturns.length === 0 ? <p className="text-sm text-muted-foreground">No individual returns yet.</p> : (
              <ul className="divide-y rounded-md border text-sm">
                {d.individualReturns.map((r) => (
                  <li key={r.id} className="flex justify-between p-3"><span className="font-medium">{r.taxpayer} · {r.taxYear}</span><span className="text-muted-foreground">{statusLabel(r.status)}</span></li>
                ))}
              </ul>
            )}
          </section>
          <TaxFormTable mode="staff" title="Form 1065 partnership returns" rows={d.returns1065} empty="No 1065s yet." />
          <TaxFormTable mode="staff" title="Form 1042 and 1042-S withholding" rows={d.returns1042} empty="No 1042 packages yet." />
          <TaxFormTable mode="staff" title="Form 1099s" rows={d.forms1099} empty="No 1099s yet." />
        </>
      ) : null}
    </div>
  );
}
