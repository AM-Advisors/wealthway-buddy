import { createFileRoute } from "@tanstack/react-router";
import { CommercialWorkflow } from "@/components/commercial-workflow";
export const Route = createFileRoute("/_authenticated/ops/commercial")({
  head: () => ({ meta: [
    { title: "Client and revenue workflow | Harmonious" },
    { name: "description", content: "Connected team handoffs, invoices, recorded payments and commission projections with existing approvals." },
    { property: "og:title", content: "Client and revenue workflow | Harmonious" },
    { property: "og:description", content: "Marketing, Sales, Account Management and Accounting connected through authorized records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }), component: CommercialWorkflow,
});