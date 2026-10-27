/**
 * Fictional QA sandbox. Renders the real investor form and wire sender
 * components against an in-memory fictional backend (see
 * src/lib/qa-sandbox/mock-server.ts) so flows can be clicked through without
 * touching real records, emails or money. Every server call is intercepted;
 * anything not explicitly modeled is blocked.
 */
import { createFileRoute, createRootRoute, createRoute, createRouter, RouterProvider, Outlet, createMemoryHistory, useParams, Link } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    return createRouter({
      routeTree: root.addChildren([index, record, opsRecord]),
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

function SandboxShell({ children }: { children: React.ReactNode }) {
  const { state, role, setRole } = useQa();
  // Update the mock state synchronously so remounted queries see the new role.
  const pick = (r: QaRole) => { state.role = r; setRole(r); };
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-muted/60 px-4 py-3">
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
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">{children}</div>
    </div>
  );
}

function SandboxHome() {
  const { state, role } = useQa();
  const [tab, setTab] = useState<"investor" | "wire" | "billing" | "guide" | "commercial" | "documents">("investor");
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{QA_FUND_NAME}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fictional fund managed by {QA_MANAGER_NAME}. Existing fictional investors: Casey Alden, Robin McAllister and Sam Okafor.
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
            <Button size="sm" variant={tab === "guide" ? "default" : "outline"} onClick={() => setTab("guide")}>Investor walkthrough</Button>
            <Button size="sm" variant="ghost" onClick={() => setFormKey((k) => k + 1)}>Reset form</Button>
          </div>
          {tab === "investor" ? (
            <CreateInvestor key={formKey} fundId={QA_FUND_ID} isStaff={role === "staff"} />
          ) : tab === "documents" ? <QaFundDocuments key={`${formKey}-${role}`} /> : tab === "commercial" ? <QaCommercialWorkflow key={formKey} /> : tab === "billing" ? <QaBillingReadback key={formKey} /> : tab === "guide" ? <InvestorOnboardingGuide /> : (
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
