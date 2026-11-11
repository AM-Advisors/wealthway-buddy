/**
 * Fictional QA sandbox. Renders the real investor form and wire sender
 * components against an in-memory fictional backend (see
 * src/lib/qa-sandbox/mock-server.ts) so flows can be clicked through without
 * touching real records, emails or money. Every server call is intercepted;
 * anything not explicitly modeled is blocked.
 */
import { createFileRoute, createRootRoute, createRoute, createRouter, RouterProvider, Outlet, createMemoryHistory, useParams, Link, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CreateInvestor } from "@/components/create-investor";
import { WireFromBankForm } from "@/components/wire-from-bank-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createQaState, installQaFetchMock, type QaRole, type QaState } from "@/lib/qa-sandbox/mock-server";
import { QA_FUND_ID, QA_FUND_NAME, QA_MANAGER_NAME } from "@/lib/qa-sandbox/fictional-data";
import { QaBillingReadback } from "@/components/qa-billing-readback";
import { InvestorOnboardingGuide } from "@/components/investor-onboarding-guide";
import { QaCommercialWorkflow } from "@/components/qa-commercial-workflow";
import { QaFundDocuments } from "@/components/qa-fund-documents";
import { QaSelfServeFund } from "@/components/qa-self-serve-fund";
import { FinancialBackgroundPanel, TaxSignPanel } from "@/components/onboard-compliance-panels";
import { WealthPortfolio } from "@/components/wealth-portfolio";
import { FoundationWorkspace } from "@/components/foundation-workspace";
import { FoundationConfigurator } from "@/components/sales/foundation-configurator";
import { QA_FOUNDATION_CLIENT } from "@/lib/qa-sandbox/foundation-fixture";
import { SecurityGate } from "@/components/security-gate";
import { createQaMfaAuth, QA_MFA_CODE, type QaMfaScenario } from "@/lib/qa-sandbox/mfa-fixture";
import { Suspense } from "react";
import { QaAccreditationPage, QaFundDocumentsPage, QaInvestorHomePage, QaInvestorJourneyLauncher, QaJourneyPage } from "@/components/qa-investor-journey";

export const Route = createFileRoute("/qa-sandbox")({
  head: () => ({
    meta: [
      { title: "Fictional QA sandbox | Harmonious" },
      { name: "description", content: "Isolated click-through sandbox with fictional funds, investors and accounts. No real records, emails or money." },
      { property: "og:title", content: "Fictional QA sandbox | Harmonious" },
      { property: "og:description", content: "Fictional investor and billing walkthroughs, without real records, emails or money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: QaSandboxPage,
});

const QaContext = createContext<{ state: QaState; role: QaRole; setRole: (r: QaRole) => void } | null>(null);
const useQa = () => {
  const ctx = useContext(QaContext);
  if (!ctx) throw new Error("QA context missing");
  return ctx;
};

function QaSandboxPage() {
  const stateRef = useRef<QaState | null>(null);
  if (!stateRef.current) stateRef.current = createQaState("staff");
  const [role, setRole] = useState<QaRole>("staff");
  const [ready, setReady] = useState(false);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } }));

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const restore = installQaFetchMock(state);
    setReady(true);
    return restore;
  }, []);
  useEffect(() => {
    if (stateRef.current) stateRef.current.role = role;
  }, [role]);

  const router = useMemo(() => {
    const root = createRootRoute({
      component: () => (
        <QaContext.Provider value={{ state: stateRef.current ?? createQaState("staff"), role, setRole }}>
          <SandboxShell>
            <Outlet />
          </SandboxShell>
        </QaContext.Provider>
      ),
    });
    const index = createRoute({ getParentRoute: () => root, path: "/", component: SandboxHome });
    const record = createRoute({ getParentRoute: () => root, path: "/manager/fund/$fundId/investor/$onboardingId", component: FictionalRecord });
    const opsRecord = createRoute({ getParentRoute: () => root, path: "/ops/fund/$fundId/investor/$onboardingId", component: FictionalRecord });
    // Fictional investor journey: the real investor screens, answered by the sandbox state.
    const st = () => stateRef.current ?? createQaState("staff");
    const journey = createRoute({ getParentRoute: () => root, path: "/investor/journey", component: () => <QaJourneyPage state={st()} /> });
    const investorHome = createRoute({ getParentRoute: () => root, path: "/investor", component: () => <QaInvestorHomePage state={st()} /> });
    const fundDocs = createRoute({ getParentRoute: () => root, path: "/fund/$offeringId/documents", component: () => <QaFundDocumentsPage state={st()} /> });
    const accreditation = createRoute({ getParentRoute: () => root, path: "/onboarding/accreditation", component: () => <QaAccreditationPage state={st()} /> });
    const toJourney = (path: string) => createRoute({ getParentRoute: () => root, path, beforeLoad: () => { throw redirect({ to: "/investor/journey" as never }); } });
    const toHome = createRoute({ getParentRoute: () => root, path: "/home", beforeLoad: () => { throw redirect({ to: "/investor" }); } });
    return createRouter({
      routeTree: root.addChildren([index, record, opsRecord, journey, investorHome, fundDocs, accreditation, toJourney("/fund/$offeringId/funding"), toJourney("/onboarding/documents"), toHome]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    // Role is read through context at render time; the router itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const INVESTOR_PATHS = /^\/(investor|fund|onboarding)(\/|$)/;

function SandboxShell({ children }: { children: React.ReactNode }) {
  const { state, role, setRole } = useQa();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const investorView = INVESTOR_PATHS.test(pathname);
  // Plain links inside real screens stay inside the sandbox instead of leaving for the real app.
  const keepInside = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    const href = a?.getAttribute("href") ?? "";
    if (!a || !href.startsWith("/") || href.startsWith("//")) return;
    e.preventDefault();
    void router.navigate({ to: href.split("?")[0] as never });
  };
  // Update the mock state synchronously so remounted queries see the new role.
  const pick = (r: QaRole) => { state.role = r; setRole(r); void queryClient.invalidateQueries(); };
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-muted/60 px-4 py-3" data-qa-chrome="banner">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Fictional QA sandbox</Badge>
            <p className="text-xs text-muted-foreground">Invented funds, people and banks only. Nothing here saves, emails or moves money.</p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="View as">
            <span className="mr-1 text-xs text-muted-foreground">View as</span>
            <Button size="sm" variant={role === "staff" ? "default" : "outline"} onClick={() => pick("staff")}>Harmonious staff</Button>
            <Button size="sm" variant={role === "manager" ? "default" : "outline"} onClick={() => pick("manager")}>Fund manager</Button>
          </div>
        </div>
      </div>
      {investorView ? <div onClickCapture={keepInside}>{children}</div> : <div className="mx-auto max-w-3xl space-y-4 px-4 py-6" onClickCapture={keepInside}>{children}</div>}
    </div>
  );
}

function SandboxHome() {
  const { state, role } = useQa();
  const [tab, setTab] = useState<"investor" | "wire" | "billing" | "guide" | "commercial" | "documents" | "fund" | "tax" | "questionnaire" | "portfolio" | "signin" | "journey" | "foundation">("investor");
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{QA_FUND_NAME}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fictional fund managed by {QA_MANAGER_NAME}. Existing fictional investors: John Smith, Robin McAllister and Sam Okafor.
            Try searching an existing name or email, adding someone new, or switching between staff and fund manager views.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sandbox area">
            <Button size="sm" variant={tab === "investor" ? "default" : "outline"} onClick={() => setTab("investor")}>Add investor</Button>
            <Button size="sm" variant={tab === "wire" ? "default" : "outline"} onClick={() => setTab("wire")}>Wire sender</Button>
            <Button size="sm" variant={tab === "billing" ? "default" : "outline"} onClick={() => setTab("billing")}>Client billing</Button>
            <Button size="sm" variant={tab === "commercial" ? "default" : "outline"} onClick={() => setTab("commercial")}>Team workflow</Button>
            <Button size="sm" variant={tab === "documents" ? "default" : "outline"} onClick={() => setTab("documents")}>Fund documents</Button>
            <Button size="sm" variant={tab === "fund" ? "default" : "outline"} onClick={() => setTab("fund")}>Self Serve fund</Button>
            <Button size="sm" variant={tab === "guide" ? "default" : "outline"} onClick={() => setTab("guide")}>Investor walkthrough</Button>
            <Button size="sm" variant={tab === "journey" ? "default" : "outline"} onClick={() => setTab("journey")}>Investor journey</Button>
            <Button size="sm" variant={tab === "tax" ? "default" : "outline"} onClick={() => setTab("tax")}>Investor tax review</Button>
            <Button size="sm" variant={tab === "questionnaire" ? "default" : "outline"} onClick={() => setTab("questionnaire")}>Investor questionnaire</Button>
            <Button size="sm" variant={tab === "portfolio" ? "default" : "outline"} onClick={() => setTab("portfolio")}>Consolidated portfolio</Button>
            <Button size="sm" variant={tab === "signin" ? "default" : "outline"} onClick={() => setTab("signin")}>Sign-in check</Button>
            <Button size="sm" variant={tab === "foundation" ? "default" : "outline"} onClick={() => setTab("foundation")}>Foundation</Button>
            <Button size="sm" variant="ghost" onClick={() => setFormKey((k) => k + 1)}>Reset form</Button>
          </div>
          {tab === "investor" ? (
            <CreateInvestor key={formKey} fundId={QA_FUND_ID} isStaff={role === "staff"} />
          ) : tab === "foundation" ? <QaFoundationArea /> : tab === "journey" ? <QaInvestorJourneyLauncher /> : tab === "signin" ? <QaSignInCheck key={formKey} /> : tab === "portfolio" ? <section aria-label="Consolidated portfolio"><p className="mb-3 text-sm text-muted-foreground">Fictional owner John Smith: a family trust that owns 40% of a holding company, one platform fund and one outside venture fund.</p><Suspense fallback={<p>Loading…</p>}><WealthPortfolio /></Suspense></section> : tab === "questionnaire" ? <section aria-label="Investor questionnaire"><h2 className="text-lg font-semibold">Investor questionnaire</h2><FinancialBackgroundPanel onboardingId="qa-financial-investment" done={() => {}} /></section> : tab === "tax" ? <TaxSignPanel onboardingId="qa-tax-investment" done={() => {}} /> : tab === "fund" ? <QaSelfServeFund key={formKey} /> : tab === "documents" ? <QaFundDocuments key={`${formKey}-${role}`} /> : tab === "commercial" ? <QaCommercialWorkflow key={formKey} /> : tab === "billing" ? <QaBillingReadback key={formKey} /> : tab === "guide" ? <InvestorOnboardingGuide /> : (
            <Card>
              <CardHeader><CardTitle className="text-base">Wire instructions</CardTitle></CardHeader>
              <CardContent><WireFromBankForm key={`${formKey}-${role}`} fundId={QA_FUND_ID} /></CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
      {state.createdInvestors.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Added in this sandbox session</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {state.createdInvestors.map((i) => (
                <li key={i.onboardingId}>
                  <span className="font-medium">{i.name}</span>
                  <span className="text-muted-foreground"> · {i.email || "no email"} · ${(i.amountCents / 100).toLocaleString()} · fictional invitation marked sent</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function FictionalRecord() {
  const { onboardingId } = useParams({ strict: false }) as { onboardingId?: string };
  const { state } = useQa();
  const created = state.createdInvestors.find((i) => i.onboardingId === onboardingId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Investor record (fictional)</CardTitle>
        <p className="text-sm text-muted-foreground">
          This is where the real investor record would open. In the sandbox it is a placeholder so the flow can be clicked through end to end.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {created ? (
          <p><span className="font-medium">{created.name}</span> <span className="text-muted-foreground">· {created.email || "no email"} · ${(created.amountCents / 100).toLocaleString()}</span></p>
        ) : (
          <p className="text-muted-foreground">Record {onboardingId}</p>
        )}
        <Link to="/" className="inline-flex items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Back to the sandbox</Link>
      </CardContent>
    </Card>
  );
}

const QA_MFA_SCENARIOS: { id: QaMfaScenario; label: string }[] = [
  { id: "enrolled_stale", label: "Enrolled, out-of-date session" },
  { id: "unenrolled", label: "Not enrolled yet" },
  { id: "lookup_outage", label: "Check fails, then recovers" },
  { id: "lookup_down", label: "Check keeps failing" },
];

/** Real SecurityGate driven by a fictional in-memory sign-in service; never touches the real backend. */
function QaSignInCheck() {
  const [scenario, setScenario] = useState<QaMfaScenario>("enrolled_stale");
  const [run, setRun] = useState(0);
  const qa = useMemo(() => createQaMfaAuth(scenario), [scenario, run]);
  return (
    <section aria-label="Sign-in check" className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Fictional sign-in service. The fictional authenticator code is {QA_MFA_CODE}; any other code is rejected.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sign-in scenario">
        {QA_MFA_SCENARIOS.map((x) => (
          <Button key={x.id} size="sm" variant={scenario === x.id ? "default" : "outline"} onClick={() => { setScenario(x.id); setRun((r) => r + 1); }}>
            {x.label}
          </Button>
        ))}
      </div>
      {scenario === "lookup_outage" && (
        <Button size="sm" variant="ghost" onClick={qa.restore}>End fictional outage</Button>
      )}
      <div className="rounded-md border">
        <SecurityGate key={`${scenario}-${run}`} auth={qa.auth} onSignOut={() => setRun((r) => r + 1)}>
          <p className="p-6 font-medium" data-testid="qa-requested-page">Requested page opened</p>
        </SecurityGate>
      </div>
    </section>
  );
}

/** Fictional Foundation Administration: the Ops workspace plus the quote configurator, answered by the in-memory fixture. */
function QaFoundationArea() {
  const [added, setAdded] = useState<{ label: string; unitCents: number; billing: string }[]>([]);
  return (
    <section aria-label="Foundation Administration" className="space-y-6">
      <p className="text-sm text-muted-foreground">Fictional client with Fablewood Community Foundation. Nothing here reaches the real backend, and nothing is sent, contracted or billed.</p>
      <FoundationWorkspace clientId={QA_FOUNDATION_CLIENT} />
      <FoundationConfigurator clientId={QA_FOUNDATION_CLIENT} rateCents={() => null} onAdd={(l) => setAdded((a) => [...a, { label: l.label, unitCents: l.unitCents, billing: l.billingFrequency ?? "one_time" }])} onClose={() => undefined} />
      {added.length > 0 && <ul aria-label="Fictional quote lines" className="space-y-1 text-sm">{added.map((l, i) => <li key={i}>{l.label} · ${(l.unitCents / 100).toLocaleString()} · {l.billing}</li>)}</ul>}
    </section>
  );
}
