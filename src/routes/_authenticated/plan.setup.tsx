import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chooseWireFn, mySaasSetupFn, startSaasCheckoutFn, submitKybFn, uploadKybDocumentFn } from "@/lib/saas-orders.functions";
import { KYB_DOCUMENTS } from "@/lib/saas-order-model";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

const TITLE = "Finish setup - Harmonious";
const DESC = "Complete payment and business verification to open your Harmonious plan.";
export const Route = createFileRoute("/_authenticated/plan/setup")({
  head: () => ({ meta: [
    { title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PlanSetup,
});

function Step({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b py-4 last:border-0">
      {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}
      <div className="flex-1 space-y-2"><p className="font-medium">{title}</p>{!done && children}</div>
    </div>
  );
}

const usdCents = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function PlanSetup() {
  const qc = useQueryClient();
  const setupFn = useServerFn(mySaasSetupFn);
  const checkout = useServerFn(startSaasCheckoutFn);
  const kyb = useServerFn(submitKybFn);
  const q = useQuery({ queryKey: ["saas-setup"], queryFn: () => setupFn(), refetchInterval: 15_000 });
  const [paying, setPaying] = useState<null | "card" | "ach">(null);
  const wireFn = useServerFn(chooseWireFn);
  const [f, setF] = useState({ legalName: "", ein: "", formationState: "", entityType: "LLC", owner: "", percent: "100" });
  const order = q.data?.order;

  const options = useMemo(() => ({
    fetchClientSecret: async () => {
      const r: any = await checkout({ data: { orderId: order!.id, environment: getStripeEnvironment(), returnUrl: `${window.location.origin}/plan/setup`, method: paying ?? "card" } });
      if (r.error) { toast.error(r.error); throw new Error(r.error); }
      return r.clientSecret as string;
    },
  }), [order?.id, paying]);

  if (q.isPending) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!order) return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl">No plan yet</h1>
      <Link to="/plan/start" className="mt-4 inline-block text-sm font-medium text-primary underline">Build your plan</Link>
    </div>
  );
  const paid = ["paid", "past_due"].includes(order.payment_status);
  const kybDone = order.kyb_status === "approved";

  async function chooseWire() {
    try { await wireFn({ data: { orderId: order.id } }); qc.invalidateQueries({ queryKey: ["saas-setup"] }); }
    catch (e) { toast.error((e as Error).message); }
  }

  const uploadFn = useServerFn(uploadKybDocumentFn);
  async function uploadDoc(kind: "formation" | "ein_letter", file: File | undefined) {
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await uploadFn({ data: { orderId: order.id, kind, fileName: file.name, mime: file.type, base64: btoa(bin) } });
      toast.success("Uploaded"); qc.invalidateQueries({ queryKey: ["saas-setup"] });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function sendKyb() {
    try {
      const r: any = await kyb({ data: { orderId: order.id, legalName: f.legalName, ein: f.ein, formationState: f.formationState, entityType: f.entityType, owners: [{ name: f.owner, percent: Number(f.percent) || 0 }] } });
      if (r?.flags?.length) toast.error("A few items are missing. See the list below.");
      else toast.success("Business check complete. Sent to our Legal team.");
      qc.invalidateQueries({ queryKey: ["saas-setup"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl">Finish setup</h1>
      <p className="text-sm text-muted-foreground">Your plan opens as soon as every step is done. {order.company_name}</p>
      <Card><CardContent className="pt-2">
        <Step done title={`Statement of Work signed by ${order.signer_name}`} />
        <Step done={paid} title="Payment">
          {order.payment_status === "cancelled" && <p className="text-sm text-destructive">Your payment lapsed. Restart it to reopen access.</p>}
          {paying ? (
            <div className="space-y-2">
              <EmbeddedCheckoutProvider key={paying} stripe={getStripe()} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider>
              <Button variant="ghost" size="sm" onClick={() => setPaying(null)}>Choose another way to pay</Button>
            </div>
          ) : order.payment_method === "wire" && order.wire_reference ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">Paying by wire: {usdCents(Number(order.recurring_cents) + Number(order.one_time_cents))}</p>
              <p>Use reference <span className="font-mono font-medium">{order.wire_reference}</span> on your wire.</p>
              <p className="text-muted-foreground">Harmonious will send verified wire instructions from operations@harmonious.co. Never send money to instructions you receive any other way. Your plan opens once our Finance team confirms the wire has arrived.</p>
              <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setPaying("card")}>Pay by card instead</Button><Button variant="outline" size="sm" onClick={() => setPaying("ach")}>Pay by ACH instead</Button></div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setPaying("card")}>Pay by card</Button>
              <Button variant="outline" onClick={() => setPaying("ach")}>Pay by ACH (bank account)</Button>
              <Button variant="outline" onClick={chooseWire}>Pay by wire</Button>
            </div>
          )}
          {order.payment_method === "ach" && !paid && !paying && <p className="text-sm text-muted-foreground">ACH payments take 3 to 5 business days to clear. Your plan opens once the payment settles.</p>}
        </Step>
        <Step done={!!q.data?.kycOpen} title="Identity verification (you)">
          <p className="text-sm text-muted-foreground">Complete identity verification from the prompt when you sign in.</p>
        </Step>
        <Step done={kybDone} title="Business verification">
          {["review", "legal_review"].includes(order.kyb_status) ? <p className="text-sm text-muted-foreground">Automatic check passed. With our Legal team since {new Date(order.kyb_sent_to_legal_at ?? Date.now()).toLocaleString()}. We'll email you once it's approved.</p>
            : (
              <div className="grid gap-2 sm:grid-cols-2">
                {order.kyb_status === "declined" && <p className="text-sm text-destructive sm:col-span-2">Needs changes: {order.kyb_note}</p>}
                {order.kyb_status === "needs_info" && (order.kyb_flags ?? []).length > 0 && (
                  <div className="rounded-md border border-destructive/40 p-3 text-sm sm:col-span-2"><p className="font-medium text-destructive">Missing before Legal can review:</p>
                    <ul className="ml-4 list-disc">{(order.kyb_flags as string[]).map((x) => <li key={x}>{x}</li>)}</ul></div>
                )}
                {KYB_DOCUMENTS.map((doc) => (
                  <div key={doc.key} className="sm:col-span-2"><Label htmlFor={`doc-${doc.key}`}>{doc.label}</Label>
                    {order.kyb_documents?.[doc.key] && <p className="text-xs text-muted-foreground">On file: {order.kyb_documents[doc.key].name}. Upload again to replace.</p>}
                    <Input id={`doc-${doc.key}`} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => uploadDoc(doc.key, e.target.files?.[0])} /></div>
                ))}
                <div><Label htmlFor="ln">Legal name</Label><Input id="ln" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} /></div>
                <div><Label htmlFor="ein">EIN</Label><Input id="ein" value={f.ein} onChange={(e) => setF({ ...f, ein: e.target.value })} placeholder="12-3456789" /></div>
                <div><Label htmlFor="st">State of formation</Label><Input id="st" value={f.formationState} onChange={(e) => setF({ ...f, formationState: e.target.value })} /></div>
                <div><Label htmlFor="et">Entity type</Label><Input id="et" value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value })} /></div>
                <div><Label htmlFor="ow">Beneficial owner</Label><Input id="ow" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></div>
                <div><Label htmlFor="pc">Ownership %</Label><Input id="pc" type="number" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></div>
                <Button className="sm:col-span-2" onClick={sendKyb}>Submit business details</Button>
              </div>
            )}
        </Step>
      </CardContent></Card>
      {order.status === "active" && (
        <Card><CardHeader><CardTitle className="text-lg">You're all set</CardTitle></CardHeader><CardContent>
          <Link to="/manager" className="text-sm font-medium text-primary underline">Go to your workspace</Link>
        </CardContent></Card>
      )}
    </div>
  );
}
