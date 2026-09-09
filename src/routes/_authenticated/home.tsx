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
import { Separator } from "@/components/ui/separator";
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to as never} className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {children}
      </Link>
    </Button>
  );
}

function RoleHome() {
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

  const hats = [
    data.roles.investor ? "Investor" : null,
    data.roles.manager ? "Fund manager" : null,
    data.roles.operations ? "Operations" : null,
    data.roles.admin ? "Admin" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {data.name}</h1>
        <p className="text-sm text-muted-foreground">
          Everything waiting on you today, grouped by what you do here.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {hats.map((hat) => (
            <Badge key={hat} variant="secondary">
              {hat}
            </Badge>
          ))}
        </div>
      </header>

      {data.roles.investor && (
        <Card>
          <CardHeader>
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
            <div className="grid gap-3 sm:grid-cols-3">
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
                        <Badge key={label as string} variant={statusTone(String(value ?? "not_started"))}>
                          {label}: {prettyStatus(String(value ?? "not_started"))}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <QuickLink to="/dashboard" icon={ClipboardList}>
                Your dashboard
              </QuickLink>
              <QuickLink to="/portal" icon={Building2}>
                Investor portal
              </QuickLink>
              <QuickLink to="/documents" icon={FileText}>
                Documents
              </QuickLink>
              <QuickLink to="/wire-confirmation" icon={Landmark}>
                Confirm a wire
              </QuickLink>
              <QuickLink to="/diligence" icon={FolderLock}>
                Diligence rooms
              </QuickLink>
            </div>
          </CardContent>
        </Card>
      )}

      {data.manager && (
        <Card>
          <CardHeader>
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

            <Separator />
            <div className="flex flex-wrap gap-2">
              <QuickLink to="/manager" icon={Users}>
                My funds
              </QuickLink>
              <QuickLink to="/manager/approvals" icon={ClipboardList}>
                Approvals
              </QuickLink>
              <QuickLink to="/manager/wires" icon={Landmark}>
                Wire board
              </QuickLink>
              <QuickLink to="/manager/inbox" icon={FileText}>
                Document inbox ({data.manager.uploadsToReview})
              </QuickLink>
              <QuickLink to="/manager/messages" icon={MessageSquare}>
                Messages
              </QuickLink>
            </div>
          </CardContent>
        </Card>
      )}

      {data.operations && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" /> Operations queues
            </CardTitle>
            <CardDescription>Paperwork waiting on the operations team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Banking requests" value={data.operations.bankingPending} />
              <Stat label="EIN and SS-4" value={data.operations.ss4Pending} />
              <Stat label="Tax documents" value={data.operations.taxPending} />
            </div>
            <div className="flex flex-wrap gap-2">
              <QuickLink to="/ops" icon={ShieldCheck}>
                Operations home
              </QuickLink>
              <QuickLink to="/ops/banking" icon={Landmark}>
                Banking
              </QuickLink>
              <QuickLink to="/ops/ss4" icon={FileText}>
                EIN and SS-4
              </QuickLink>
              <QuickLink to="/ops/tax-documents" icon={FileText}>
                Tax documents
              </QuickLink>
            </div>
          </CardContent>
        </Card>
      )}

      {data.admin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" /> Administration
            </CardTitle>
            <CardDescription>Platform-wide funds, requests and review queues.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Funds" value={data.admin.totalFunds} />
              <Stat label="Open to investors" value={data.admin.openFunds} />
              <Stat label="Access requests" value={data.admin.accessRequests} />
              <Stat label="Wire requests" value={data.admin.wireRequests} />
            </div>
            <div className="flex flex-wrap gap-2">
              <QuickLink to="/admin" icon={ClipboardList}>
                Review queue
              </QuickLink>
              <QuickLink to="/admin/funds" icon={Building2}>
                Funds
              </QuickLink>
              <QuickLink to="/admin/funding" icon={Landmark}>
                Funding dashboard
              </QuickLink>
              <QuickLink to="/admin/requests" icon={MessageSquare}>
                Access requests
              </QuickLink>
              <QuickLink to="/admin/activity" icon={ClipboardList}>
                Activity log
              </QuickLink>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
