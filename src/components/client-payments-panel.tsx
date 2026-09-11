import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const when = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-US") : "—";

/** Plain-English stage for each payment, so a client can tell at a glance
 *  whether Harmonious is still checking it, approving it, or has sent it. */
function stage(payment: any): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
  const status = String(payment.status ?? "").toLowerCase();
  const approvals = (payment.approvals ?? []).length;

  if (status === "on_hold" || status === "hold") return { label: "On hold", tone: "destructive" };
  if (status === "cancelled" || status === "canceled" || status === "rejected")
    return { label: "Cancelled", tone: "outline" };
  if (status === "settled" || status === "completed") return { label: "Settled", tone: "secondary" };
  if (status === "sent" || status === "released") return { label: "Sent", tone: "secondary" };
  if (status === "approved") return { label: "Approved", tone: "default" };
  if (approvals === 1) return { label: "One approval recorded", tone: "default" };
  if (status === "awaiting_approval" || status === "pending_approval")
    return { label: "Awaiting approval", tone: "default" };
  return { label: "Awaiting checks", tone: "outline" };
}

/** Every payment on the client's engagement, at any stage, with the Harmonious
 *  approvals recorded against it. */
export function ClientPaymentsPanel({ payments }: { payments: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payments</CardTitle>
        <CardDescription>
          Every payment on your engagement and where it has reached. Two separate Harmonious
          approvals are recorded before anything is sent. Harmonious facilitates payments and keeps
          the records; it does not hold your funds as a bank, custodian or escrow agent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {payments.length === 0 && (
          <p className="text-sm text-muted-foreground">No payments have been raised yet.</p>
        )}
        {payments.map((p) => {
          const s = stage(p);
          const approvals = (p.approvals ?? []) as any[];
          return (
            <div key={p.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{money(Number(p.amount_cents))}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(p.purpose ?? "payment").replace(/_/g, " ")}
                    {p.fundName ? ` · ${p.fundName}` : ""}
                    {p.beneficiary_name ? ` · to ${p.beneficiary_name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last updated {when(p.updated_at)}
                    {p.authorization_reference ? ` · ref ${p.authorization_reference}` : ""}
                  </p>
                </div>
                <Badge variant={s.tone}>{s.label}</Badge>
              </div>

              <div className="mt-3 border-t pt-3">
                {approvals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No Harmonious approvals recorded yet. Two are needed before this is sent.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {approvals.map((a, i) => (
                      <li key={`${p.id}-${i}`} className="text-xs text-muted-foreground">
                        Approval {i + 1}: {a.approverName}
                        {a.approverRole ? ` (${String(a.approverRole).replace(/_/g, " ")})` : ""} ·{" "}
                        {when(a.at)}
                      </li>
                    ))}
                    {approvals.length === 1 && (
                      <li className="text-xs text-muted-foreground">
                        Waiting on a second approval.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
