import { createFileRoute, Link } from "@tanstack/react-router";

import { TaxFormReview, type ProTaxKind } from "@/components/professional-tax";

export const Route = createFileRoute("/_authenticated/ops/tax_/$kind/$id")({
  head: () => ({
    meta: [
      { title: "Prepare and review tax form - Harmonious Operations" },
      { name: "description", content: "Prepare, submit and second-person review of a Fund tax return or form." },
      { property: "og:title", content: "Prepare and review tax form - Harmonious Operations" },
      { property: "og:description", content: "Maker-checker review of Fund tax forms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { kind, id } = Route.useParams();
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <Link to="/ops/tax" className="text-sm text-muted-foreground hover:underline">← Tax workspace</Link>
      <h1 className="font-heading text-2xl font-semibold">Prepare and review</h1>
      <TaxFormReview mode="staff" kind={kind as ProTaxKind} id={id} />
    </div>
  );
}
