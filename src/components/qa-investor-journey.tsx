/**
 * Fictional investor journey for /qa-sandbox. Renders the real investor portal
 * screens (portal frame, investment steps, accreditation, fund documents, home)
 * against the sandbox's in-memory fictional state. The controls strip stands in
 * for what the ID check, the fund manager and the bank would do; it is sandbox
 * chrome, never part of the investor's screens.
 */
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { InvestorPortalFrame } from "@/components/investor-portal-frame";
import { InvestorOnboardingJourney } from "@/components/investor-onboarding-journey";
import { DocumentsStep } from "@/components/steps/documents-step";
import { InvestorHome } from "@/components/investor-home";
import { Route as AccreditationRoute } from "@/routes/_authenticated/onboarding.accreditation";
import { createQaJourney, QA_JOURNEY_ID, QA_JOURNEY_INVESTOR, type QaJourney } from "@/lib/qa-sandbox/investor-journey-fixture";
import type { QaState } from "@/lib/qa-sandbox/mock-server";

function Controls({ state }: { state: QaState }) {
  const qc = useQueryClient();
  const j: QaJourney = (state.journey ??= createQaJourney());
  const act = (fn: (j: QaJourney) => void) => { fn(j); void qc.invalidateQueries(); };
  return (
    <div className="border-b bg-muted/40 px-4 py-2" data-qa-chrome="controls">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Fictional stand-ins:</span>
        <Button size="sm" variant="outline" onClick={() => act((x) => { x.identity = "valid"; })}>Finish fictional ID check</Button>
        <Button size="sm" variant="outline" onClick={() => act((x) => { x.approvedToFund = true; })}>Fund manager accepts (fictional)</Button>
        <Button size="sm" variant="outline" onClick={() => act((x) => { x.received = true; })}>Wire received (fictional)</Button>
        <Button size="sm" variant="ghost" onClick={() => act((x) => Object.assign(x, createQaJourney()))}>Start over</Button>
        <Button size="sm" variant="ghost" asChild><Link to="/">Back to the sandbox</Link></Button>
      </div>
    </div>
  );
}

function Portal({ state, children }: { state: QaState; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <>
      <Controls state={state} />
      <InvestorPortalFrame onSignOut={() => void navigate({ to: "/" })}>{children}</InvestorPortalFrame>
    </>
  );
}

export function QaJourneyPage({ state }: { state: QaState }) {
  return <Portal state={state}><div className="mx-auto max-w-4xl px-4 py-8"><InvestorOnboardingJourney onboardingId={QA_JOURNEY_ID} /></div></Portal>;
}

export function QaFundDocumentsPage({ state }: { state: QaState }) {
  const { offeringId } = useParams({ strict: false }) as { offeringId?: string };
  return <Portal state={state}>{offeringId ? <DocumentsStep offeringId={offeringId} /> : <DocumentsStep />}</Portal>;
}

export function QaAccreditationPage({ state }: { state: QaState }) {
  const Page = AccreditationRoute.options.component as React.ComponentType;
  return <Portal state={state}><Page /></Portal>;
}

export function QaInvestorHomePage({ state }: { state: QaState }) {
  return <Portal state={state}><InvestorHome /></Portal>;
}

/** Sandbox tab: where the fictional investor journey starts. */
export function QaInvestorJourneyLauncher() {
  return (
    <section aria-label="Investor journey" className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Walk the real investor screens as the fictional investor {QA_JOURNEY_INVESTOR}: About You, Verification, accreditation, fund documents, Fund and the investor home.
        The strip above the portal stands in for the ID check, the fund manager and the bank.
      </p>
      <Button asChild><Link to={"/investor/journey" as never}>Open the fictional investment</Link></Button>
    </section>
  );
}
