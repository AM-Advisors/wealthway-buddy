import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startInvoiceCardPayment } from "@/lib/invoices.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

/** Pay an issued invoice by card. The invoice turns paid only when the payment provider confirms it. */
export function InvoiceCardPay({ invoiceId, number }: { invoiceId: string; number: string }) {
  const start = useServerFn(startInvoiceCardPayment);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => ({
    fetchClientSecret: async () => {
      const r: any = await start({ data: { id: invoiceId, environment: getStripeEnvironment(), returnUrl: window.location.href } });
      if (r?.error) { toast.error(r.error); throw new Error(r.error); }
      return r.clientSecret as string;
    },
    onComplete: () => {
      toast.success("Payment received. Your invoice will show as paid in a moment.");
      setOpen(false);
      setTimeout(() => queryClient.invalidateQueries(), 2500);
    },
  }), [invoiceId, start, queryClient]);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><CreditCard className="mr-1 h-4 w-4" />Pay by card</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Pay invoice {number}</DialogTitle>
            <DialogDescription>Secure card checkout. Harmonious never stores your card details.</DialogDescription>
          </DialogHeader>
          {open ? <EmbeddedCheckoutProvider stripe={getStripe()} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
