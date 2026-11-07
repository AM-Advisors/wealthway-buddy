import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recordManualReceiptFn } from "@/lib/investor-onboarding.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prettyStatus } from "@/lib/status";

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);

/** Staff-only: record money received for this investment without loading a bank statement. */
export function ManualReceiptCard({ onboardingId }: { onboardingId: string }) {
  const record = useServerFn(recordManualReceiptFn);
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);

  const submit = async () => {
    if (!(cents > 0)) { toast.error("Enter the amount received."); return; }
    if (!window.confirm(`Record ${usd(cents)} received on ${receivedOn}? This is added to the investor's record and cannot be edited later.`)) return;
    setBusy(true);
    try {
      const r = await record({ data: { onboardingId, amountCents: cents, receivedOn, reference, note: note || null } });
      toast.success(`Recorded. ${usd(r.fundedAmountCents)} of ${usd(r.expectedAmountCents)} received · ${prettyStatus(r.fundingStatus)}`);
      setAmount(""); setReference(""); setNote("");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Record money received</CardTitle>
        <CardDescription>Mark this investor's money as received without loading a bank statement. Each entry is kept in the history; nothing is moved.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="mr-amount">Amount received (USD)</Label><Input id="mr-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100,000" /></div>
        <div className="space-y-1"><Label htmlFor="mr-date">Date received</Label><Input id="mr-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="mr-ref">Wire or check reference</Label><Input id="mr-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="mr-note">Note (optional)</Label><Input id="mr-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="sm:col-span-2"><Button onClick={submit} disabled={busy || !(cents > 0) || reference.trim().length < 2}>{busy ? "Recording…" : "Record money received"}</Button></div>
      </CardContent>
    </Card>
  );
}
