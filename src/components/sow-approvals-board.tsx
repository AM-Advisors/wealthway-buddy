import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { decideSowApproval, listSowApprovals } from "@/lib/contracts.functions";

type Row = {
  id: string;
  clientName: string;
  title: string;
  sowType: string;
  status: string;
  effectiveDate: string | null;
  signedBy: string | null;
  signedOn: string | null;
  fundName: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  approvalNote: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  signed: boolean;
  clientStatus: "pending" | "signed" | "sent_back";
  clientSignatureName: string | null;
  clientSignatureTitle: string | null;
  clientSignedAt: string | null;
  clientSentBackReason: string | null;
  clientSentBackAt: string | null;
  hasDocument: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysWaiting(signedOn: string | null) {
  if (!signedOn) return null;
  const days = Math.floor((Date.now() - new Date(signedOn).getTime()) / 86_400_000);
  return days < 0 ? 0 : days;
}

export function SowApprovalsBoard() {
  const load = useServerFn(listSowApprovals);
  const decide = useServerFn(decideSowApproval);
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["sow-approvals"],
    queryFn: () => load(),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "rejected" | "pending"; note: string }) =>
      decide({ data: { id: input.id, decision: input.decision, note: input.note } }),
    onSuccess: (_r, input) => {
      toast.success(
        input.decision === "approved"
          ? "Statement of work approved."
          : input.decision === "rejected"
            ? "Statement of work rejected."
            : "Sent back to waiting.",
      );
      setNotes((prev) => ({ ...prev, [input.id]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["sow-approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["pricing-board"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "That change could not be saved."),
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading approvals…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-muted-foreground">
        {(query.error as any)?.message ?? "This area isn't available to you."}
      </p>
    );
  }

  const data = query.data as { canDecide: boolean; rows: Row[] };
  const waiting = data.rows.filter(
    (r) => r.approvalStatus === "pending" && r.signed && r.clientStatus === "signed",
  );
  const sentBack = data.rows.filter(
    (r) => r.approvalStatus === "pending" && r.clientStatus === "sent_back",
  );
  const unsigned = data.rows.filter(
    (r) =>
      r.approvalStatus === "pending" &&
      r.clientStatus !== "sent_back" &&
      (!r.signed || r.clientStatus !== "signed"),
  );
  const approved = data.rows.filter((r) => r.approvalStatus === "approved");
  const rejected = data.rows.filter((r) => r.approvalStatus === "rejected");

  const line = (row: Row) => (
    <div className="space-y-1">
      <p className="font-medium">
        {row.clientName} · {row.title}
      </p>
      <p className="text-xs text-muted-foreground">
        {row.sowType} · {row.status}
        {row.fundName ? ` · ${row.fundName}` : ""} · effective {formatDate(row.effectiveDate)}
      </p>
      <p className="text-xs text-muted-foreground">
        {row.signed
          ? `Signed by ${row.signedBy} on ${formatDate(row.signedOn)}`
          : "No client signature recorded"}
      </p>
      <p className="text-xs text-muted-foreground">
        {row.clientStatus === "signed"
          ? `Signed in the client portal by ${row.clientSignatureName ?? "the client"}${row.clientSignatureTitle ? `, ${row.clientSignatureTitle}` : ""} on ${formatDate(row.clientSignedAt)}`
          : row.clientStatus === "sent_back"
            ? `Sent back by the client on ${formatDate(row.clientSentBackAt)}`
            : "Not yet signed in the client portal"}
        {row.hasDocument ? " · document attached" : " · no document uploaded"}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Awaiting approval</CardTitle>
            <Badge variant={waiting.length ? "destructive" : "secondary"}>{waiting.length}</Badge>
          </div>
          <CardDescription>
            Signed agreements waiting on an administrator. A fund cannot be created and services
            cannot be switched on under an agreement until it is approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {waiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting for approval.</p>
          ) : (
            waiting
              .slice()
              .sort((a, b) => (a.signedOn ?? "").localeCompare(b.signedOn ?? ""))
              .map((row) => {
                const days = daysWaiting(row.signedOn);
                return (
                  <div key={row.id} className="space-y-3 rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      {line(row)}
                      {days === null ? null : (
                        <Badge variant={days > 7 ? "destructive" : "secondary"}>
                          {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} waiting`}
                        </Badge>
                      )}
                    </div>
                    {data.canDecide ? (
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          placeholder="Note (required to reject)"
                          value={notes[row.id] ?? ""}
                          onChange={(e) =>
                            setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={mutation.isPending}
                            onClick={() =>
                              mutation.mutate({
                                id: row.id,
                                decision: "approved",
                                note: notes[row.id] ?? "",
                              })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={mutation.isPending}
                            onClick={() =>
                              mutation.mutate({
                                id: row.id,
                                decision: "rejected",
                                note: notes[row.id] ?? "",
                              })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Only an administrator can approve or reject.
                      </p>
                    )}
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>

      {unsigned.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Not ready for approval</CardTitle>
            <CardDescription>
              These agreements have no recorded client signature yet, so they cannot be approved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unsigned.map((row) => (
              <div key={row.id} className="rounded-md border p-3 text-sm">
                {line(row)}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Approved</CardTitle>
            <Badge variant="secondary">{approved.length}</Badge>
          </div>
          <CardDescription>Cleared for funds, services and invoicing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {approved.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approvals recorded yet.</p>
          ) : (
            approved.map((row) => (
              <div key={row.id} className="space-y-2 rounded-md border p-3 text-sm">
                {line(row)}
                <p className="text-xs text-muted-foreground">
                  Approved {formatDate(row.approvedAt)}
                  {row.approvedByName ? ` by ${row.approvedByName}` : ""}
                  {row.approvalNote ? ` · ${row.approvalNote}` : ""}
                </p>
                {data.canDecide ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: row.id, decision: "pending", note: "" })}
                  >
                    Send back for review
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Rejected</CardTitle>
            <Badge variant="secondary">{rejected.length}</Badge>
          </div>
          <CardDescription>What has to change before these can be used.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rejected.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has been rejected.</p>
          ) : (
            rejected.map((row) => (
              <div key={row.id} className="space-y-2 rounded-md border p-3 text-sm">
                {line(row)}
                <p className="text-xs text-muted-foreground">
                  Rejected {formatDate(row.approvedAt)}
                  {row.approvedByName ? ` by ${row.approvedByName}` : ""} ·{" "}
                  {row.approvalNote ?? "No reason recorded"}
                </p>
                {data.canDecide ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: row.id, decision: "pending", note: "" })}
                  >
                    Send back for review
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
