import { useState } from "react";
import { SelfServeFundPage, type SelfServeArea } from "./self-serve-fund-page";
import { CreateInvestor } from "./create-investor";
import { QaFundDocuments } from "./qa-fund-documents";
import { FundOnboardingLinkCard } from "./fund-onboarding-link";
import { QA_FUND_ID } from "@/lib/qa-sandbox/fictional-data";
import { FundManagerNextAction } from "@/components/fund-manager-next-action";
import { UploadForInvestor } from "@/components/upload-for-investor";

export function QaSelfServeFund() {
  const [area, setArea] = useState<SelfServeArea>("setup");
  const [added, setAdded] = useState(false);
  return <SelfServeFundPage area={area} onAreaChange={setArea} sections={{
    setup: () => <section className="space-y-3"><h2 className="text-xl">Fablewood Ventures I LP</h2><FundManagerNextAction managerName="Jordan Vale" today="2026-10-29" items={[{ id: "fictional-doc", title: "Review fund documents", area: "documents", due: "2026-10-28" }]} onNavigate={a => setArea(a === "documents" ? "documents" : a === "investors" || a === "banking" ? "investors" : a === "accounting" ? "overview" : "setup")} /><p className="text-sm text-muted-foreground">Fictional setup summary. Saved fund details are not tested in this sandbox.</p></section>,
    investors: () => <><CreateInvestor fundId={QA_FUND_ID} isStaff={false} onDone={() => setAdded(true)} />{added && <p className="mt-3 text-sm">Fictional investor added and invitation recorded.</p>}</>,
    documents: () => <><UploadForInvestor onboardingId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" /><QaFundDocuments /></>,
    link: () => <FundOnboardingLinkCard fundId={QA_FUND_ID} />,
    team: () => <section><h2 className="text-xl">Fund team</h2><p className="mt-3 text-sm">Jordan Vale · Fund manager</p></section>,
    overview: () => <section><h2 className="text-xl">Activity & reporting</h2><p className="mt-3 text-sm text-muted-foreground">No financial reports released.</p></section>,
  }} />;
}