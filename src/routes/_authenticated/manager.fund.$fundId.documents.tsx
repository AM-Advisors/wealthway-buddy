import { createFileRoute } from "@tanstack/react-router";
import { FundWorkspaceSection } from "@/components/fund-workspace-section";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/documents")({
  head: () => ({ meta: [
    { title: "Fund documents — Harmonious" }, { name: "description", content: "Manage offering documents, signed copies, diligence files, permissions, and tax records." },
    { property: "og:title", content: "Fund documents — Harmonious" }, { property: "og:description", content: "Manage offering, diligence, signed, and tax documents for one fund." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() { return <FundWorkspaceSection title="Documents" description="The complete document record for this fund." items={[
  { title: "Fund documents", description: "Upload and manage the documents investors review and sign.", to: "/manager/documents" },
  { title: "Document inbox", description: "Review investor uploads and signed copies filed back.", to: "/manager/inbox" },
  { title: "Diligence room", description: "Organize investor materials, NDA access, and file versions.", to: "/manager/diligence" },
  { title: "Document permissions", description: "Control which investors can access each diligence file.", to: "/manager/permissions" },
  { title: "Offering memo", description: "Maintain the fund story presented to prospective investors.", to: "/manager/memo" },
  { title: "Offering terms", description: "Manage the published terms and offering statement.", to: "/manager/offering-statement" },
  { title: "Tax documents", description: "Review the fund tax profile and approved tax records.", to: "/manager/tax" },
]}/>; }