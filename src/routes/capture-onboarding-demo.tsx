// TEMPORARY: renders the real investor onboarding screens with demo data for packet/video capture. Delete after use.
import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { InvestorOnboardingJourney } from "@/components/investor-onboarding-journey";

const ID = "00000000-0000-4000-8000-000000000001";
type Stage = "about" | "verify" | "sign" | "fund";

function detail(stage: Stage) {
  const order: Stage[] = ["about", "verify", "sign", "fund"];
  const at = order.indexOf(stage);
  const msg: Record<Stage, [string, string, string]> = {
    about: ["Tell us who is investing and how much", "Done", ""],
    verify: ["Verify your identity and eligibility", "Verified", ""],
    sign: ["Review and sign your documents", "Signed", ""],
    fund: ["Send your wire using the secure instructions", "Funded", ""],
  };
  const labels: Record<Stage, string> = { about: "About You", verify: "Verification", sign: "Sign", fund: "Fund" };
  return {
    offering: { id: "00000000-0000-4000-8000-0000000000aa", name: "Test Dev Management LLC" },
    profileLabel: at > 0 ? "John Smith" : null,
    requestedAmountCents: at > 0 ? 10000000 : null,
    acceptedAmountCents: at > 2 ? 10000000 : null,
    investmentProfileId: at > 0 ? "p1" : null,
    verification: at > 1 ? "complete" : "not_started",
    approvedToFund: at === 3,
    fundingStatus: "awaiting",
    documents: [
      { id: "d1", title: "Operating Agreement", requiresSignature: true, signed: false },
      { id: "d2", title: "Subscription Agreement", requiresSignature: true, signed: false },
      { id: "d3", title: "Private Placement Memorandum", requiresAcknowledgment: true, acknowledged: false },
    ],
    documentTemplateVersion: "v1",
    questionnaire: { questions: [
      { key: "accredited", label: "Are you an accredited investor?", type: "yes_no", required: true },
      { key: "experience", label: "Years of investing experience", type: "number", required: true },
    ] },
    questionnaireResponses: { accredited: "Yes", experience: "12" },
    requirements: [
      { key: "subscription_questionnaire", state: "valid" },
      { key: "beneficial_owners", state: "not_applicable" },
    ],
    journey: order.map((k, i) => ({
      key: k,
      label: labels[k],
      state: i < at ? "complete" : i === at ? "action_required" : "locked",
      message: i < at ? msg[k][1] : i === at ? msg[k][0] : "Opens after the step before",
    })),
  };
}

function Page() {
  const [stage] = useState<Stage>(() => (typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("step") as Stage) : null) ?? "about");
  const [qc] = useState(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    c.setQueryData(["onboarding", ID], detail(stage));
    c.setQueryData(["onboarding-profiles"], { profiles: [] });
    c.setQueryData(["onboarding-uploads", ID], []);
    c.setQueryData(["fee-status", ID], { terms: { id: "t", managementFeePct: 2, basis: "Committed capital", carryPct: 20, hurdlePct: 8 }, accepted: { name: "John Smith", at: "2026-10-12" }, sideLetters: [] });
    c.setQueryData(["onboarding-funding", ID], { unlocked: true, instructions: { bankName: "Demo Bank, N.A.", details: { account_name: "Test Dev Management LLC", routing_number: "000000000", account_number: "••••1234" }, reference: "TDM-JSMITH", expectedAmountCents: 10000000, warning: "Always confirm wire instructions by phone with Harmonious before sending. We will never change them by email." } });
    c.setQueryData(["onboarding-funding-ledger", ID], { expectedCents: 10000000, receivedCents: 0, remainingCents: 10000000, entries: [] });
    return c;
  });
  return (
    <QueryClientProvider client={qc}>
      <div className="min-h-screen bg-background">
        <header className="border-b px-6 py-4"><span className="text-xl font-semibold text-primary">Harmonious</span><span className="ml-3 text-sm text-muted-foreground">Investor Portal</span></header>
        <main className="mx-auto max-w-4xl p-6"><InvestorOnboardingJourney onboardingId={ID} requestedStep={stage} /></main>
      </div>
    </QueryClientProvider>
  );
}

export const Route = createFileRoute("/capture-onboarding-demo")({ ssr: false, component: Page });
