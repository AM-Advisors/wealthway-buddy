import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FundPaymentDialog, PaymentSummary, useFundPayment } from "@/components/fund-payment-checkout";
import { submitIntakeRequest } from "@/lib/client-services.functions";

/**
 * Asks Harmonious to complete an item for this fund. Priced items go through the
 * existing a la carte payment (card, wire or ACH); nothing starts until payment is confirmed.
 */
export function RequestHarmoniousButton({ fundId, fundName, item, serviceKeys, size = "sm", variant = "outline" }: {
  fundId: string; fundName: string; item: string; serviceKeys: string[];
  size?: "sm" | "default"; variant?: "outline" | "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [note, setNote] = useState("");
  const answers = { offering_id: fundId, fund_name: fundName, requested_item: item };
  const target = { kind: "service_request" as const, answers, serviceKeys };
  const quote = useFundPayment(open ? target : null);
  const submit = useServerFn(submitIntakeRequest);
  const m = useMutation({
    mutationFn: (paymentId?: string) => submit({ data: {
      intent: "add_service", summary: `${fundName}: please complete ${item}${note.trim() ? ` - ${note.trim()}` : ""}`,
      answers, requestedServiceKeys: serviceKeys, paymentId: paymentId ?? null,
    } }),
    onSuccess: () => { toast.success("Request sent to Harmonious."); setOpen(false); setPayOpen(false); setNote(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const total = quote.data?.totalCents ?? 0;
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>Ask Harmonious to complete</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask Harmonious to complete {item}</DialogTitle>
            <DialogDescription>Harmonious reviews the request and confirms timing. Paid items start once payment is received.</DialogDescription>
          </DialogHeader>
          {quote.isLoading ? <p className="text-sm text-muted-foreground">Working out the price…</p>
            : quote.data && quote.data.items.length ? <PaymentSummary items={quote.data.items} total={total} />
            : <p className="text-sm text-muted-foreground">Harmonious will confirm the price before starting.</p>}
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Anything we should know (period, deadline, etc.)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={m.isPending || quote.isLoading} onClick={() => (total > 0 ? setPayOpen(true) : m.mutate(undefined))}>
              {total > 0 ? "Continue to payment" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {payOpen && <FundPaymentDialog open={payOpen} onOpenChange={setPayOpen} target={target} onPaid={(id) => m.mutate(id)} />}
    </>
  );
}
