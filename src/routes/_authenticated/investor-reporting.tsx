import { createFileRoute } from "@tanstack/react-router";

import { InvestorReportingCenter } from "@/components/investor-reporting-center";

export const Route = createFileRoute("/_authenticated/investor-reporting")({
  head: () => ({
    meta: [
      { title: "Your reports — Harmonious" },
      {
        name: "description",
        content:
          "Your reporting packages, capital statements and documents, kept separate for each investment profile.",
      },
      { property: "og:title", content: "Your reports — Harmonious" },
      {
        property: "og:description",
        content: "Reporting periods, capital activity and documents for each of your investments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestorReportingCenter,
});
