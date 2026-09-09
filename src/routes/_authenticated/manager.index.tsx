import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getManagerPanelSummary } from "@/lib/manager.functions";
import { money } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FundInvitations } from "@/components/fund-invitations";
import { AlertPreferenceToggle } from "@/components/alert-preference-toggle";
import { WireTrackingPanel } from "@/components/wire-tracking-panel";
import { DiligenceRoomsPanel } from "@/components/diligence-rooms-panel";
import { WireRequestForm, WireRequestQueue } from "@/components/wire-requests";

export const Route = createFileRoute("/_authenticated/manager/")({
  head: () => ({
    meta: [
      { title: "Fund Manager Panel — Harmonious" },
      {
        name: "description",
        content:
          "The Harmonious fund manager panel: investors in review, documents awaiting signature, wire approvals and fund settings for the funds you manage.",
      },
      { property: "og:title", content: "Fund Manager Panel — Harmonious" },
      {
        property: "og:description",
        content: "One control panel for every fund you manage at Harmonious.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerPanel,
});

const TOOLS = [
  { to: "/manager/investors", title: "Investors", blurb: "Review every applicant, stage by stage." },
  {
    to: "/manager/approvals",
    title: "Investor approvals",
    blurb: "Approve each completed file before the investor can send money.",
  },
  {
    to: "/manager/inbox",
    title: "Document inbox",
    blurb: "Every investor upload lands here, ready to review.",
  },
  {
    to: "/manager/wires",
    title: "Wire review board",
    blurb: "Approve or send back each wire confirmation, with funding status.",
  },
  {
    to: "/manager/timeline",
    title: "Application timeline",
    blurb: "Follow each investor from invitation to funding, with full history.",
  },
  {
    to: "/manager/activity",
    title: "Reviewer activity",
    blurb: "Who approved, delayed or declined what, and when.",
  },
  { to: "/manager/documents", title: "Fund documents", blurb: "Add and edit what investors sign." },
  {
    to: "/manager/profile",
    title: "Your profile",
    blurb: "Update your contact details and see the funds you're assigned to.",
  },
  {
    to: "/manager/closing",
    title: "Closing desk",
    blurb: "Confirm funds landed in full, set the closing date and share final documents.",
  },
  { to: "/admin/wire", title: "Wire instructions", blurb: "Keep bank details current." },
  { to: "/admin/funds", title: "Fund pages", blurb: "Fund detail, packets and change history." },
  {
    to: "/manager/diligence",
    title: "Diligence rooms",
    blurb: "Upload fund materials and sort them into the sections investors expect.",
  },
  { to: "/diligence", title: "Investor view of diligence", blurb: "Materials, checklist and investor Q&A." },
] as const;

function ManagerPanel() {
  const load = useServerFn(getManagerPanelSummary);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["manager-panel-summary"],
    queryFn: () => load(),
    retry: false,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This panel is limited to Harmonious fund managers and administrators.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to your dashboard</Link>
        </Button>
      </main>
    );
  }

  const funds = (data.funds ?? []) as any[];
  const roleLabel = data.isAdmin ? "Administrator" : "Fund manager";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Fund manager panel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.email ? `Signed in as ${data.email}. ` : ""}
            {roleLabel} · {funds.length} {funds.length === 1 ? "fund" : "funds"}
          </p>
        </div>
        <Badge variant="secondary">{roleLabel}</Badge>
      </div>

      {funds.length === 0 ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>No funds assigned yet</CardTitle>
            <CardDescription>
              You have manager access, but no fund has been assigned to you. Ask a Harmonious
              administrator to add you to a fund.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {funds.map((fund) => (
            <Card key={fund.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{fund.name}</CardTitle>
                    <CardDescription>
                      Reg D {fund.regType} · {fund.isOpen ? "Open" : "Closed"} ·{" "}
                      {money(fund.committedCents)} committed
                    </CardDescription>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/manager/investors">Open</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Investors" value={fund.total} />
                  <Metric label="In review" value={fund.identity + fund.accreditation} />
                  <Metric label="Docs pending" value={fund.documents} />
                  <Metric label="Complete" value={fund.complete} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={fund.pendingWires > 0 ? "default" : "outline"}>
                    {fund.pendingWires} wire{fund.pendingWires === 1 ? "" : "s"} awaiting approval
                  </Badge>
                  <Badge variant={fund.openFlags > 0 ? "destructive" : "outline"}>
                    {fund.openFlags} open issue{fund.openFlags === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline">
                    {fund.signableDocuments} document{fund.signableDocuments === 1 ? "" : "s"} to
                    sign
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-xl">Diligence rooms</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Your funds, their rooms, and the investors who have looked inside.
        </p>
        <DiligenceRoomsPanel />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xl">Wire tracking</h2>
        <WireTrackingPanel />
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-xl">Wire requests</h2>
        <WireRequestForm />
        <WireRequestQueue />
      </section>

      <section className="mt-10">
        <h2 className="text-xl">Your tools</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link
              key={tool.to}
              to={tool.to}
              className="rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <p className="text-sm font-medium">{tool.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tool.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-10">
        <FundInvitations title="Invite people to your funds" />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-xl">Email alerts</h2>
        <AlertPreferenceToggle />
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl">{value}</p>
    </div>
  );
}
