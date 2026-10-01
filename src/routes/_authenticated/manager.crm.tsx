import { createFileRoute } from "@tanstack/react-router";

import { CrmWorkspace } from "@/components/crm-workspace";

export const Route = createFileRoute("/_authenticated/manager/crm")({
  head: () => ({
    meta: [
      { title: "Contacts & deals — Harmonious fund manager" },
      { name: "description", content: "Prospective investors, deal pipeline and approved email campaigns for the Funds you manage." },
      { property: "og:title", content: "Contacts & deals — Harmonious" },
      { property: "og:description", content: "Your Funds' prospective investors, deals and campaigns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <CrmWorkspace scope="fund" title="Contacts & deals" description="Prospective investors for the Funds you manage. Only your Funds' team can see these." />
  ),
});
