import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getBoxSigningFunnel, getOnboardingFunnel } from "@/lib/funnel.functions";
import { getManagerFunds } from "@/lib/manager.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/funnel")({
  head: () => ({
    meta: [
      { title: "Onboarding Funnel — Harmonious" },
      {
        name: "description",
        content:
          "See how many investors receive the onboarding email, click through, clear identity and accreditation, sign documents and fund.",
      },
      { property: "og:title", content: "Onboarding Funnel — Harmonious" },
      {
        property: "og:description",
        content: "Step-by-step investor drop-off across the Harmonious onboarding journey.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FunnelPage,
});

const WINDOWS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last year" },
];

function FunnelPage() {
  const loadFunnel = useServerFn(getOnboardingFunnel);
  const loadFunds = useServerFn(getManagerFunds);
  const loadBox = useServerFn(getBoxSigningFunnel);

  const [days, setDays] = useState(90);
  const [offeringId, setOfferingId] = useState<string | null>(null);

  const fundsQuery = useQuery({ queryKey: ["manager-funds"], queryFn: () => loadFunds() });
  const funnelQuery = useQuery({
    queryKey: ["onboarding-funnel", offeringId, days],
    queryFn: () => loadFunnel({ data: { days, ...(offeringId ? { offeringId } : {}) } }),
  });

  const boxQuery = useQuery({
    queryKey: ["box-signing-funnel", offeringId, days],
    queryFn: () => loadBox({ data: { days, ...(offeringId ? { offeringId } : {}) } }),
  });

  const funds = fundsQuery.data?.funds ?? [];
  const data = funnelQuery.data;
  const top = data?.steps?.[0]?.count ?? 0;
  const box = boxQuery.data;
  const boxTop = box?.steps?.[0]?.count ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Onboarding funnel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Where investors move forward and where they stop, from the first email to funds received.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin">Back to admin</Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <Button
            key={w.days}
            size="sm"
            variant={w.days === days ? "default" : "outline"}
            onClick={() => setDays(w.days)}
          >
            {w.label}
          </Button>
        ))}
        <span className="mx-2 hidden h-6 w-px bg-border sm:block" />
        <Button
          size="sm"
          variant={offeringId === null ? "default" : "outline"}
          onClick={() => setOfferingId(null)}
        >
          All funds
        </Button>
        {funds.map((f: any) => (
          <Button
            key={f.id}
            size="sm"
            variant={offeringId === f.id ? "default" : "outline"}
            onClick={() => setOfferingId(f.id)}
          >
            {f.name}
          </Button>
        ))}
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Step by step</CardTitle>
          <CardDescription>
            How many investors opened each onboarding step and how many finished it. Opens are counted
            from the moment this tracking was switched on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stepsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : stepsQuery.isError || !stepData ? (
            <p className="text-sm text-muted-foreground">This report is unavailable right now.</p>
          ) : stepData.total === 0 ? (
            <p className="text-sm text-muted-foreground">No investors in this period yet.</p>
          ) : (
            stepData.steps.map((step: any) => (
              <div key={step.key} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{step.label}</span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">
                      {step.opened} of {stepData.total} opened · {step.openRate}%
                    </Badge>
                    <Badge variant="outline">
                      {step.completed} finished · {step.completionRate}% of those who opened
                    </Badge>
                    {step.neverOpened > 0 ? (
                      <Badge variant="secondary">{step.neverOpened} never opened</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, step.openRate)}%` }}
                  />
                </div>
                {step.stuckCount > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      {step.stuckCount} opened but have not finished
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {step.stuck.map((p: any) => (
                        <li key={p.applicationId} className="flex flex-wrap justify-between gap-2">
                          <span>{p.name || p.email || "Investor"}</span>
                          <span className="text-muted-foreground">
                            {p.opens} visit{p.opens === 1 ? "" : "s"}
                            {p.lastViewedAt
                              ? ` · last ${new Date(p.lastViewedAt).toLocaleString()}`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>



      {funnelQuery.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading funnel…</p>
      ) : funnelQuery.isError || !data ? (
        <p className="mt-8 text-sm text-muted-foreground">This report is unavailable right now.</p>
      ) : (
        <>
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-base">Journey</CardTitle>
              <CardDescription>
                Each bar is the number of investors who reached that point, with the share who came from
                the step above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.steps.map((step: any) => (
                <div key={step.key}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{step.label}</span>
                    <span className="text-muted-foreground">
                      {step.count}
                      {step.ofPrevious !== null ? ` · ${step.ofPrevious}% of previous step` : ""}
                      {step.dropped > 0 ? ` · ${step.dropped} dropped off here` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${top > 0 ? Math.round((step.count / top) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Email engagement</CardTitle>
              <CardDescription>
                {data.totalOpens} open{data.totalOpens === 1 ? "" : "s"} and {data.totalClicks} link
                click{data.totalClicks === 1 ? "" : "s"} recorded in this period. Opens are counted when
                the recipient's email app loads images, so treat them as a floor — clicks are always
                exact.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm">By email</p>
                {data.emailBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No opens or clicks recorded yet in this window.
                  </p>
                ) : (
                  data.emailBreakdown.map((row: any) => (
                    <div key={row.template} className="flex items-center justify-between text-sm">
                      <span>{row.label}</span>
                      <span className="text-muted-foreground">
                        opened by {row.openedBy} · clicked by {row.clickedBy}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm">By link</p>
                {data.linkBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clicks recorded yet in this window.</p>
                ) : (
                  data.linkBreakdown.map((row: any) => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span>{row.label}</span>
                      <span className="text-muted-foreground">
                        {row.clicks} click{row.clicks === 1 ? "" : "s"} · {row.people} investor
                        {row.people === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Signing and wire</CardTitle>
              <CardDescription>
                Investors sent a signing invitation, how many opened it, signed everything, confirmed
                their wire and had funds received.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {boxQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !box || box.counts.invited === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No signing invitations have been sent in this window.
                </p>
              ) : (
                <>
                  {box.steps.map((step: any) => (
                    <div key={step.key}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>{step.label}</span>
                        <span className="text-muted-foreground">
                          {step.count}
                          {step.ofPrevious !== null ? ` · ${step.ofPrevious}% of previous step` : ""}
                          {step.dropped > 0 ? ` · ${step.dropped} dropped off here` : ""}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{
                            width: `${boxTop > 0 ? Math.round((step.count / boxTop) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {box.stuck.length > 0 ? (
                    <div className="space-y-2 pt-3">
                      <p className="text-sm">Not finished yet</p>
                      {box.stuck.map((row: any) => (
                        <div
                          key={row.applicationId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm">{row.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.completed} of {row.requested} signed ·{" "}
                              {row.firstOpenedAt
                                ? `first opened ${new Date(row.firstOpenedAt).toLocaleDateString()}`
                                : "never opened"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{row.stage}</Badge>
                            <Button asChild size="sm" variant="outline">
                              <Link
                                to="/admin/$applicationId"
                                params={{ applicationId: row.applicationId }}
                              >
                                Open
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Waiting the longest</CardTitle>
              <CardDescription>Investors who have not funded, oldest activity first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.stalled.length === 0 ? (
                <p className="text-sm text-muted-foreground">Everyone in this window has funded.</p>
              ) : (
                data.stalled.map((row: any) => (
                  <div
                    key={row.applicationId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.email ?? "no email on file"} · last activity{" "}
                        {new Date(row.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{row.stage}</Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/admin/$applicationId" params={{ applicationId: row.applicationId }}>
                          Open
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
