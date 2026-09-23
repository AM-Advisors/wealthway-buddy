import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  ClipboardList,
  FileText,
  FolderLock,
  Landmark,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";

import { getRoleOverview } from "@/lib/role-overview.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stat } from "@/components/dashboard-primitives";
import { useClientWorkspace } from "@/components/client-workspace";
import { AttentionCenter } from "@/components/attention-center";
import { SetupCard } from "@/components/setup-card";

import { money, prettyStatus, statusTone } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Your Harmonious Home" },
      {
        name: "description",
        content:
          "One home page across every hat you wear at Harmonious: your own subscriptions, the funds you manage, operations queues and admin tools.",
      },
      { property: "og:title", content: "Your Harmonious Home" },
      {
        property: "og:description",
        content: "Everything waiting on you, grouped by the roles you hold.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoleHome,
});

type QuickLinkDef = { to: string; icon: typeof Users; label: string };

/** Three most-used links up front, the rest behind "More". */
function QuickLinks({ links }: { links: QuickLinkDef[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? links : links.slice(0, 3);

  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((link) => (
        <Button key={link.to + link.label} asChild variant="outline" size="sm">
          <Link to={link.to as never} className="flex items-center gap-2">
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        </Button>
      ))}
      {links.length > 3 && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Less" : `More (${links.length - 3})`}
        </Button>
      )}
    </div>
  );
}

function RoleHome() {
  const { activeKind } = useClientWorkspace();
  const load = useServerFn(getRoleOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["role-overview"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading your home page…</div>;
  }
  if (!data) return null;

  // Workflow state ("what needs you") comes only from the Action Center read
  // model below. The cards that follow are summary context, not a second
  // workflow calculation.
  const investorCard = data.roles.investor ? (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FolderLock className="h-5 w-5" /> Your subscriptions
        </CardTitle>
        <CardDescription>
          {data.investor.applications.length === 0
            ? "You have not started an application yet."
            : "Where each of your fund applications stands."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label="Applications" value={data.investor.applications.length} />
          <Stat label="Committed" value={money(data.investor.committedCents)} />
          <Stat label="Unread messages" value={data.investor.unreadMessages} />
        </div>

        {data.investor.applications.length > 0 && (
          <div className="divide-y rounded-lg border">
            {data.investor.applications.map((app) => (
              <div
                key={app.applicationId}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="font-medium">{app.fundName}</p>
                  <p className="text-xs text-muted-foreground">
                    {money(app.commitmentCents)} committed
                    {app.currentStep ? ` · next: ${prettyStatus(app.currentStep)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    ["Identity", app.kyc],
                    ["Screening", app.aml],
                    ["Accreditation", app.accreditation],
                    ["Documents", app.documents],
                    ["Funding", app.funding],
                  ].map(([label, value]) => (
                    <Badge
                      key={label as string}
                      variant={statusTone(String(value ?? "not_started"))}
                    >
                      {label}: {prettyStatus(String(value ?? "not_started"))}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <QuickLinks
          links={[
            { to: "/dashboard", icon: ClipboardList, label: "Your dashboard" },
            { to: "/documents", icon: FileText, label: "Documents" },
            { to: "/wire-confirmation", icon: Landmark, label: "Confirm a wire" },
            { to: "/portal", icon: Building2, label: "Investor portal" },
            { to: "/client", icon: Building2, label: "Client portal" },
            { to: "/diligence", icon: FolderLock, label: "Diligence rooms" },
          ]}
        />
      </CardContent>
    </Card>
  ) : null;

  const managerCard = data.manager ? (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" /> Funds you manage
        </CardTitle>
        <CardDescription>
          {data.roles.admin
            ? "Every fund on the platform, and what needs a decision."
            : "The funds assigned to you, and what needs a decision."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Investors" value={data.manager.investors} />
          <Stat label="Committed" value={money(data.manager.committedCents)} />
          <Stat label="Applications to review" value={data.manager.needsReview} />
          <Stat label="Wires to review" value={data.manager.wiresToReview} />
        </div>

        {data.manager.funds.length > 0 && (
          <div className="divide-y rounded-lg border">
            {data.manager.funds.map((fund) => (
              <div
                key={fund.offeringId}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="font-medium">{fund.fundName}</p>
                  <p className="text-xs text-muted-foreground">
                    {fund.investors} investor{fund.investors === 1 ? "" : "s"} ·{" "}
                    {money(fund.committedCents)} committed
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {fund.needsReview > 0 && (
                    <Badge variant="secondary">{fund.needsReview} to review</Badge>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link to="/manager/fund/$fundId" params={{ fundId: fund.offeringId }}>
                      Open fund
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <QuickLinks
          links={[
            { to: "/manager", icon: Users, label: "My funds" },
            { to: "/manager/approvals", icon: ClipboardList, label: "Approvals" },
            {
              to: "/manager/inbox",
              icon: FileText,
              label: `Document inbox (${data.manager.uploadsToReview})`,
            },
            { to: "/manager/wires", icon: Landmark, label: "Wire board" },
            { to: "/manager/messages", icon: MessageSquare, label: "Messages" },
          ]}
        />
      </CardContent>
    </Card>
  ) : null;

  const operationsCard = data.operations ? (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" /> Operations queues
        </CardTitle>
        <CardDescription>Paperwork waiting on the operations team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label="Banking requests" value={data.operations.bankingPending} />
          <Stat label="EIN and SS-4" value={data.operations.ss4Pending} />
          <Stat label="Tax documents" value={data.operations.taxPending} />
        </div>
        <QuickLinks
          links={[
            { to: "/ops", icon: ShieldCheck, label: "Operations home" },
            { to: "/ops/banking", icon: Landmark, label: "Banking" },
            { to: "/ops/ss4", icon: FileText, label: "EIN and SS-4" },
            { to: "/ops/tax-documents", icon: FileText, label: "Tax documents" },
          ]}
        />
      </CardContent>
    </Card>
  ) : null;

  const adminCard = data.admin ? (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5" /> Administration
        </CardTitle>
        <CardDescription>Platform-wide funds, requests and review queues.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Funds" value={data.admin.totalFunds} />
          <Stat label="Open to investors" value={data.admin.openFunds} />
          <Stat label="Access requests" value={data.admin.accessRequests} />
          <Stat label="Wire requests" value={data.admin.wireRequests} />
        </div>
        <QuickLinks
          links={[
            { to: "/admin", icon: ClipboardList, label: "Review queue" },
            { to: "/admin/invoices", icon: Landmark, label: "Unpaid invoices" },
            { to: "/admin/signoff", icon: ShieldCheck, label: "Sign-off" },
            { to: "/admin/funds", icon: Building2, label: "Funds" },
            { to: "/admin/funding", icon: Landmark, label: "Funding dashboard" },
            { to: "/admin/requests", icon: MessageSquare, label: "Access requests" },
            { to: "/admin/activity", icon: ClipboardList, label: "Activity log" },
          ]}
        />
      </CardContent>
    </Card>
  ) : null;

  const sections = [
    investorCard ? { id: "investor", label: "Investor", node: investorCard } : null,
    managerCard ? { id: "manager", label: "Fund manager", node: managerCard } : null,
    operationsCard ? { id: "operations", label: "Operations", node: operationsCard } : null,
    adminCard ? { id: "admin", label: "Admin", node: adminCard } : null,
  ].filter(Boolean) as { id: string; label: string; node: React.ReactNode }[];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {data.name}</h1>
        <p className="text-sm text-muted-foreground">
          Everything waiting on you today. Harmonious provides administrative, technology,
          onboarding, reporting, payment facilitation and recordkeeping support within each
          client's active scope.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {sections.map((section) => (
            <Badge key={section.id} variant="secondary">
              {section.label}
            </Badge>
          ))}
        </div>
      </header>

      <SetupCard />

      <AttentionCenter {...(activeKind && activeKind !== "operations" ? { workspace: activeKind } : {})} />


      {sections.length <= 1 ? (
        sections.map((section) => <div key={section.id}>{section.node}</div>)
      ) : (
        <Tabs defaultValue={sections[0]!.id}>
          <TabsList>
            {sections.map((section) => (
              <TabsTrigger key={section.id} value={section.id}>
                {section.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((section) => (
            <TabsContent key={section.id} value={section.id} className="mt-4">
              {section.node}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
