import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ThirdPartyBadge, ThirdPartyNote } from "@/components/third-party-badge";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getBankingChoiceFn, requestBankSetup, setBankingChoiceFn } from "@/lib/fund-entity.functions";

const BANKS = [
  { value: "texas_capital", label: "Texas Capital Bank" },
  { value: "mercury", label: "Online business bank" },
] as const;
const BANK_LABEL: Record<string, string> = { texas_capital: "Texas Capital Bank", mercury: "Online business bank", customers: "Customers Bank" };

/** Who opens the fund's bank account; if Harmonious, which bank. */
export function BankingChoice({ offeringId, onChanged }: { offeringId: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getBankingChoiceFn);
  const setChoice = useServerFn(setBankingChoiceFn);
  const request = useServerFn(requestBankSetup);
  const key = ["banking-choice", offeringId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { offering_id: offeringId } }) });
  const [bank, setBank] = useState<string>("");
  const [note, setNote] = useState("");

  const choose = useMutation({
    mutationFn: (setup_by: "fund" | "harmonious") => setChoice({ data: { offering_id: offeringId, setup_by } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); onChanged?.(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ask = useMutation({
    mutationFn: () => request({ data: { offering_id: offeringId, bank: bank as any, note } }),
    onSuccess: () => { toast.success(`Harmonious will open the account with ${BANK_LABEL[bank]}.`); setBank(""); setNote(""); qc.invalidateQueries({ queryKey: key }); onChanged?.(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending) return <div className="h-16 animate-pulse rounded-xl bg-muted" />;
  if (q.isError) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const by = q.data.setupBy;
  const open = q.data.requests.filter((r) => r.status !== "cancelled");
  const opt = (on: boolean) => `flex-1 rounded-xl border px-4 py-3 text-left text-sm transition ${on ? "border-primary bg-primary/5 font-medium" : "hover:border-primary"}`;

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">Who is setting up the bank account? <ThirdPartyBadge provider="the bank" /></p>
      <ThirdPartyNote provider="The bank" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className={opt(by === "fund")} disabled={choose.isPending} onClick={() => choose.mutate("fund")}>
          The fund manager<span className="block text-xs font-normal text-muted-foreground">You open the account and add wire instructions.</span>
        </button>
        <button type="button" className={opt(by === "harmonious")} disabled={choose.isPending} onClick={() => choose.mutate("harmonious")}>
          Harmonious<span className="block text-xs font-normal text-muted-foreground">We open it with one of our partner banks.</span>
        </button>
      </div>

      {by === "harmonious" && (
        <div className="space-y-3 rounded-xl border bg-background p-4">
          {open.length > 0 && (
            <ul className="space-y-1 text-sm">
              {open.map((r) => <li key={r.id} className="flex justify-between gap-2"><span>{BANK_LABEL[r.bank] ?? r.bank}</span><span className="text-right text-muted-foreground"><span className="capitalize">{r.status.replace(/_/g, " ")}</span>{r.bank !== "customers" && <span className="block text-xs">{r.einLast4 ? `EIN ••${r.einLast4} added · ready to open` : "Waiting on EIN"}</span>}</span></li>)}
            </ul>
          )}
          <p className="text-sm font-medium">{open.length ? "Request another bank" : "Choose a bank"}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {BANKS.map((b) => <button key={b.value} type="button" className={opt(bank === b.value)} onClick={() => setBank(b.value)}>{b.label}</button>)}
          </div>
          {bank && (
            <>
              <textarea className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm" rows={2} placeholder="Anything we should know (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex justify-end"><Button size="sm" disabled={ask.isPending} onClick={() => ask.mutate()}>{ask.isPending ? "Sending…" : `Request ${BANK_LABEL[bank]} account`}</Button></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
