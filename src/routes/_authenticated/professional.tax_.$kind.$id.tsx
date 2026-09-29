import { createFileRoute, Link } from "@tanstack/react-router";

import { TaxFormReview, type ProTaxKind } from "@/components/professional-tax";
import { WorkspaceSection } from "@/components/professional-workspace";

function TaxForm() {
  const { kind, id } = Route.useParams();
  return (
    <WorkspaceSection title="Prepare and review" description="Every step is recorded against your delegation.">
      <Link to="/professional/tax" className="text-sm text-muted-foreground hover:underline">← All tax work</Link>
      <div className="mt-4">
        <TaxFormReview kind={kind as ProTaxKind} id={id} />
      </div>
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/tax_/$kind/$id")({
  head: () => ({
    meta: [
      { title: "Prepare and review tax form — Harmonious" },
      { name: "description", content: "Prepare, submit and review a delegated Fund tax return or form." },
      { property: "og:title", content: "Prepare and review tax form — Harmonious" },
      { property: "og:description", content: "Delegated preparation and second-person review of Fund tax forms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaxForm,
});
