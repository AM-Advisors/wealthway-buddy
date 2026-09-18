import { createFileRoute } from "@tanstack/react-router";

import { ManagerDistributions } from "@/components/manager-distributions";

export const Route = createFileRoute("/_authenticated/manager/distributions")({
  head: () => ({
    meta: [
      { title: "Fund distributions | Harmonious" },
      {
        name: "description",
        content:
          "Review and approve distributions for the funds you manage, with investor totals, withholding and payment progress.",
      },
      { property: "og:title", content: "Fund distributions | Harmonious" },
      {
        property: "og:description",
        content: "Manager approval of fund distributions, with Harmonious giving the final approval.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerDistributionsPage,
});

function ManagerDistributionsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Fund distributions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Approve what your fund pays out. Harmonious verifies each investor's destination and gives
        the final approval before any money leaves.
      </p>
      <div className="mt-6">
        <ManagerDistributions />
      </div>
    </main>
  );
}
