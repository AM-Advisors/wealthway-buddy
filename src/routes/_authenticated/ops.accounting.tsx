import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRANSACTION_TYPE_LABELS, type CashTransactionType } from "@/lib/reconciliation-model";
import {
  advanceJournalForItem,
  closeAccountingException,
  decideReconciliation,
  getAccountingExceptions,
  getAccountingOperations,
  getPostingRules,
  getReconciliationQueue,
  prepareJournalForItem,
  reverseReconciliationPosting,
} from "@/lib/reconciliation.functions";

const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${Math.abs(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CONFIDENCE_TONE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-900",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-orange-100 text-orange-900",
  unmatched: "bg-rose-100 text-rose-900",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function AccountingOperations() {
  const queryClient = useQueryClient();
  const loadOps = useServerFn(getAccountingOperations);
  const loadQueue = useServerFn(getReconciliationQueue);
  const loadExceptions = useServerFn(getAccountingExceptions);
  const loadRules = useServerFn(getPostingRules);
  const decide = useServerFn(decideReconciliation);
  const prepare = useServerFn(prepareJournalForItem);
  const advance = useServerFn(advanceJournalForItem);
  const reverse = useServerFn(reverseReconciliationPosting);
  const closeException = useServerFn(closeAccountingException);

  const [reasons, setReasons] = useState<Record<string, string>>({});

  const ops = useQuery({ queryKey: ["accounting-ops"], queryFn: () => loadOps({ data: {} }) });
  const queue = useQuery({ queryKey: ["recon-queue"], queryFn: () => loadQueue({ data: {} }) });
  const exceptions = useQuery({
    queryKey: ["accounting-exceptions"],
    queryFn: () => loadExceptions({ data: {} }),
  });
  const rules = useQuery({ queryKey: ["posting-rules"], queryFn: () => loadRules({ data: {} }) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["recon-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["accounting-ops"] });
    void queryClient.invalidateQueries({ queryKey: ["accounting-exceptions"] });
  };

  const act = useMutation({
    mutationFn: async (input: { id: string; kind: string }) => {
      const reason = reasons[input.id] ?? "";
      if (input.kind === "approve") return decide({ data: { id: input.id, action: "approve" } });
      if (input.kind === "reject")
        return decide({ data: { id: input.id, action: "reject", reason } });
      if (input.kind === "leave")
        return decide({ data: { id: input.id, action: "leave_unmatched", reason } });
      if (input.kind === "information")
        return decide({ data: { id: input.id, action: "request_information", message: reason } });
      if (input.kind === "prepare") return prepare({ data: { id: input.id } });
      if (input.kind === "reverse") return reverse({ data: { id: input.id, reason } });
      return advance({ data: { id: input.id, to: input.kind as "reviewed" | "approved" | "posted" } });
    },
    onSuccess: () => {
      toast.success("Saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const o = ops.data;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Accounting operations</h1>
        <p className="text-sm text-muted-foreground">
          Cash arriving from the bank, how it was classified, and what still has to be approved
          before it reaches the books.
        </p>
      </header>

      {o ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cash</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Stat label="Received today" value={money(o.cash.receivedTodayCents)} />
              <Stat label="Sent today" value={money(o.cash.sentTodayCents)} />
              <Stat label="Unmatched" value={o.cash.unmatched} />
              <Stat label="Pending reconciliation" value={o.cash.pendingReconciliation} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reconciliation</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Stat label="Auto-matched" value={o.reconciliation.autoMatched} />
              <Stat label="Needs review" value={o.reconciliation.needsReview} />
              <Stat label="Exceptions" value={o.reconciliation.exceptions} />
              <Stat label="Awaiting manager or client" value={o.reconciliation.awaitingExternal} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Accounting</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Stat label="Draft journals" value={o.accounting.draftJournals} />
              <Stat label="Awaiting approval" value={o.accounting.awaitingApproval} />
              <Stat label="Ready to post" value={o.accounting.readyToPost} />
              <Stat label="Posting exceptions" value={o.accounting.postingExceptions} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Close</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Stat label="Unreconciled cash" value={o.close.unreconciledCash} />
              <Stat label="Unposted journals" value={o.close.unpostedJournals} />
              <Stat label="Open exceptions" value={o.close.openExceptions} />
              <Stat label="Reconciled" value={o.close.reconciledCount} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Reconciliation queue</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
          <TabsTrigger value="rules">Accounting mappings</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4 pt-4">
          {(queue.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting.</p>
          ) : null}
          {(queue.data ?? []).map((item) => (
            <Card key={item.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    {money(item.amountCents)} — {item.counterparty ?? "Bank transaction"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {item.postedOn} · {item.fundName}
                    {item.transactionType
                      ? ` · ${TRANSACTION_TYPE_LABELS[item.transactionType as CashTransactionType]}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={CONFIDENCE_TONE[item.confidence] ?? ""}>{item.confidence}</Badge>
                  <Badge variant="outline">{item.status.replace(/_/g, " ")}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.reasons.length ? (
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {item.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                {item.conflicts.length ? (
                  <ul className="list-disc pl-5 text-sm text-destructive">
                    {item.conflicts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
                {item.approvalRequired !== "none" ? (
                  <p className="text-sm text-muted-foreground">
                    Needs {item.approvalRequired === "client" ? "the client's" : "the fund manager's"}{" "}
                    approval after Harmonious.
                  </p>
                ) : null}
                <Input
                  placeholder="Reason (required to set aside, ask a question or reverse)"
                  value={reasons[item.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  {["auto_matched", "ingested", "information_requested"].includes(item.status) ? (
                    <>
                      <Button size="sm" onClick={() => act.mutate({ id: item.id, kind: "approve" })}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act.mutate({ id: item.id, kind: "information" })}
                      >
                        Request information
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act.mutate({ id: item.id, kind: "leave" })}
                      >
                        Leave unmatched
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => act.mutate({ id: item.id, kind: "reject" })}
                      >
                        Reject match
                      </Button>
                    </>
                  ) : null}
                  {item.status === "reconciled" && !item.journalEntryId ? (
                    <Button size="sm" onClick={() => act.mutate({ id: item.id, kind: "prepare" })}>
                      Prepare journal
                    </Button>
                  ) : null}
                  {item.journalEntryId && item.status !== "posted" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act.mutate({ id: item.id, kind: "reviewed" })}
                      >
                        Mark reviewed
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act.mutate({ id: item.id, kind: "approved" })}
                      >
                        Approve journal
                      </Button>
                      <Button size="sm" onClick={() => act.mutate({ id: item.id, kind: "posted" })}>
                        Post to ledger
                      </Button>
                    </>
                  ) : null}
                  {item.status === "posted" ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => act.mutate({ id: item.id, kind: "reverse" })}
                    >
                      Reverse and correct
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="exceptions" className="space-y-4 pt-4">
          {(exceptions.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No open exceptions.</p>
          ) : null}
          {(exceptions.data ?? []).map((e: any) => (
            <Card key={e.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{String(e.kind).replace(/_/g, " ")}</CardTitle>
                <Badge variant={e.is_material ? "destructive" : "outline"}>
                  {e.is_material ? "material" : "immaterial"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{e.detail ?? "No detail recorded."}</p>
                <Input
                  placeholder="How was this resolved?"
                  value={reasons[e.id] ?? ""}
                  onChange={(r) => setReasons((prev) => ({ ...prev, [e.id]: r.target.value }))}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      closeException({ data: { id: e.id, status: "resolved", note: reasons[e.id] ?? "" } })
                        .then(() => {
                          toast.success("Exception closed.");
                          refresh();
                        })
                        .catch((err: Error) => toast.error(err.message))
                    }
                  >
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      closeException({ data: { id: e.id, status: "waived", note: reasons[e.id] ?? "" } })
                        .then(() => {
                          toast.success("Exception waived.");
                          refresh();
                        })
                        .catch((err: Error) => toast.error(err.message))
                    }
                  >
                    Waive
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="rules" className="space-y-3 pt-4">
          <p className="text-sm text-muted-foreground">
            How each kind of cash is recorded, and who has to approve it. A fund's own mapping always
            beats the platform default, and replacing one keeps the version that produced past
            journals.
          </p>
          {(rules.data ?? []).map((r: any) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
            >
              <div>
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-muted-foreground">
                  Debit {r.debit_account_code} · Credit {r.credit_account_code} · {r.direction} ·
                  version {r.version}
                </p>
              </div>
              <Badge variant="outline">
                {r.approval_required === "none" ? "Harmonious only" : `${r.approval_required.replace("_", " ")} approves`}
              </Badge>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/ops/accounting")({
  head: () => ({
    meta: [
      { title: "Accounting operations — Harmonious" },
      {
        name: "description",
        content:
          "Review matched bank activity, clear exceptions and post approved journals to the fund ledger.",
      },
      { property: "og:title", content: "Accounting operations — Harmonious" },
      {
        property: "og:description",
        content: "Bank cash, reconciliation review and ledger posting in one operations view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountingOperations,
});
