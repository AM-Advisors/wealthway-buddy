import { useState } from "react";
import { FundApprovals } from "@/components/fund-approvals";
import { FundRequests } from "@/components/fund-requests";
import { ManagerFundReviews } from "@/components/manager-fund-reviews";
import { SideLetterNeeds } from "@/components/side-letter-needs";
import { AccreditationReviews } from "@/components/accreditation-reviews";
import { FundUpdatesPanel } from "@/components/investor-onboarding-extras";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FundSetupReviews } from "@/components/fund-setup-reviews";

/** One approvals & requests area shared by fund managers and Harmonious. Layout only; each section's server functions decide authority. */
export function FundApprovalsHub({ fundId, staff, initial = "waiting" }: { fundId: string; staff: boolean; initial?: "waiting" | "approvals" | "requests" }) {
  const [tab, setTab] = useState<string>(staff && initial === "approvals" ? "setup" : initial);
  return <section className="space-y-4">
    <div><h2 className="text-xl">Approvals &amp; requests</h2>
      </div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
        {staff && <TabsTrigger value="setup">Fund setup approvals</TabsTrigger>}
        <TabsTrigger value="waiting">Open items</TabsTrigger>
        <TabsTrigger value="approvals">{staff ? "Other approvals" : "Approvals"}</TabsTrigger>
        <TabsTrigger value="requests">Requests</TabsTrigger>
      </TabsList>
      {staff && <TabsContent value="setup">{tab === "setup" && <FundSetupReviews fundId={fundId} />}</TabsContent>}
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
