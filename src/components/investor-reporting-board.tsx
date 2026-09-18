import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  amendInvestorPackage,
  decideInvestorPackage,
  generateInvestorPackages,
  getManagerPackages,
  getPackageDetail,
  getReportingOperations,
  respondToInvestorPackage,
} from "@/lib/investor-reporting.functions";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  published: "bg-emerald-100 text-emerald-900",
  superseded: "bg-muted text-muted-foreground",
};

const label = (value: unknown) => String(value ?? "").replaceAll("_", " ");
const today = () => new Date().toISOString().slice(0, 10);

function PackageRow({
  pkg,
  onOpen,
  actions,
}: {
  pkg: any;
  onOpen: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3">
      <button type="button" className="text-left" onClick={onOpen}>
        <p className="text-sm font-medium">
          {pkg.fundName ?? "Fund"} · {pkg.period_label || pkg.period_end}
        </p>
        <p className="text-xs text-muted-foreground">
          v{pkg.version} · {label(pkg.template_code)}
          {pkg.blocking ? ` · ${pkg.blocking} blocking issue(s)` : ""}
        </p>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={STATUS_TONE[String(pkg.status)] ?? "bg-muted"}>{label(pkg.status)}</Badge>
        {pkg.manager_response ? (
          <Badge variant="outline">{label(pkg.manager_response)}</Badge>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

function PackageDetail({ packageId }: { packageId: string }) {
  const load = useServerFn(getPackageDetail);
  const query = useQuery({
    queryKey: ["reporting-package", packageId],
    queryFn: async (): Promise<any> => load({ data: { packageId } }),
  });
  const detail = query.data;
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!detail) return null;
  const manifest = (detail.manifest ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(manifest).map(([key, value]) => (
          <div key={key} className="rounded-md border border-border/60 p-2">
            <p className="text-xs text-muted-foreground">{label(key)}</p>
            <p className="truncate text-sm">{value === null ? "—" : String(value)}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-medium">Sections</p>
        <ul className="mt-2 space-y-1">
          {(detail.components ?? []).map((component: any) => (
            <li
              key={component.id}
              className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <span>{label(component.section_key)}</span>
              <span className="text-xs text-muted-foreground">
                {label(component.source_table)}
                {component.source_version ? ` v${component.source_version}` : ""} ·{" "}
                {label(component.source_status)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {(detail.events ?? []).length > 0 ? (
        <div>
          <p className="text-sm font-medium">Delivery history</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(detail.events ?? []).map((event: any, index: number) => (
              <li key={index}>
                {label(event.event)} · {label(event.channel)} ·{" "}
                {String(event.created_at ?? "").slice(0, 16).replace("T", " ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function InvestorReportingBoard({ role }: { role: "harmonious" | "manager" }) {
  const isStaff = role === "harmonious";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [fundId, setFundId] = useState("");
  const [periodEnd, setPeriodEnd] = useState(today());
  const [periodKind, setPeriodKind] = useState<"month" | "quarter" | "year">("quarter");
  const [note, setNote] = useState("");

  const loadOps = useServerFn(getReportingOperations);
  const loadManager = useServerFn(getManagerPackages);
  const generate = useServerFn(generateInvestorPackages);
  const decide = useServerFn(decideInvestorPackage);
  const amend = useServerFn(amendInvestorPackage);
  const respond = useServerFn(respondToInvestorPackage);

  const queryKey = isStaff ? ["reporting-operations"] : ["manager-packages"];
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<any> =>
      isStaff ? loadOps({ data: {} }) : loadManager({ data: {} }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const fail = (error: unknown) => toast.error((error as Error)?.message ?? "Something went wrong");

  const generateMutation = useMutation({
    mutationFn: async () => generate({ data: { fundId, periodKind, periodEnd } }),
    onSuccess: (result: any) => {
      toast.success(`Prepared ${result?.created ?? 0} package(s) for ${result?.periodLabel ?? ""}`);
      refresh();
    },
    onError: fail,
  });

  const decideMutation = useMutation({
    mutationFn: async (input: { packageId: string; to: string }) =>
      decide({ data: input as any }),
    onSuccess: () => {
      toast.success("Package updated");
      refresh();
    },
    onError: fail,
  });

  const amendMutation = useMutation({
    mutationFn: async (packageId: string) => amend({ data: { packageId, reason: note } }),
    onSuccess: () => {
      toast.success("A new version now supersedes the published package");
      setNote("");
      refresh();
    },
    onError: fail,
  });

  const respondMutation = useMutation({
    mutationFn: async (input: { packageId: string; response: "acknowledged" | "challenged" }) =>
      respond({ data: { ...input, note: note || undefined } as any }),
    onSuccess: () => {
      toast.success("Response recorded");
      setNote("");
      refresh();
    },
    onError: fail,
  });

  const data = query.data ?? {};

  const section = (title: string, description: string, rows: any[], actions?: (pkg: any) => React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          rows.map((pkg: any) => (
            <div key={pkg.id}>
              <PackageRow
                pkg={pkg}
                onOpen={() => setOpen(open === pkg.id ? null : pkg.id)}
                actions={actions?.(pkg)}
              />
              {open === pkg.id ? (
                <div className="border-b border-border/60 py-3">
                  <PackageDetail packageId={pkg.id} />
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">
          {isStaff ? "Investor reporting" : "Investor reporting packages"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isStaff
            ? "Assemble, review, approve and publish investor reporting packages from already-approved records."
            : "Published reporting packages for the funds you manage. Harmonious remains the publisher."}
        </p>
      </div>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {isStaff ? (
        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="prepare">Prepare</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="space-y-4 pt-4">
            {section("Incomplete components", "Blocked until every required component is published.", data.awaitingGeneration ?? [])}
            {section(
              "Awaiting review",
              "Drafts with everything they need.",
              data.awaitingReview ?? [],
              (pkg) => (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decideMutation.mutate({ packageId: pkg.id, to: "review" })}
                >
                  Send to review
                </Button>
              ),
            )}
            {section("In review", "Waiting on approval.", data.inReview ?? [], (pkg) => (
              <Button
                size="sm"
                variant="outline"
                onClick={() => decideMutation.mutate({ packageId: pkg.id, to: "approved" })}
              >
                Approve
              </Button>
            ))}
            {section("Ready to publish", "Approved and complete.", data.readyToPublish ?? [], (pkg) => (
              <Button
                size="sm"
                onClick={() => decideMutation.mutate({ packageId: pkg.id, to: "published" })}
              >
                Publish
              </Button>
            ))}
            {section("Manager challenges", "Raised by fund managers.", data.challenges ?? [])}
          </TabsContent>

          <TabsContent value="published" className="space-y-4 pt-4">
            {section("Published", "Investors can see these.", data.published ?? [], (pkg) => (
              <Button size="sm" variant="outline" onClick={() => amendMutation.mutate(pkg.id)}>
                Amend
              </Button>
            ))}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Amendment reason</CardTitle>
                <CardDescription>
                  Amending creates a new version; the original package is preserved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Why is this package being amended?"
                />
              </CardContent>
            </Card>
            {section("Superseded", "Earlier versions, kept exactly as published.", data.superseded ?? [])}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery</CardTitle>
                <CardDescription>
                  Portal access is authoritative — an email is never proof the investor read it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.delivery ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing published yet.</p>
                ) : (
                  (data.delivery ?? []).map((row: any) => (
                    <div
                      key={row.packageId}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 text-sm"
                    >
                      <span>
                        {row.fundName} · {row.periodLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.opened ? "opened" : "not opened"} ·{" "}
                        {row.downloaded ? "downloaded" : "not downloaded"} ·{" "}
                        {row.acknowledged ? "acknowledged" : "not acknowledged"}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prepare" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prepare a period</CardTitle>
                <CardDescription>
                  Builds one package per investor position from published components only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={fundId}
                  onChange={(event) => setFundId(event.target.value)}
                >
                  <option value="">Choose a fund…</option>
                  {(data.funds ?? []).map((fund: any) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={periodKind}
                  onChange={(event) => setPeriodKind(event.target.value as typeof periodKind)}
                >
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                  <option value="year">Annual</option>
                </select>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                />
                <Button
                  disabled={!fundId || generateMutation.isPending}
                  onClick={() => generateMutation.mutate()}
                >
                  Prepare packages
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4">
          {section("Published packages", "Funds you manage.", data.packages ?? [], (pkg) => (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  respondMutation.mutate({ packageId: pkg.id, response: "acknowledged" })
                }
              >
                Acknowledge
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  respondMutation.mutate({ packageId: pkg.id, response: "challenged" })
                }
              >
                Challenge
              </Button>
            </div>
          ))}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Note</CardTitle>
              <CardDescription>A challenge needs a reason of at least ten characters.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What is wrong with this package?"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
