import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { finishInvestorBankVerifyFn, investorBankVerifyStatusFn, startInvestorBankVerifyFn } from "@/lib/investor-bank-verify.functions";

/** Investor confirms the bank they'll send from is real and in their name. Read-only; no money moves. */
export function InvestorBankVerify({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const start = useServerFn(startInvestorBankVerifyFn);
  const finish = useServerFn(finishInvestorBankVerifyFn);
  const statusFn = useServerFn(investorBankVerifyStatusFn);
  const key = ["investor-bank-verify", onboardingId];
  const q = useQuery({ queryKey: key, queryFn: () => statusFn({ data: { onboardingId } }) });
  const [token, setToken] = useState<string | null>(null);

  const done = useMutation({
    mutationFn: (publicToken: string) => finish({ data: { onboardingId, publicToken } }),
    onSuccess: (r) => {
      toast[r.status === "verified" ? "success" : "error"](r.status === "verified" ? "Bank account verified." : "The bank account name doesn't match the investing party.");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not verify the bank."),
    onSettled: () => setToken(null),
  });
  const { open, ready } = usePlaidLink({ token: token ?? "", onSuccess: (t) => done.mutate(t), onExit: () => setToken(null) });
  const begin = useMutation({
    mutationFn: () => start({ data: { onboardingId } }),
    onSuccess: (r) => setToken(r.linkToken),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not start bank sign-in."),
  });
  if (token && ready) queueMicrotask(() => open());

  const v = q.data;
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">Verify the bank you&apos;ll send from</p>
      {v?.status === "verified" ? (
        <p className="text-muted-foreground">Verified: {v.institution_name ?? "Bank"} account ending {v.account_mask ?? "-"}.</p>
      ) : (
        <>
          {v?.status === "name_mismatch" && <p className="text-destructive">The last account you linked isn&apos;t in the investing party&apos;s name. Link an account in that name, or contact the fund team.</p>}
          <p className="text-muted-foreground">Sign in to your bank securely through Plaid to confirm the account is yours. Harmonious only keeps the result, never your account number, and never takes money from it.</p>
          <Button size="sm" variant="outline" disabled={begin.isPending || done.isPending} onClick={() => begin.mutate()}>{done.isPending ? "Checking…" : "Verify my bank"}</Button>
        </>
      )}
    </div>
  );
}
