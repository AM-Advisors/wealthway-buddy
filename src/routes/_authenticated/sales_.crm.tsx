import { createFileRoute } from "@tanstack/react-router";

import { CrmWorkspace } from "@/components/crm-workspace";

export const Route = createFileRoute("/_authenticated/sales_/crm")({
  head: () => ({
    meta: [
      { title: "Contacts, deals & campaigns - Harmonious Sales" },
      { name: "description", content: "Harmonious Sales contacts, client deal pipeline and approved email campaigns." },
      { property: "og:title", content: "Contacts, deals & campaigns - Harmonious Sales" },
      { property: "og:description", content: "Track prospective clients, deals and approved campaigns in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <CrmWorkspace scope="harmonious" title="Contacts, deals & campaigns" description="Your prospective clients and deals. Super Administrators, and people they authorize, see everyone's." />
  ),
});
