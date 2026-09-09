import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { decideWireAsReviewer, getWireConfirmationBoard } from "@/lib/manager.functions";

export const Route = createFileRoute("/_authenticated/manager/wires")({
  head: () => ({
    meta: [
      { title: "Wire Review Board — Harmonious Manager" },
      {
        name: "description",
        content:
          "Every wire confirmation your investors submit, with one-click approve or send back and the current funding status.",
      },
      { property: "og:title", content: "Wire Review Board — Harmonious Manager" },
      {
        property: "og:description",
        content: "Approve or send back investor wire confirmations in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerWireBoardPage,
});

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return (Number(cents) / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function day(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

const FUNDING_LABEL: Record<string, string> = {
  not_started: "Not started",
  awaiting_wire: "Waiting on the wire",
  processing: "In transit",
  settled: "Funds received",
  failed: "Failed",
  returned: "Returned",
  cancelled: "Cancelled",
};

function FundingBadge({ status, confirmedAt }: { status: string; confirmedAt: string | null }) {
  const label = FUNDING_LABEL[status] ?? status;
  if (status === "settled" || confirmedAt) return <Badge>{label}</Badge>;
  if (status === "failed" || status === "returned" || status === "cancelled")
    return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge>Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Sent back</Badge>;
  return <Badge variant="secondary">Waiting on you</Badge>;
}

function ManagerWireBoardPage() {
  const queryClient = useQueryClient();
  const loadBoard = useServerFn(getWireConfirmationBoard);
  const decide = useServerFn(decideWireAsReviewer);

  const [fund, setFund] = useState("all");
  const [status, setStatus] = useState("submitted");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["manager-wire-board"],
    queryFn: () => loadBoard(),
    refetchInterval: 60_000,
  });

  const decideMutation = useMutation({
    mutationFn: (input: {
      applicationId: string;
      confirmationId: string;
      outcome: "approved" | "rejected";
      notes?: string;
    }) => decide({ data: input }),
    onSuccess: (_result, input) => {
      toast.success(
        input.outcome === "approved"
          ? "Approved — the investor's funding is marked received."
          : "Sent back to the investor with your note.",
      );
      setNotes((prev) => ({ ...prev, [input.confirmationId]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["manager-wire-board"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not save that decision.");
    },
    onSettled: () => setBusy(null),
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const term = search.trim().toLowerCase();
    return all.filter((row: any) => {
      if (fund !== "all" && row.fundId !== fund) return false;
      if (status !== "all" && row.status !== status) return false;
      if (!term) return true;
      return [row.investorName, row.investorEmail, row.fundName, row.bankReference, row.referenceCode]
        .filter(Boolean)
        .some((value: string) => value.toLowerCase().includes(term));
    });
  }, [data, fund, status, search]);

  const totals = data?.totals;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Wire review board</h1>
          <p className="text-muted-foreground text-sm">
            Every wire an investor says they have sent. Approve it to mark the money received, or
            send it back with a note.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manager">Back to panel</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Waiting on you</CardDescription>
            <CardTitle className="text-2xl">{totals?.waiting ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {money(totals?.waitingCents ?? 0)} to review
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved</CardDescription>
            <CardTitle className="text-2xl">{totals?.approved ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {money(totals?.approvedCents ?? 0)} confirmed
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sent back</CardDescription>
            <CardTitle className="text-2xl">{totals?.sentBack ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Waiting on the investor to correct
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={fund} onValueChange={setFund}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All funds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All funds</SelectItem>
            {(data?.funds ?? []).map((f: any) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="submitted">Waiting on you</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Sent back</SelectItem>
            <SelectItem value="all">All submissions</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search investor, fund or reference"
          className="w-64"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading submissions…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No wire confirmations match this view yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row: any) => {
            const pending = row.status === "submitted";
            const rowBusy = busy === row.confirmationId;
            return (
              <Card key={row.confirmationId}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {row.investorName} — {money(row.amountCents)}
                      </CardTitle>
                      <CardDescription>
                        {row.fundName}
                        {row.investorEmail ? ` · ${row.investorEmail}` : ""}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.status} />
                      <FundingBadge status={row.fundingStatus} confirmedAt={row.bankConfirmedAt} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground text-xs">Sent on</p>
                      <p>{day(row.sentOn)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Sending bank</p>
                      <p>
                        {row.bankName}
                        {row.last4 ? ` ••${row.last4}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Reference</p>
                      <p>{row.bankReference || row.referenceCode || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Committed</p>
                      <p>{money(row.commitmentCents)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Submitted</p>
                      <p>{when(row.submittedAt)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Bank confirmed</p>
                      <p>{when(row.bankConfirmedAt)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Method</p>
                      <p className="uppercase">{row.method ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Decided</p>
                      <p>
                        {row.reviewedAt
                          ? `${when(row.reviewedAt)}${row.reviewedBy ? ` · ${row.reviewedBy}` : ""}`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {row.investorNote ? (
                    <p className="bg-muted/40 rounded-md p-3 text-sm">
                      <span className="text-muted-foreground">Investor note: </span>
                      {row.investorNote}
                    </p>
                  ) : null}
                  {row.reviewNotes ? (
                    <p className="bg-muted/40 rounded-md p-3 text-sm">
                      <span className="text-muted-foreground">Your note: </span>
                      {row.reviewNotes}
                    </p>
                  ) : null}

                  {pending ? (
                    <div className="space-y-2">
                      <Textarea
                        value={notes[row.confirmationId] ?? ""}
                        onChange={(event) =>
                          setNotes((prev) => ({ ...prev, [row.confirmationId]: event.target.value }))
                        }
                        placeholder="Reason, required when sending it back"
                        rows={2}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={rowBusy}
                          onClick={() => {
                            setBusy(row.confirmationId);
                            decideMutation.mutate({
                              applicationId: row.applicationId,
                              confirmationId: row.confirmationId,
                              outcome: "approved",
                              notes: notes[row.confirmationId]?.trim() || "",
                            });
                          }}
                        >
                          Approve — funds received
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={rowBusy}
                          onClick={() => {
                            const note = notes[row.confirmationId]?.trim();
                            if (!note) {
                              toast.error("Add a short reason so the investor knows what to fix.");
                              return;
                            }
                            setBusy(row.confirmationId);
                            decideMutation.mutate({
                              applicationId: row.applicationId,
                              confirmationId: row.confirmationId,
                              outcome: "rejected",
                              notes: note,
                            });
                          }}
                        >
                          Send back
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to="/manager/$applicationId"
                            params={{ applicationId: row.applicationId }}
                          >
                            Open investor file
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to="/manager/$applicationId"
                        params={{ applicationId: row.applicationId }}
                      >
                        Open investor file
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
