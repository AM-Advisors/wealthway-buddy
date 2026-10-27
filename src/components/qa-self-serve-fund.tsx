import { useState } from "react";
import { SelfServeFundPage, type SelfServeArea } from "./self-serve-fund-page";
import { CreateInvestor } from "./create-investor";
import { QaFundDocuments } from "./qa-fund-documents";
import { FundOnboardingLinkCard } from "./fund-onboarding-link";
import { QA_FUND_ID } from "@/lib/qa-sandbox/fictional-data";

export function QaSelfServeFund() {
  const [area, setArea] = useState<SelfServeArea>("setup");
  return <SelfServeFundPage area={area} onAreaChange={setArea} sections={{
    setup: () => <section className="space-y-3"><h2 className="text-xl">Fablewood Ventures I LP</h2><dl className="grid gap-4 border-y py-4 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Service level</dt><dd>Self Serve</dd></div><div><dt className="text-xs text-muted-foreground">Manager</dt><dd>Jordan Vale</dd></div><div><dt className="text-xs text-muted-foreground">Formation</dt><dd>Delaware</dd></div></dl><p className="text-sm text-muted-foreground">Fictional setup summary. Saved fund details are not tested in this sandbox.</p></section>,
    investors: () => <CreateInvestor fundId={QA_FUND_ID} isStaff={false} />,
    documents: () => <QaFundDocuments />,
    link: () => <FundOnboardingLinkCard fundId={QA_FUND_ID} />,
    team: () => <section><h2 className="text-xl">Fund team</h2><p className="mt-3 text-sm">Jordan Vale · Fund manager</p></section>,
    overview: () => <section><h2 className="text-xl">Activity & reporting</h2><p className="mt-3 text-sm text-muted-foreground">No financial reports released.</p></section>,
  }} />;
}