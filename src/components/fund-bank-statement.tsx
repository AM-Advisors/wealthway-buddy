import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getFundBankStatement,
  matchBankLineToInvoice,
  unmatchBankLineFromInvoice,
} from "@/lib/fund-bank-reconciliation.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function money(cents?: number | null) {
  return (Number(cents ?? 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** The fund's real bank lines, matched against the fee invoices they settle. */
export function FundBankStatement({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getFundBankStatement);
  const match = useServerFn(matchBankLineToInvoice);
  const unmatch = useServerFn(unmatchBankLineFromInvoice);
  const [choice, setChoice] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-bank-statement", fundId],
    queryFn: () => load({ data: { offeringId: fundId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fund-bank-statement", fundId] });
    qc.invalidateQueries({ queryKey: ["fund-billing", fundId] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["bank-feed", fundId] });
  };

  const matchMut = useMutation({
    mutationFn: (vars: { transactionId: string; invoiceId: string }) => match({ data: vars }),
    onSuccess: (r: any) => {
      toast.success(r?.message ?? "Matched.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unmatchMut = useMutation({
    mutationFn: (transactionId: string) => unmatch({ data: { transactionId } }),
    onSuccess: (r: any) => {
      toast.success(r?.message ?? "Match removed.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const body = () => {
    if (isLoading) return <p className="text-sm text-muted-foreground">Loading the bank statement…</p>;
    if (error) {
      return (
        <p className="text-sm text-destructive">{(error as Error).message || "That didn't load."}</p>
      );
    }
    if (!data) return null;
    if (!data.configured) {
      return (
        <p className="text-sm text-muted-foreground">
          The bank feed is not switched on yet, so payments can't be checked against the fund's
          account.
        </p>
      );
    }
    if (!data.connected) {
      return (
        <p className="text-sm text-muted-foreground">
          This fund's bank account isn't linked yet. Link it from the fund's banking section, then
          deposits will show here next to the invoices they pay.
        </p>
      );
    }
    if (!data.lines.length) {
      return (
        <p className="text-sm text-muted-foreground">
          No activity on the account yet. Refresh the bank feed on the fund's banking section to pull
          in the latest deposits.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {data.lines.map((line) => {
          const picked = choice[line.id] ?? line.suggestedInvoiceId ?? "";
          return (
            <div key={line.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {money(line.amountCents)} · {line.name || "Deposit"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Posted {line.postedOn}
                    {line.description ? ` · ${line.description}` : ""}
                  </p>
                  {line.declaredMethod ? (
                    <p className="text-xs text-muted-foreground">
                      Client said they sent this by {line.declaredMethod === "ach" ? "ACH" : "wire"}
                      {line.declaredPaidOn ? ` on ${line.declaredPaidOn}` : ""}
                      {line.declaredReference ? ` · reference ${line.declaredReference}` : ""}
                    </p>
                  ) : null}
                </div>
                {line.matchedInvoiceId ? (
                  <Badge>Pays {line.matchedInvoiceNumber}</Badge>
                ) : line.matchedApplicationId ? (
                  <Badge variant="secondary">Investor funding</Badge>
                ) : (
                  <Badge variant="outline">Not matched</Badge>
                )}
              </div>

              {line.matchedInvoiceId ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Recorded as paid{line.matchedAt ? ` on ${new Date(line.matchedAt).toLocaleString()}` : ""}
                  </span>
                  {data.canMatch ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={unmatchMut.isPending}
                      onClick={() => unmatchMut.mutate(line.id)}
                    >
                      Undo match
                    </Button>
                  ) : null}
                </div>
              ) : line.matchedApplicationId ? null : data.canMatch ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select
                    value={picked}
                    onValueChange={(v) => setChoice((c) => ({ ...c, [line.id]: v }))}
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Match to an invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.openInvoices.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No invoices awaiting payment
                        </SelectItem>
                      ) : (
                        data.openInvoices.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.number} · {money(inv.totalCents)}
                            {inv.dueDate ? ` · due ${inv.dueDate}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!picked || picked === "none" || matchMut.isPending}
                    onClick={() =>
                      matchMut.mutate({ transactionId: line.id, invoiceId: picked })
                    }
                  >
                    Record as paid
                  </Button>
                  {line.suggestedInvoiceNumber && !choice[line.id] ? (
                    <span className="text-xs text-muted-foreground">
                      Looks like {line.suggestedInvoiceNumber}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Matching a deposit to an invoice needs contract authority.
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bank statement</CardTitle>
        <CardDescription>
          Deposits on the fund's own account
          {data?.account
            ? ` — ${data.account.institution_name ?? "Bank"} ${data.account.account_mask ? `••${data.account.account_mask}` : ""}`
            : ""}
          . Payments clients report from their portal are matched to the invoice on their own when
          the amount and the reference or date agree; anything else is matched here by hand.
          {data && data.autoMatched > 0
            ? ` ${data.autoMatched} payment${data.autoMatched === 1 ? " was" : "s were"} matched just now.`
            : ""}
          {data && (data.autoMatchedWires ?? 0) > 0
            ? ` ${data.autoMatchedWires} wire${data.autoMatchedWires === 1 ? " was" : "s were"} settled automatically.`
            : ""}
          {data && data.awaitingArrival.length > 0
            ? ` ${data.awaitingArrival.length} reported payment${data.awaitingArrival.length === 1 ? " has" : "s have"} not landed yet.`
            : ""}
          {data && data.unreconciledCount > 0
            ? ` ${data.unreconciledCount} line${data.unreconciledCount === 1 ? "" : "s"} still unmatched.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>{body()}</CardContent>
    </Card>
  );
}
