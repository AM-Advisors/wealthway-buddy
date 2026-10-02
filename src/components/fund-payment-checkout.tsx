import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CreditCard, Landmark, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFundPayment, quoteFundPayment, startFundPayment, startOfflineFundPayment } from "@/lib/fund-payments.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type Target = { kind: "new_fund_request"; clientId: string; request: Record<string, any> } | { kind: "service_request"; clientId?: string; answers: Record<string, string>; serviceKeys: string[]; offeringId?: string | null };

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
  const startOffline = useServerFn(startOfflineFundPayment);
  const status = useServerFn(getFundPayment);
  const [method, setMethod] = useState<"card" | "wire" | "ach" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [offline, setOffline] = useState<{ paymentId: string; reference: string; totalCents: number } | null>(null);
  const [busy, setBusy] = useState(false);
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

  const chooseOffline = async (m: "wire" | "ach") => {
    setBusy(true);
    const r = await startOffline({ data: { target, method: m } });
    setBusy(false);
    if ("error" in r) { toast.error(r.error); return; }
    setOffline(r);
  };

  const close = (v: boolean) => { if (!v) { setMethod(null); setOffline(null); } onOpenChange(v); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
          <DialogDescription>Choose how you'd like to pay. Your request is sent to Harmonious once you confirm.</DialogDescription>
        </DialogHeader>
        {offline ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <p className="font-medium">Reference: {offline.reference}</p>
              <p className="text-muted-foreground">
                Harmonious will email you the {offline.method === "wire" ? "wire" : "ACH"} instructions. Quote this reference
                when you send {usd(offline.totalCents)}. Your request is sent now, but nothing is activated until
                Harmonious confirms the payment has been received.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => onPaid(offline.paymentId)}>Send request</Button>
              <Button variant="ghost" onClick={() => setOffline(null)}>Back</Button>
            </div>
          </div>
        ) : confirming ? (
          <div className="flex items-center gap-2 py-8 text-sm"><Loader2 className="size-4 animate-spin" />Confirming payment...</div>
        ) : method === "card" && open ? (
          <>
            <EmbeddedCheckoutProvider stripe={getStripe()} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider>
            <Button variant="ghost" size="sm" onClick={() => setMethod(null)}>Back</Button>
          </>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="outline" className="h-auto flex-col gap-1 py-4" onClick={() => setMethod("card")}>
              <CreditCard className="size-5" />Card<span className="text-xs font-normal text-muted-foreground">Confirmed right away</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-1 py-4" disabled={busy} onClick={() => chooseOffline("wire")}>
              <Landmark className="size-5" />Wire<span className="text-xs font-normal text-muted-foreground">Activates once received</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-1 py-4" disabled={busy} onClick={() => chooseOffline("ach")}>
              <Building2 className="size-5" />ACH<span className="text-xs font-normal text-muted-foreground">Activates once received</span>
            </Button>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => close(false)}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}
