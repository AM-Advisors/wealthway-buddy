import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  APPROVAL_LABELS,
  decideApplicationApproval,
  getApprovalQueue,
  type ApprovalRow,
} from "@/lib/application-approval.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/manager/approvals")({
  head: () => ({
    meta: [
      { title: "Investor Approvals — Harmonious Fund Managers" },
      {
        name: "description",
        content:
          "Review each investor's completed onboarding file and approve it before funding opens, or send it back with a note.",
      },
      { property: "og:title", content: "Investor Approvals — Harmonious Fund Managers" },
      {
        property: "og:description",
        content: "Approve investor applications before they reach the funding step.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApprovalsPage,
  errorComponent: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">Investor approvals</h1>
      <p className="mt-2 text-muted-foreground">
        This page could not be loaded. Refresh, or check that your account still manages a fund.
      </p>
    </main>
  ),
  notFoundComponent: () => <p className="p-6">Page not found.</p>,
});

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function when(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function tone(status: string): "default" | "secondary" | "destructive" {
  if (status === "approved") return "default";
  if (status === "declined") return "destructive";
  return "secondary";
}

function checkText(row: ApprovalRow) {
  const parts = [
    `identity ${row.kyc_status}`,
    `screening ${row.aml_status}`,
    `accreditation ${row.accreditation_status}`,
    `documents ${row.documents_status}`,
  ];
  return parts.join(" · ").replace(/_/g, " ");
}

function ApprovalsPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getApprovalQueue);
  const decide = useServerFn(decideApplicationApproval);

  const [fund, setFund] = useState("all");
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["manager-approvals"],
    queryFn: () => load(),
    refetchInterval: 60000,
  });

  const applications: ApprovalRow[] = (data as any)?.applications ?? [];
  const funds: { id: string; name: string }[] = (data as any)?.funds ?? [];

  const decideMutation = useMutation({
    mutationFn: (vars: { id: string; decision: "approved" | "declined" | "pending" }) =>
      decide({
        data: {
          applicationId: vars.id,
          decision: vars.decision,
          notes: notes[vars.id]?.trim() ? notes[vars.id]! : null,
        },
      }),
    onSuccess: (res: any, vars) => {
      if (vars.decision === "approved") {
        toast.success(
          res?.welcome?.sent
            ? "Approved — welcome email sent to the investor."
            : "Approved. Funding is now open for this investor.",
        );
      } else if (vars.decision === "declined") {
        toast.success("Sent back to the investor.");
      } else {
        toast.success("Reopened for review.");
      }
      queryClient.invalidateQueries({ queryKey: ["manager-approvals"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that decision."),
  });

  const counts = useMemo(
    () => ({
      pending: applications.filter((a) => a.manager_review_status === "pending").length,
      ready: applications.filter(
        (a) => a.manager_review_status === "pending" && a.readyForApproval,
      ).length,
      approved: applications.filter((a) => a.manager_review_status === "approved").length,
      declined: applications.filter((a) => a.manager_review_status === "declined").length,
    }),
    [applications],
  );

  const rows = applications.filter((a) => {
    if (fund !== "all" && a.offering_id !== fund) return false;
    if (status !== "all" && a.manager_review_status !== status) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const hay = `${a.investorName ?? ""} ${a.investorEmail ?? ""} ${a.offeringName ?? ""}`;
      if (!hay.toLowerCase().includes(term)) return false;
    }
    return true;
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Investor approvals</h1>
          <p className="mt-1 text-muted-foreground">
            Give each completed file a final look before the investor can send money. Approving
            opens funding and sends their welcome message.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/manager">Back to my funds</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Waiting on you</p>
            <p className="text-2xl">{counts.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Ready to approve</p>
            <p className="text-2xl">{counts.ready}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Approved</p>
            <p className="text-2xl">{counts.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Sent back</p>
            <p className="text-2xl">{counts.declined}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Applications</CardTitle>
          <CardDescription>
            An application can only be approved once identity, accreditation and fund documents are
            all approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="ap-fund">Fund</Label>
              <select
                id="ap-fund"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={fund}
                onChange={(e) => setFund(e.target.value)}
              >
                <option value="all">All funds</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ap-status">Status</Label>
              <select
                id="ap-status"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="pending">Waiting on you</option>
                <option value="approved">Approved</option>
                <option value="declined">Sent back</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ap-search">Search</Label>
              <Input
                id="ap-search"
                value={search}
                placeholder="Investor name or email"
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing here right now.</p>
          )}

          {rows.map((a) => (
            <div key={a.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={tone(a.manager_review_status)}>
                      {APPROVAL_LABELS[a.manager_review_status] ?? a.manager_review_status}
                    </Badge>
                    <span className="font-medium">
                      {a.investorName ?? a.investorEmail ?? "Investor"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {money(a.commitment_cents)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.offeringName ?? "Fund"} · {checkText(a)}
                  </p>
                  {a.manager_reviewed_at && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {a.manager_review_status === "approved" ? "Approved" : "Sent back"}{" "}
                      {when(a.manager_reviewed_at)}
                      {a.reviewerName ? ` by ${a.reviewerName}` : ""}
                    </p>
                  )}
                  {a.manager_review_notes && (
                    <p className="mt-1 text-sm">Note: {a.manager_review_notes}</p>
                  )}
                  {a.manager_review_status === "pending" && !a.readyForApproval && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Waiting on earlier checks before this can be approved.
                    </p>
                  )}
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/manager/$applicationId" params={{ applicationId: a.id }}>
                    Open file
                  </Link>
                </Button>
              </div>

              {a.manager_review_status === "pending" ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <Label htmlFor={`ap-note-${a.id}`}>Note to the investor</Label>
                  <Textarea
                    id={`ap-note-${a.id}`}
                    rows={2}
                    value={notes[a.id] ?? ""}
                    placeholder="Required when sending an application back"
                    onChange={(e) => setNotes((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={decideMutation.isPending || !a.readyForApproval}
                      onClick={() => decideMutation.mutate({ id: a.id, decision: "approved" })}
                    >
                      Approve for funding
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decideMutation.isPending}
                      onClick={() => decideMutation.mutate({ id: a.id, decision: "declined" })}
                    >
                      Send back
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 border-t pt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={decideMutation.isPending}
                    onClick={() => decideMutation.mutate({ id: a.id, decision: "pending" })}
                  >
                    Reopen for review
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
