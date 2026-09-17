import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TRANSACTION_TYPE_LABELS, type CashTransactionType } from "@/lib/reconciliation-model";
import {
  approveReconciliationAsParty,
  getMyReconciliationApprovals,
} from "@/lib/reconciliation.functions";

const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${Math.abs(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CashApprovals() {
  const queryClient = useQueryClient();
  const load = useServerFn(getMyReconciliationApprovals);
  const decide = useServerFn(approveReconciliationAsParty);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const items = useQuery({ queryKey: ["cash-approvals"], queryFn: () => load({}) });

  const respond = (id: string, decision: "approve" | "reject") =>
    decide({ data: { id, decision, reason: reasons[id] ?? "" } })
      .then(() => {
        toast.success(decision === "approve" ? "Approved." : "Sent back.");
        void queryClient.invalidateQueries({ queryKey: ["cash-approvals"] });
      })
      .catch((error: Error) => toast.error(error.message));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Cash to confirm</h1>
        <p className="text-sm text-muted-foreground">
          Bank activity Harmonious has reviewed that needs your confirmation before it is recorded in
          the books.
        </p>
      </header>

      {(items.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting on you.</p>
      ) : null}

      {(items.data ?? []).map((item) => (
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
            <Badge variant="outline">Awaiting your approval</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {item.reasons.length ? (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {item.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            {item.correctionReason ? (
              <p className="text-sm text-muted-foreground">
                Changed by Harmonious: {item.correctionReason}
              </p>
            ) : null}
            <Input
              placeholder="Reason, if you are sending this back"
              value={reasons[item.id] ?? ""}
              onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => respond(item.id, "approve")}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => respond(item.id, "reject")}>
                Send back
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/manager/cash-approvals")({
  head: () => ({
    meta: [
      { title: "Cash to confirm — Harmonious" },
      {
        name: "description",
        content: "Confirm the bank activity Harmonious has matched to your fund before it is booked.",
      },
      { property: "og:title", content: "Cash to confirm — Harmonious" },
      {
        property: "og:description",
        content: "Approve or send back matched bank activity for the funds you manage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashApprovals,
});
