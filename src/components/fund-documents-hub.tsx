import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsTab } from "@/components/fund-tabs/documents-tab";
import { SendFundDocuments } from "@/components/send-fund-documents";
import { InvestorDocumentReview } from "@/components/investor-document-review";
import { FundWorkspaceSection } from "@/components/fund-workspace-section";

/** One Documents layout shared by fund managers and Harmonious. Layout only; each section's server functions decide authority (generation stays staff-only). */
export function FundDocumentsHub({ fundId, staff }: { fundId: string; staff: boolean }) {
  const [tab, setTab] = useState("files");
  return <section className="space-y-4">
    <div><h2 className="text-xl">Documents</h2>
      <p className="mt-1 text-sm text-muted-foreground">Fund files, what's out to investors, and their uploads in one place. Fund managers and Harmonious see the same layout.</p></div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="files">Fund files</TabsTrigger>
        <TabsTrigger value="send">Send to investors</TabsTrigger>
        <TabsTrigger value="review">Investor uploads</TabsTrigger>
        {!staff && <TabsTrigger value="more">More</TabsTrigger>}
      </TabsList>
      <TabsContent value="files">{tab === "files" && <DocumentsTab fundId={fundId} />}</TabsContent>
      <TabsContent value="send">{tab === "send" && <SendFundDocuments offeringId={fundId} />}</TabsContent>
      <TabsContent value="review">{tab === "review" && <InvestorDocumentReview offeringId={fundId} />}</TabsContent>
      {!staff && <TabsContent value="more">{tab === "more" && <FundWorkspaceSection title="More document tools" description="Other document areas for your funds." items={[
        { title: "Document inbox", description: "Review investor uploads and signed copies filed back.", to: "/manager/inbox" },
        { title: "Diligence room", description: "Organize investor materials, NDA access, and file versions.", to: "/manager/diligence" },
        { title: "Document permissions", description: "Control which investors can access each diligence file.", to: "/manager/permissions" },
        { title: "Offering memo", description: "Maintain the fund story presented to prospective investors.", to: "/manager/memo" },
        { title: "Offering terms", description: "Manage the published terms and offering statement.", to: "/manager/offering-statement" },
        { title: "Tax documents", description: "Review the fund tax profile and approved tax records.", to: "/manager/tax" },
      ]} />}</TabsContent>}
    </Tabs>
  </section>;
}
