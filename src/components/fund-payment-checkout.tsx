import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFundPayment, quoteFundPayment, startFundPayment } from "@/lib/fund-payments.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type Target = Parameters<typeof quoteFundPayment>[0]["data"];

/** Shows what is due, takes the card payment, and calls onPaid once the payment is confirmed. */
export function useFundPayment(target: Target | null) {
  const quoteFn = useServerFn(quoteFundPayment);
  const q = useQuery({
    queryKey: ["fund-payment-quote", target],
    queryFn: () => quoteFn({ data: target as Target }),
    enabled: !!target,
  });
  return q;
}

export function PaymentSummary({ items, total }: { items: { key: string; name: string; cents: number; source: string }[]; total: number }) {
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      {items.map((i) => (
        <div key={i.key} className="flex justify-between gap-3">
          <span>{i.name}{i.source === "sow" ? <span className="ml-1 text-xs text-muted-foreground">(your agreed price)</span> : null}</span>
          <span>{i.cents ? usd(i.cents) : "Included"}</span>
        </div>
      ))}
      <div className="flex justify-between border-t pt-1 font-medium"><span>Due now</span><span>{usd(total)}</span></div>
    </div>
  );
}

export function FundPaymentDialog({ open, onOpenChange, target, onPaid }: {
  open: boolean; onOpenChange: (v: boolean) => void; target: Target; onPaid: (paymentId: string) => void;
}) {
  const start = useServerFn(startFundPayment);
  const status = useServerFn(getFundPayment);
  const [confirming, setConfirming] = useState(false);
  const paymentId = useRef<string | null>(null);

  const options = useMemo(() => ({
    fetchClientSecret: async () => {
      const r = await start({ data: { target, environment: getStripeEnvironment(), returnUrl: window.location.href } });
      if ("error" in r) { toast.error(r.error); throw new Error(r.error); }
      paymentId.current = r.paymentId;
      return r.clientSecret;
    },
    onComplete: async () => {
      setConfirming(true);
      for (let i = 0; i < 30 && paymentId.current; i++) {
        const p = await status({ data: { id: paymentId.current } });
        if (p?.status === "paid") { setConfirming(false); onPaid(paymentId.current); return; }
        await new Promise((res) => setTimeout(res, 2000));
      }
      setConfirming(false);
      toast.error("Payment is still being confirmed. Please wait a minute and try sending again.");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
          <DialogDescription>Your request is sent to Harmonious as soon as the payment is confirmed.</DialogDescription>
        </DialogHeader>
        {confirming ? (
          <div className="flex items-center gap-2 py-8 text-sm"><Loader2 className="size-4 animate-spin" />Confirming payment...</div>
        ) : open ? (
          <EmbeddedCheckoutProvider stripe={getStripe()} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}
