import { createFileRoute } from "@tanstack/react-router";

import { FundTaxProfile } from "@/components/fund-tax-profile";
import { ManagerTaxRecords } from "@/components/tax-phase4";

export const Route = createFileRoute("/_authenticated/manager/tax")({
  head: () => ({
    meta: [
      { title: "Fund Tax Profile — Harmonious" },
      {
        name: "description",
        content:
          "Store and review your fund's W-9, W-8 and K-1 paperwork privately, visible only to approved fund managers.",
      },
      { property: "og:title", content: "Fund Tax Profile — Harmonious" },
      {
        property: "og:description",
        content: "Private W-9, W-8 and K-1 records for the funds you manage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <div className="space-y-6"><FundTaxProfile /><div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6"><ManagerTaxRecords /></div></div>,
});
