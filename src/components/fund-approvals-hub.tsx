import { FundApprovals } from "@/components/fund-approvals";
import { FundRequests } from "@/components/fund-requests";
import { ManagerFundReviews } from "@/components/manager-fund-reviews";
import { SideLetterNeeds } from "@/components/side-letter-needs";
import { AccreditationReviews } from "@/components/accreditation-reviews";
import { FundUpdatesPanel } from "@/components/investor-onboarding-extras";
import { FundSetupReviews } from "@/components/fund-setup-reviews";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-3"><h3 className="text-base font-medium text-muted-foreground">{title}</h3>{children}</div>;
}

/**
 * Approvals or Requests body for a fund. The surrounding page/tab already names the view,
 * so this renders no heading or inner tab row. Layout only; each section's server functions decide authority.
 */
export function FundApprovalsHub({ fundId, staff, initial = "approvals" }: { fundId: string; staff: boolean; initial?: "waiting" | "approvals" | "requests" }) {
  if (initial === "approvals") {
    return <section className="space-y-8">
      {staff && <Section title="Fund setup"><FundSetupReviews fundId={fundId} /></Section>}
      <Section title="Investors">
        <div className="space-y-6">
          <SideLetterNeeds offeringId={fundId} />
          <AccreditationReviews offeringId={fundId} />
          {!staff && <ManagerFundReviews fundId={fundId} />}
          <FundApprovals fundId={fundId} />
        </div>
      </Section>
    </section>;
  }
  return <section className="space-y-8">
    <Section title="Open requests"><FundRequests fundId={fundId} /></Section>
    <Section title="Fund updates"><FundUpdatesPanel fundId={fundId} /></Section>
  </section>;
}
