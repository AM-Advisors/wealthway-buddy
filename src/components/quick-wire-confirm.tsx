import { useState } from "react";

import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { submitWireConfirmation } from "@/lib/funding.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * One-click wire confirmation for the investor portal: everything we already
 * know is prefilled, so the investor only fills what we cannot know.
 */
export function QuickWireConfirm({
  commitmentCents,
  lastBankName,
  lastAccountLast4,
}: {
  commitmentCents?: number | null;
  lastBankName?: string | null;
  lastAccountLast4?: string | null;
}) {
  const submit = useServerFn(submitWireConfirmation);
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState(
    commitmentCents ? String(Math.round(commitmentCents / 100)) : "",
  );
  const [sentOn, setSentOn] = useState(today());
  const [bank, setBank] = useState(lastBankName ?? "");
  const [last4, setLast4] = useState(lastAccountLast4 ?? "");
  const [busy, setBusy] = useState(false);

  const ready = amount.trim() !== "" && bank.trim().length >= 2 && /^\d{4}$/.test(last4.trim());

  async function confirm() {
    setBusy(true);
    try {
      await submit({
        data: {
          sent_on: sentOn,
          amount: amount.trim(),
          sending_bank_name: bank.trim(),
          sending_account_last4: last4.trim(),
          bank_reference: "",
          investor_note: "",
          confirm_accurate: true,
        },
      });
      toast.success("Wire confirmed — we'll review it and update your status.");
      await queryClient.invalidateQueries({ queryKey: ["funding"] });
      await queryClient.invalidateQueries({ queryKey: ["portal"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit your wire confirmation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-4">
      <p className="font-medium">Sent your wire? Confirm it here</p>
      <p className="mt-1 text-sm text-muted-foreground">
        We&apos;ve prefilled what we know. Check it, then confirm in one click.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="quick-amount">Amount sent (USD)</Label>
          <Input
            id="quick-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quick-date">Date sent</Label>
          <Input
            id="quick-date"
            type="date"
            value={sentOn}
            onChange={(e) => setSentOn(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quick-bank">Sending bank</Label>
          <Input
            id="quick-bank"
            value={bank}
            maxLength={160}
            onChange={(e) => setBank(e.target.value)}
            placeholder="First National Bank"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quick-last4">Last 4 of sending account</Label>
          <Input
            id="quick-last4"
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="1234"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={confirm} disabled={!ready || busy}>
          {busy ? "Confirming…" : "Confirm wire sent"}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/wire-confirmation">Add a reference or note</Link>
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        By confirming you certify these wire details are accurate to the best of your knowledge.
      </p>
    </div>
  );
}
