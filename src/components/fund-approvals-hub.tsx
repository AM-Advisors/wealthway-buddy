import { useState } from "react";
import { FundApprovals } from "@/components/fund-approvals";
import { FundRequests } from "@/components/fund-requests";
import { ManagerFundReviews } from "@/components/manager-fund-reviews";
import { SideLetterNeeds } from "@/components/side-letter-needs";
import { AccreditationReviews } from "@/components/accreditation-reviews";
import { FundUpdatesPanel } from "@/components/investor-onboarding-extras";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** One approvals & requests area shared by fund managers and Harmonious. Layout only; each section's server functions decide authority. */
export function FundApprovalsHub({ fundId, staff, initial = "waiting" }: { fundId: string; staff: boolean; initial?: "waiting" | "approvals" | "requests" }) {
  const [tab, setTab] = useState<string>(initial);
  return <section className="space-y-4">
    <div><h2 className="text-xl">Approvals &amp; requests</h2>
      <p className="mt-1 text-sm text-muted-foreground">Everything open on this fund in one place, and who it's waiting on. Fund managers and Harmonious see the same list.</p></div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="waiting">Open items</TabsTrigger>
        <TabsTrigger value="approvals">Approvals</TabsTrigger>
        <TabsTrigger value="requests">Requests</TabsTrigger>
      </TabsList>
      <TabsContent value="waiting">{tab === "waiting" && <FundUpdatesPanel fundId={fundId} />}</TabsContent>
      <TabsContent value="approvals">{tab === "approvals" && <div className="space-y-6">
        <SideLetterNeeds offeringId={fundId} />
        <AccreditationReviews offeringId={fundId} />
        {!staff && <ManagerFundReviews fundId={fundId} />}
        <FundApprovals fundId={fundId} />
      </div>}</TabsContent>
      <TabsContent value="requests">{tab === "requests" && <FundRequests fundId={fundId} />}</TabsContent>
    </Tabs>
  </section>;
}
