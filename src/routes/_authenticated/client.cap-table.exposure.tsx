import { createFileRoute } from "@tanstack/react-router";

import { ExposureView } from "@/components/captable/exposure-view";

export const Route = createFileRoute("/_authenticated/client/cap-table/exposure")({
  head: () => ({
    meta: [
      { title: "SPV exposure and verification | Harmonious CapTable" },
      {
        name: "description",
        content:
          "Funds, SPVs and advisers declare the positions they hold, and the company verifies each claim against its share register.",
      },
      { property: "og:title", content: "SPV exposure and verification" },
      {
        property: "og:description",
        content: "Review, verify or dispute claimed positions against your official cap table record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExposureView,
});
