import { createFileRoute, Link } from "@tanstack/react-router";

import { OffboardingCase } from "@/components/offboarding-case";

export const Route = createFileRoute("/_authenticated/admin/offboarding/$caseId")({
  head: () => ({
    meta: [
      { title: "Termination and offboarding — Harmonious" },
      {
        name: "description",
        content:
          "Run a client wind-down: notice date, notice period, final amounts, data export delivery and retained records.",
      },
      { property: "og:title", content: "Termination and offboarding — Harmonious" },
      {
        property: "og:description",
        content: "Notice, settlement, data export and retained records for one client engagement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OffboardingCasePage,
  errorComponent: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">Termination</h1>
      <p className="mt-2 text-muted-foreground">
        This termination record could not be loaded. Go back to Pricing and agreements and open it
        again.
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">Termination not found</h1>
      <p className="mt-2 text-muted-foreground">This termination record no longer exists.</p>
    </main>
  ),
});

function OffboardingCasePage() {
  const { caseId } = Route.useParams();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <Link to="/admin/pricing" className="text-sm underline">
          Back to pricing and agreements
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Termination and offboarding</h1>
        <p className="text-sm text-muted-foreground">
          Harmonious records what was agreed, settled, delivered and retained. Nothing here is a
          legal, tax or regulatory determination.
        </p>
      </header>
      <OffboardingCase caseId={caseId} />
    </main>
  );
}
