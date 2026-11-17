import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CustomServicesWorkspace } from "@/components/sales/custom-services-workspace";

export const Route = createFileRoute("/_authenticated/sales_/custom-services")({
  validateSearch: (s) => z.object({ service: z.string().uuid().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Custom services | Harmonious Sales" },
      { name: "description", content: "Sales write custom services for quotes; the review team decides whether each needs design or build, belongs in a product, or isn't tech related." },
      { property: "og:title", content: "Custom services | Harmonious Sales" },
      { property: "og:description", content: "Shared custom services for quotes, with product review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomServicesPage,
});

function CustomServicesPage() {
  const { service } = Route.useSearch();
  return <main className="mx-auto max-w-6xl px-4 py-10"><CustomServicesWorkspace service={service} /></main>;
}
