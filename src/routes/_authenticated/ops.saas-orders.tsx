import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmWireReceivedFn, decideKybFn, legalReviewSaasOrderFn, staffSaasOrdersFn } from "@/lib/saas-orders.functions";

const TITLE = "Self-serve SaaS orders - Harmonious Operations";
const DESC = "Review auto-activated SaaS Statements of Work and business verification.";
export const Route = createFileRoute("/_authenticated/ops/saas-orders")({
  head: () => ({ meta: [
    { title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SaasOrders,
});

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

function SaasOrders() {
  const qc = useQueryClient();
  const list = useServerFn(staffSaasOrdersFn);
  const decide = useServerFn(decideKybFn);
  const confirmWire = useServerFn(confirmWireReceivedFn);
  async function wireReceived(o: any) {
    const due = (Number(o.recurring_cents) + Number(o.one_time_cents)) / 100;
    const amt = window.prompt(`Amount received for ${o.wire_reference} (due ${usd(Number(o.recurring_cents) + Number(o.one_time_cents))})`, String(due));
    if (!amt) return;
    const cents = Math.round(Number(amt.replace(/[^0-9.]/g, "")) * 100);
    const note = cents < due * 100 ? window.prompt("Amount is short. Add a note to confirm anyway:") : null;
    try { await confirmWire({ data: { orderId: o.id, amountCents: cents, note } }); toast.success("Wire confirmed. Access opens once the other checks pass."); qc.invalidateQueries({ queryKey: ["staff-saas-orders"] }); }
    catch (e) { toast.error((e as Error).message); }
  }
  const legal = useServerFn(legalReviewSaasOrderFn);
  const q = useQuery({ queryKey: ["staff-saas-orders"], queryFn: () => list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff-saas-orders"] });
  async function kyb(id: string, approve: boolean) {
    const note = window.prompt(approve ? "Note (required if this is your own order)" : "Reason for sending back") ?? null;
    try { await decide({ data: { orderId: id, approve, note } }); toast.success("Saved"); refresh(); } catch (e) { toast.error((e as Error).message); }
  }
  async function review(id: string) {
    try { await legal({ data: { orderId: id } }); toast.success("Marked reviewed"); refresh(); } catch (e) { toast.error((e as Error).message); }
  }
  if (q.isError) return <p className="p-10 text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data;
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <h1 className="text-3xl">Self-serve SaaS orders</h1>
      <p className="text-sm text-muted-foreground">Click-through SOWs under the standard MSA. They're active without a countersignature; Sales or Legal review them afterwards. Access opens only after payment, identity and business checks.</p>
      <Card data-testid="auto-activated-sows">
        <CardHeader><CardTitle className="text-lg">Auto-activated SaaS SOWs</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {(d?.orders ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No signed SOWs yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-medium">Company</th><th className="py-1 pr-3 font-medium">Signed by</th><th className="py-1 pr-3 font-medium">Signed</th><th className="py-1 pr-3 font-medium">MSA</th><th className="py-1 font-medium">Status</th></tr></thead>
              <tbody>
                {(d?.orders ?? []).map((o: any) => (
                  <tr key={o.id} className="border-t">
                    <td className="py-1.5 pr-3">{o.company_name}{o.environment === "sandbox" && <Badge variant="secondary" className="ml-2">test</Badge>}</td>
                    <td className="py-1.5 pr-3">{o.signer_name}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(o.signed_at).toLocaleString()}</td>
                    <td className="py-1.5 pr-3">{o.msa_version}</td>
                    <td className="py-1.5">{o.status} · pay {o.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {(d?.orders ?? []).map((o: any) => (
        <Card key={o.id}>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">{o.company_name}</CardTitle>
            <div className="flex flex-wrap gap-1"><Badge variant="outline">{o.status}</Badge><Badge variant="outline">pay: {o.payment_status} · {o.payment_method}</Badge><Badge variant="outline">KYB: {o.kyb_status}</Badge>{o.environment === "sandbox" && <Badge variant="secondary">test</Badge>}</div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Signed by {o.signer_name} on {new Date(o.signed_at).toLocaleString()} · {o.msa_version} · {usd(o.recurring_cents)} / {o.billing_interval === "annual" ? "year" : "quarter"}{o.one_time_cents ? ` + ${usd(o.one_time_cents)} one-time` : ""}</p>
            {o.kyb_sent_to_legal_at && o.kyb_status === "legal_review" && <p className="text-muted-foreground">Automatic check passed · sent to Legal {new Date(o.kyb_sent_to_legal_at).toLocaleString()}</p>}
            {o.kyb_status === "needs_info" && <p className="text-destructive">Automatic check {o.kyb_checked_at ? new Date(o.kyb_checked_at).toLocaleString() : ""} flagged: {(o.kyb_flags ?? []).join(" ")}</p>}
            {o.kyb_details && <p className="text-muted-foreground">Business: {o.kyb_details.legal_name} · EIN ••{o.kyb_details.ein_last4} · {o.kyb_details.entity_type}, {o.kyb_details.formation_state} · Owners: {(o.kyb_details.beneficial_owners ?? []).map((b: any) => `${b.name} (${b.percent}%)`).join(", ")}</p>}
            <div className="flex flex-wrap gap-2">
              {d?.canDecideKyb && ["review", "legal_review"].includes(o.kyb_status) && <><Button size="sm" onClick={() => kyb(o.id, true)}>Legal: approve business</Button><Button size="sm" variant="outline" onClick={() => kyb(o.id, false)}>Send back</Button></>}
              {d?.canConfirmWire && o.payment_method === "wire" && o.payment_status !== "paid" && o.user_id !== d.me && <Button size="sm" onClick={() => wireReceived(o)}>Confirm wire received ({o.wire_reference})</Button>}
              {o.wire_received_at && <span className="text-xs text-muted-foreground">Wire of {usd(o.wire_received_cents)} confirmed {new Date(o.wire_received_at).toLocaleDateString()}</span>}
              {d?.canLegalReview && !o.legal_reviewed_at && <Button size="sm" variant="outline" onClick={() => review(o.id)}>Mark SOW reviewed</Button>}
              {o.legal_reviewed_at && <span className="text-xs text-muted-foreground">Reviewed {new Date(o.legal_reviewed_at).toLocaleDateString()}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
