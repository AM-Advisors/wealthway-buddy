import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePlaidLink } from "react-plaid-link";
import { Banknote, Link2Off, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLAID_CONSENT_VERSION } from "@/lib/plaid-consent";
import {
  disconnectClientBankLink,
  finishClientBankLink,
  getClientBankLinking,
  refreshClientBankMatches,
  startClientBankLink,
} from "@/lib/client-bank.functions";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

/** Lets a client link the bank account their fund pays from, so the wires and
 *  ACH payments they send are matched to their invoices without staff typing. */
export function ClientBankLinking() {
  const load = useServerFn(getClientBankLinking);
  const start = useServerFn(startClientBankLink);
  const finish = useServerFn(finishClientBankLink);
  const refreshMatches = useServerFn(refreshClientBankMatches);
  const disconnect = useServerFn(disconnectClientBankLink);
  const queryClient = useQueryClient();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [pendingFund, setPendingFund] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-bank-linking"],
    queryFn: () => load(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["client-bank-linking"] });

  const onLinkSuccess = useCallback(
    async (publicToken: string) => {
      if (!pendingFund) return;
      try {
        const result = await finish({ data: { fundId: pendingFund, publicToken } });
        toast.success(result.message);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the connection.");
      } finally {
        setLinkToken(null);
        setPendingFund(null);
        refresh();
      }
    },
    [pendingFund],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: (publicToken: string | null) => {
      if (publicToken) void onLinkSuccess(publicToken);
    },
    onExit: () => {
      setLinkToken(null);
      setPendingFund(null);
    },
  });

  // Plaid only becomes `ready` a moment after the token arrives, so open the
  // bank sign-in from an effect rather than inside the mutation callback.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const [consentFund, setConsentFund] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const beginLink = useMutation({
    mutationFn: (fundId: string) =>
      start({ data: { fundId, consent: true, policyVersion: PLAID_CONSENT_VERSION } }),
    onSuccess: (result) => {
      setLinkToken(result.linkToken);
    },
    onError: (error) => {
      setPendingFund(null);
      toast.error(error instanceof Error ? error.message : "Could not start the bank sign-in.");
    },
  });

  const refreshFund = useMutation({
    mutationFn: (fundId: string) => refreshMatches({ data: { fundId } }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not check for payments."),
  });

  const unlink = useMutation({
    mutationFn: (fundId: string) => disconnect({ data: { fundId } }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not disconnect the account."),
  });

  const funds = (data?.funds ?? []) as any[];

  return (
    <div className="space-y-6">
      <Dialog open={Boolean(consentFund)} onOpenChange={(o) => !o && setConsentFund(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Before you connect your bank</DialogTitle>
            <DialogDescription>
              Harmonious uses Plaid to connect your account securely. Your bank login goes
              straight to Plaid and your bank. We never see it.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>We receive account details, balances and deposits to match your payments.</li>
            <li>We never move money from this account, and we never sell your data.</li>
            <li>You can disconnect at any time and ask us to delete the data.</li>
          </ul>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={consentChecked}
              onCheckedChange={(v) => setConsentChecked(v === true)}
              aria-label="I agree"
            />
            <span>
              I agree to share my bank account information with Harmonious through Plaid, as
              described in the{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">
                Harmonious Privacy Policy
              </a>{" "}
              and{" "}
              <a
                href="https://plaid.com/legal/#end-user-privacy-policy"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Plaid End User Privacy Policy
              </a>
              .
            </span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsentFund(null)}>
              Cancel
            </Button>
            <Button
              disabled={!consentChecked || beginLink.isPending}
              onClick={() => {
                const id = consentFund!;
                setConsentFund(null);
                setPendingFund(id);
                beginLink.mutate(id);
              }}
            >
              Agree and continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank accounts</CardTitle>
          <CardDescription>
            Link the account your fund pays from and the wires or ACH payments you send are matched
            to your invoices automatically - you no longer wait for someone at Harmonious to record
            them by hand. Harmonious never moves money from a linked account; it only reads the
            deposits so payments can be recognized.
          </CardDescription>
        </CardHeader>

        {data && !data.configured && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Bank linking isn't switched on for this portal yet. Your Harmonious contact can enable
              it, until then, keep reporting each payment on the invoice and we will match it.
            </p>
          </CardContent>
        )}
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your funds…</p>
      ) : funds.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No funds yet</CardTitle>
            <CardDescription>
              Once your fund details are accepted, you can link its bank account here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        funds.map((fund) => (
          <Card key={fund.id}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{fund.name}</CardTitle>
                <CardDescription>
                  {fund.linked
                    ? `${fund.institution ?? "Bank"}${fund.mask ? ` ••••${fund.mask}` : ""}${
                        fund.lastSyncedAt ? ` - last checked ${when(fund.lastSyncedAt)}` : ""
                      }`
                    : "No bank account linked. Payments are matched by Harmonious by hand."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {fund.linked ? (
                  <>
                    <Badge variant="secondary">Linked</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refreshFund.mutate(fund.id)}
                      disabled={refreshFund.isPending}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" /> Check for payments
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unlink.mutate(fund.id)}
                      disabled={unlink.isPending}
                    >
                      <Link2Off className="mr-2 h-4 w-4" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setConsentChecked(false);
                      setConsentFund(fund.id);
                    }}
                    disabled={!data?.configured || beginLink.isPending}
                  >
                    <Banknote className="mr-2 h-4 w-4" /> Link bank account
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {fund.awaitingMatch > 0
                  ? `${fund.awaitingMatch} payment${fund.awaitingMatch === 1 ? "" : "s"} you reported ${
                      fund.awaitingMatch === 1 ? "is" : "are"
                    } waiting to be matched to a deposit.`
                  : `${fund.openInvoices} invoice${fund.openInvoices === 1 ? "" : "s"} open on this fund.`}
              </p>

              {fund.recentDeposits.length > 0 && (
                <ul className="divide-y rounded-md border text-sm">
                  {fund.recentDeposits.map((deposit: any) => (
                    <li
                      key={deposit.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{deposit.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {day(deposit.postedOn)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span>{money(deposit.amountCents)}</span>
                        <Badge variant={deposit.matched ? "secondary" : "outline"}>
                          {deposit.matched ? "Matched" : "Unmatched"}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
