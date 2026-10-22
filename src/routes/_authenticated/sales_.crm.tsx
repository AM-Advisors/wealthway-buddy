import { createFileRoute } from "@tanstack/react-router";

import { CrmWorkspace } from "@/components/crm-workspace";
import { GmailConnectCard } from "@/components/gmail-connect";

export const Route = createFileRoute("/_authenticated/sales_/crm")({
  head: () => ({
    meta: [
      { title: "Companies & contacts - Harmonious CRM" },
      { name: "description", content: "Harmonious CRM connects prospect companies, editable contact details, deal activity and recorded emails." },
      { property: "og:title", content: "Companies & contacts - Harmonious CRM" },
      { property: "og:description", content: "Company-connected contacts, deal history, activity and recorded emails in Harmonious Sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-4">
      <div className="mx-auto max-w-6xl px-4 pt-4"><GmailConnectCard /></div>
      <CrmWorkspace scope="harmonious" title="Companies & contacts" description="Prospects and client relationships" />
    </div>
  ),
});
