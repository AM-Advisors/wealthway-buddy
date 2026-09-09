import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePlaidLink } from "react-plaid-link";
import { Banknote, Link2Off, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disconnectBank,
  finishBankConnection,
  getBankFeed,
  matchBankTransaction,
  startBankConnection,
  syncBankTransactions,
} from "@/lib/bank-feed.functions";

function when(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function day(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Shows the fund's connected bank account and the deposits arriving in it. */
export function BankFeedPanel({ fundId }: { fundId: string }) {
  const load = useServerFn(getBankFeed);
  const start = useServerFn(startBankConnection);
  const finish = useServerFn(finishBankConnection);
  const sync = useServerFn(syncBankTransactions);
  const match = useServerFn(matchBankTransaction);
  const disconnect = useServerFn(disconnectBank);
  const queryClient = useQueryClient();

  const [linkToken, setLinkToken] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-feed", fundId],
    queryFn: () => load({ data: { fundId } }),
    refetchInterval: 120_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bank-feed", fundId] });

  const onLinkSuccess = useCallback(
    async (publicToken: string) => {
      try {
        const result = await finish({ data: { fundId, publicToken } });
        toast.success(result.message);
        setLinkToken(null);
        refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the connection.");
      }
    },
    [fundId],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => void onLinkSuccess(publicToken),
    onExit: () => setLinkToken(null),
  });

  const beginConnect = useMutation({
    mutationFn: () => start({ data: { fundId } }),
    onSuccess: (result) => setLinkToken(result.linkToken),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not start the bank sign-in."),
  });

  const syncNow = useMutation({
    mutationFn: () => sync({ data: { fundId } }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not refresh the deposits."),
  });

  const setMatch = useMutation({
    mutationFn: (vars: { transactionId: string; applicationId: string | null }) =>
      match({ data: vars }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not record the match."),
  });

  const unlink = useMutation({
    mutationFn: () => disconnect({ data: { fundId } }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not disconnect."),
  });

  if (linkToken && ready) open();

  const account = data?.account ?? null;
  const investors = data?.investors ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4" aria-hidden />
            Money arriving in the bank
          </CardTitle>
          <CardDescription>
            {account
              ? `${account.institution_name ?? "Connected bank"}${account.account_mask ? ` ••${account.account_mask}` : ""}${
                  account.last_synced_at ? ` · last refreshed ${when(account.last_synced_at)}` : ""
                }`
              : "Connect the fund's bank account to see deposits land here automatically."}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {account ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncNow.mutate()}
                disabled={syncNow.isPending}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {syncNow.isPending ? "Refreshing…" : "Refresh"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => unlink.mutate()}
                disabled={unlink.isPending}
              >
                <Link2Off className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => beginConnect.mutate()}
              disabled={beginConnect.isPending || data?.configured === false}
            >
              {beginConnect.isPending ? "Opening…" : "Connect bank account"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.configured === false && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            The bank feed is not switched on yet — the bank service credentials still need to be
            saved.
          </p>
        )}

        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

        {account && data && data.transactions.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No deposits pulled in yet. Press Refresh after a wire has landed.
          </p>
        )}

        {data && data.transactions.length > 0 && (
          <div className="space-y-2">
            {data.transactions.map((t) => (
              <div key={t.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {t.amount} · {t.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {day(t.postedOn)}
                      {t.description ? ` · ${t.description}` : ""}
                    </p>
                  </div>
                  {t.matchedApplicationId ? (
                    <Badge variant="secondary">Matched to {t.matchedName}</Badge>
                  ) : (
                    <Badge variant="outline">Not matched</Badge>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {t.matchedApplicationId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setMatch.mutate({ transactionId: t.id, applicationId: null })
                      }
                      disabled={setMatch.isPending}
                    >
                      Undo match
                    </Button>
                  ) : (
                    <>
                      <select
                        aria-label="Match this deposit to an investor"
                        defaultValue={t.suggestedApplicationId ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value) setMatch.mutate({ transactionId: t.id, applicationId: value });
                        }}
                        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                        disabled={setMatch.isPending || investors.length === 0}
                      >
                        <option value="">
                          {investors.length === 0 ? "No investors awaiting funds" : "Match to…"}
                        </option>
                        {investors.map((i) => (
                          <option key={i.applicationId} value={i.applicationId}>
                            {i.name}
                            {i.expectedCents
                              ? ` — expecting $${(i.expectedCents / 100).toLocaleString("en-US")}`
                              : ""}
                            {i.reference ? ` (${i.reference})` : ""}
                          </option>
                        ))}
                      </select>
                      {t.suggestedName && (
                        <span className="text-muted-foreground text-xs">
                          Looks like {t.suggestedName}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Matching a deposit marks that investor's funding as received and records who confirmed it.
        </p>
      </CardContent>
    </Card>
  );
}
