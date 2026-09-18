import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getInvestorDashboardSummary,
  getInvestorDocumentLibrary,
  getInvestorPackage,
  getInvestorReportingCenter,
  recordPackageEvent,
} from "@/lib/investor-reporting.functions";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : `${Number(cents) < 0 ? "−" : ""}$${Math.abs(Number(cents) / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const pct = (bps: number | null | undefined) =>
  bps === null || bps === undefined ? "—" : `${(Number(bps) / 100).toFixed(2)}%`;

const label = (value: unknown) => String(value ?? "").replaceAll("_", " ");

function Figure({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

function PackageView({ packageId }: { packageId: string }) {
  const load = useServerFn(getInvestorPackage);
  const record = useServerFn(recordPackageEvent);
  const query = useQuery({
    queryKey: ["investor-package", packageId],
    queryFn: async (): Promise<any> => load({ data: { packageId } }),
  });

  const acknowledge = useMutation({
    mutationFn: async () => record({ data: { packageId, event: "acknowledged" } }),
    onSuccess: () => toast.success("Thank you — your acknowledgement is recorded"),
    onError: (error) => toast.error((error as Error)?.message ?? "Could not record that"),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const detail = query.data;
  if (!detail) return null;

  return (
    <div className="space-y-3">
      {(detail.components ?? []).map((component: any) => (
        <Card key={component.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{label(component.section_key)}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {Object.entries((component.snapshot ?? {}) as Record<string, unknown>).map(
              ([key, value]) => (
                <div key={key} className="rounded-md border border-border/60 p-2">
                  <p className="text-xs text-muted-foreground">{label(key)}</p>
                  <p className="truncate text-sm">
                    {value === null || value === undefined
                      ? "—"
                      : typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                  </p>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      ))}

      {detail.package?.requires_acknowledgement && !detail.delivery?.acknowledged ? (
        <Button size="sm" onClick={() => acknowledge.mutate()} disabled={acknowledge.isPending}>
          Acknowledge this package
        </Button>
      ) : null}
    </div>
  );
}

export function InvestorReportingCenter() {
  const loadSummary = useServerFn(getInvestorDashboardSummary);
  const loadCenter = useServerFn(getInvestorReportingCenter);
  const loadLibrary = useServerFn(getInvestorDocumentLibrary);
  const [open, setOpen] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: ["investor-reporting-summary"],
    queryFn: async (): Promise<any> => loadSummary({ data: {} }),
  });
  const center = useQuery({
    queryKey: ["investor-reporting-center"],
    queryFn: async (): Promise<any> => loadCenter({ data: {} }),
  });
  const library = useQuery({
    queryKey: ["investor-document-library"],
    queryFn: async (): Promise<any> => loadLibrary({ data: {} }),
  });

  const investments = summary.data?.investments ?? [];
  const profiles = center.data?.profiles ?? [];
  const groups = library.data?.groups ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Your reporting, kept separate for each of your investment profiles. Figures under “Your
          investment” come from your own capital account, not from fund-level totals.
        </p>
      </div>

      <Tabs defaultValue="investments">
        <TabsList>
          <TabsTrigger value="investments">Your investments</TabsTrigger>
          <TabsTrigger value="reports">Reporting periods</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="investments" className="space-y-4 pt-4">
          {summary.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!summary.isLoading && investments.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                You do not have any investments with published reporting yet.
              </CardContent>
            </Card>
          ) : null}
          {investments.map((item: any) => (
            <Card key={item.positionId}>
              <CardHeader>
                <CardTitle className="text-base">{item.fundName}</CardTitle>
                <CardDescription>
                  {item.profileLabel ?? "Your profile"} · {label(item.capacity)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Figure title="Commitment" value={money(item.commitmentCents)} />
                  <Figure title="Contributed" value={money(item.contributedCents)} />
                  <Figure title="Unfunded" value={money(item.unfundedCommitmentCents)} />
                  <Figure title="Current value" value={money(item.currentValueCents)} />
                  <Figure title="Distributions" value={money(item.distributionsCents)} />
                  <Figure title="Total value" value={money(item.totalValueCents)} />
                </div>

                {item.latestPerformance ? (
                  <p className="text-xs text-muted-foreground">
                    Your latest published performance: IRR{" "}
                    {item.latestPerformance.irrStatus === "solved"
                      ? pct(item.latestPerformance.irrBps)
                      : label(item.latestPerformance.irrStatus)}{" "}
                    · MOIC{" "}
                    {item.latestPerformance.moic
                      ? `${Number(item.latestPerformance.moic).toFixed(2)}×`
                      : "—"}
                  </p>
                ) : null}

                {(item.outstandingCapitalCalls ?? []).length > 0 ? (
                  <div>
                    <p className="text-sm font-medium">Outstanding capital calls</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {item.outstandingCapitalCalls.map((call: any) => (
                        <li key={call.id} className="flex justify-between">
                          <span>{call.title}</span>
                          <span className="text-muted-foreground">
                            {money(call.amountCents)} {call.dueDate ? `· due ${call.dueDate}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(item.recentDistributionNotices ?? []).length > 0 ? (
                  <div>
                    <p className="text-sm font-medium">Recent distribution notices</p>
                    <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                      {item.recentDistributionNotices.map((notice: any) => (
                        <li key={notice.id}>
                          {notice.title} · {notice.effectiveDate ?? ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4 pt-4">
          {center.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!center.isLoading && profiles.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No reporting packages have been published to you yet.
              </CardContent>
            </Card>
          ) : null}
          {profiles.map((profile: any) => (
            <Card key={String(profile.investmentProfileId ?? "personal")}>
              <CardHeader>
                <CardTitle className="text-base">{profile.profileLabel}</CardTitle>
                <CardDescription>{label(profile.profileType)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(profile.funds ?? []).map((fund: any) => (
                  <div key={fund.offeringId}>
                    <p className="text-sm font-medium">{fund.fundName}</p>
                    {(fund.periods ?? []).map((period: any) => (
                      <div key={period.packageId}>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2">
                          <button
                            type="button"
                            className="text-left text-sm"
                            onClick={() =>
                              setOpen(open === period.packageId ? null : period.packageId)
                            }
                          >
                            {period.periodLabel || period.periodEnd}
                            <span className="ml-2 text-xs text-muted-foreground">
                              v{period.version}
                            </span>
                          </button>
                          <Badge variant="outline">{label(period.status)}</Badge>
                        </div>
                        {open === period.packageId ? (
                          <div className="py-3">
                            <PackageView packageId={period.packageId} />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4 pt-4">
          {library.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!library.isLoading && groups.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Your document library is empty.
              </CardContent>
            </Card>
          ) : null}
          {groups.map((group: any) => (
            <Card key={group.group}>
              <CardHeader>
                <CardTitle className="text-base">{group.group}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {group.items.map((item: any) => (
                    <li
                      key={`${item.kind}-${item.id}`}
                      className="flex flex-wrap justify-between gap-2 border-b border-border/60 py-2"
                    >
                      <span>{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {String(item.date ?? "").slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
