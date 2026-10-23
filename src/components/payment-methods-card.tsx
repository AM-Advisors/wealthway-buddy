import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPaymentMethodsFn, savePaymentMethodsFn } from "@/lib/payment-methods.functions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, PAYMENT_METHOD_TIMELINE, type PaymentMethod } from "@/lib/payment-methods";

/** Fund manager / staff choice of how investors send capital. Instructions only - no money moves through Harmonious. */
export function PaymentMethodsCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getPaymentMethodsFn);
  const save = useServerFn(savePaymentMethodsFn);
  const q = useQuery({ queryKey: ["payment-methods", fundId], queryFn: () => load({ data: { offering_id: fundId } }), retry: false });
  const [methods, setMethods] = useState<PaymentMethod[]>(["wire"]);
  const [payable, setPayable] = useState("");
  const [mail, setMail] = useState("");
  useEffect(() => {
    if (!q.data) return;
    setMethods(q.data.methods);
    setPayable(q.data.checkPayableTo);
    setMail(q.data.checkMailAddress);
  }, [q.data]);
  const m = useMutation({
    mutationFn: () => save({ data: { offering_id: fundId, methods, check_payable_to: payable, check_mail_address: mail } }),
    onSuccess: () => { toast.success("Payment methods saved."); void qc.invalidateQueries({ queryKey: ["payment-methods", fundId] }); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });
  const toggle = (k: PaymentMethod, on: boolean) => setMethods((p) => (on ? [...p, k] : p.filter((x) => x !== k)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How investors send capital</CardTitle>
        <CardDescription>Choose the payment methods investors can use. Investors send the money from their own bank; Harmonious never pulls or moves it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {q.error ? <p className="text-muted-foreground">Payment methods aren&apos;t available to you.</p> : (
          <>
            {PAYMENT_METHODS.map((k) => (
              <div key={k} className="flex items-start gap-3">
                <Checkbox id={`pm-${k}`} checked={methods.includes(k)} onCheckedChange={(v) => toggle(k, v === true)} />
                <div>
                  <Label htmlFor={`pm-${k}`} className="font-medium">{PAYMENT_METHOD_LABEL[k]}</Label>
                  <p className="text-xs text-muted-foreground">{PAYMENT_METHOD_TIMELINE[k]}</p>
                </div>
              </div>
            ))}
            {methods.includes("ach") && <p className="rounded-md border border-accent bg-accent/10 p-3 text-xs">ACH uses the fund&apos;s USA bank account and routing number from the banking details. Investors see the 3-5 business day warning.</p>}
            {methods.includes("check") && (
              <div className="grid gap-3">
                <div className="grid gap-1.5"><Label htmlFor="pm-payable">Checks payable to</Label><Input id="pm-payable" value={payable} onChange={(e) => setPayable(e.target.value)} /></div>
                <div className="grid gap-1.5"><Label htmlFor="pm-mail">Mail checks to</Label><Textarea id="pm-mail" rows={3} value={mail} onChange={(e) => setMail(e.target.value)} /></div>
              </div>
            )}
            <Button size="sm" disabled={!methods.length || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Saving…" : "Save payment methods"}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
