import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getAdminAccess, listApplications } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prettyStatus, statusTone } from "@/lib/status";
import { AlertPreferenceToggle } from "@/components/alert-preference-toggle";
import { WireRequestQueue } from "@/components/wire-requests";

export { prettyStatus, statusTone };

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Compliance Review Queue — Harmonious Admin" },
      {
        name: "description",
        content:
          "Review investor applications: KYC, AML screening, accreditation evidence, signed fund documents and funding status.",
      },
      { property: "og:title", content: "Compliance Review Queue — Harmonious Admin" },
      {
        property: "og:description",
        content: "Internal console for reviewing and approving investor onboarding applications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminQueue,
});

const FILTERS = [
  { key: "pending", label: "Needs review" },
  { key: "accreditation", label: "Accreditation" },
  { key: "documents", label: "Documents" },
  { key: "funding", label: "Funding" },
  { key: "approved", label: "Settled" },
  { key: "all", label: "All" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

function AdminQueue() {
  const [filter, setFilter] = useState<Filter>("pending");
  const access = useServerFn(getAdminAccess);
  const load = useServerFn(listApplications);

  const accessQuery = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const isAdmin = accessQuery.data?.isAdmin;
  const isReviewer = accessQuery.data?.isReviewer;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-queue", filter],
    queryFn: () => load({ data: { filter } }),
    enabled: isReviewer === true,
    // Identity results arrive by webhook, so keep the queue current on its own.
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });



  if (accessQuery.isLoading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (!isReviewer) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This console is limited to Harmonious compliance staff. If you believe you should have access,
          contact the fund administrator.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to your application</Link>
        </Button>
      </main>
    );
  }

  const applications = data?.applications ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Compliance review queue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAdmin
              ? "Investor applications awaiting verification, accreditation review, document approval or funding confirmation."
              : "Investors in the funds you manage, with their onboarding progress."}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <Button asChild size="sm">
                <Link to="/admin/setup">Set up a fund</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/new-application">New application</Link>
              </Button>

              <Button asChild size="sm" variant="outline">
                <Link to="/admin/access">Access</Link>
              </Button>

              <Button asChild size="sm" variant="outline">
                <Link to="/admin/investors">Investor database</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/cap-table">Cap table</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/cap-table-board">Cap table board</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/portfolio-value">Portfolio value</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/performance">Fund performance</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/requests">Access requests</Link>
              </Button>

              <Button asChild size="sm" variant="outline">
                <Link to="/admin/permissions">Document permissions</Link>
              </Button>

              <Button asChild size="sm" variant="outline">
                <Link to="/admin/security">Login activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/funds">Fund setup</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/email-preview">Email preview</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/funnel">Onboarding funnel</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/document-log">Document activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/activity">Activity log</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/funding">Funding dashboard</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/diligence">Diligence rooms</Link>
              </Button>

            </>
          )}
        </div>
      </div>

      <div className="mt-6">
        <WireRequestQueue compact />
      </div>

      <div className="mt-6">
        <AlertPreferenceToggle />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading applications…</p>}
        {!isLoading && applications.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nothing in this queue right now.
            </CardContent>
          </Card>
        )}
        {applications.map((app: any) => (
          <Card key={app.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
              <div className="min-w-0">
                <p className="font-medium">
                  {app.profile?.legal_name ?? "Unnamed investor"}
                  {app.offering ? (
                    <span className="text-muted-foreground"> · {app.offering.name}</span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {app.profile?.email ?? "no email on file"}
                  {app.commitment_cents
                    ? ` · $${(app.commitment_cents / 100).toLocaleString("en-US")} commitment`
                    : ""}
                  {` · ${
                    app.source === "fund_page"
                      ? "via fund page"
                      : app.source === "referral"
                        ? "referral"
                        : app.source === "admin"
                          ? "opened by admin"
                          : "portal"
                  }`}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant={statusTone(app.kyc_status)}>KYC {prettyStatus(app.kyc_status)}</Badge>
                  <Badge variant={statusTone(app.aml_status)}>AML {prettyStatus(app.aml_status)}</Badge>
                  <Badge variant={statusTone(app.accreditation_status)}>
                    Accreditation {prettyStatus(app.accreditation_status)}
                  </Badge>
                  <Badge variant={statusTone(app.documents_status)}>
                    Docs {prettyStatus(app.documents_status)}
                  </Badge>
                  <Badge variant={statusTone(app.funding_status)}>
                    Funding {prettyStatus(app.funding_status)}
                  </Badge>
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/$applicationId" params={{ applicationId: app.id }}>
                  Review
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
