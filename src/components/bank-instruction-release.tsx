import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fundSetupDetailFn, launchStatusFn, releaseBankingInstructionsFn, updateBankingFn } from "@/lib/fund-setup.functions";
import { BANKING_STATUSES, type BankingStatus } from "@/lib/fund-setup-model";
import { invalidateFund } from "@/lib/fund-query-keys";

const LABELS: Record<BankingStatus, string> = {
  not_started: "Not started", application: "Application recorded", pending: "Pending bank approval",
  approved: "Bank approved", account_active: "Account active",
};
const ACTIONS: Partial<Record<BankingStatus, string>> = {
  application: "Record application", pending: "Record pending bank approval",
  approved: "Record bank approval", account_active: "Mark account active",
};

/** Explicit existing setup actions, never inferred from uploaded bank evidence. */
export function BankInstructionRelease({ offeringId, verified, onChanged }: { offeringId: string; verified: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const loadSetup = useServerFn(launchStatusFn);
  const loadDetail = useServerFn(fundSetupDetailFn);
  const update = useServerFn(updateBankingFn);
  const release = useServerFn(releaseBankingInstructionsFn);
  const [busy, setBusy] = useState(false);
  const setup = useQuery({ queryKey: ["bank-release-setup", offeringId], queryFn: () => loadSetup({ data: { offeringId } }) });
  const setupId = setup.data?.setupId;
  const detail = useQuery({ queryKey: ["bank-release-detail", offeringId, setupId], enabled: !!setupId,
    queryFn: () => { if (!setupId) throw new Error("Fund setup is unavailable."); return loadDetail({ data: { setupId } }); } });
  if (setup.isError || detail.isError) return <p role="alert" className="text-sm text-destructive">{(setup.error ?? detail.error)?.message}</p>;
  if (setup.isPending || (setupId && detail.isPending)) return <p className="text-sm text-muted-foreground">Loading investor release status…</p>;
  if (!setupId || !detail.data?.banking) return <p className="text-sm text-muted-foreground">A fund setup banking record is required before instructions can be released.</p>;
  if (!detail.data.isStaff) return null;
  const b = detail.data.banking;
  const status = b.status as BankingStatus;
  const next = BANKING_STATUSES[BANKING_STATUSES.indexOf(status) + 1];
  const released = status === "account_active" && b.investor_instructions_released === true && verified;
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try { await action(); toast.success(message); await invalidateFund(qc, offeringId); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Banking could not be updated."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">Investor funding instructions</h3><Badge variant={released ? "default" : "outline"}>{released ? "Released to investors" : "Not available to investors"}</Badge></div>
    <p className="text-sm text-muted-foreground">Account status: {LABELS[status] ?? status}</p>
    {!verified && <p className="text-sm text-muted-foreground">Verify the current wire instructions and resolve account ownership before release.</p>}
    {next && <Button size="sm" variant="outline" disabled={busy} onClick={() => {
      if (!window.confirm(`Confirm: ${LABELS[next]}. Only record a status confirmed by the bank.`)) return;
      void run(() => update({ data: { setupId, status: next } }), "Account status updated.");
    }}>{busy ? "Saving…" : ACTIONS[next]}</Button>}
    {status === "account_active" && !released && <Button size="sm" disabled={busy || !verified} onClick={() => {
      if (!window.confirm("Release the current verified wire instructions to eligible investors?")) return;
      void run(() => release({ data: { setupId } }), "Wire instructions released to eligible investors.");
    }}>{busy ? "Releasing…" : "Release instructions to investors"}</Button>}
  </div>;
}