import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PieChart, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyCapTables, openCapTableBillingPortal } from "@/lib/cap-table-billing.functions";
import { CAP_TABLE_TIERS } from "@/lib/cap-table-tiers";
import { getStripeEnvironment } from "@/lib/stripe";

const LABEL: Record<string, string> = {
  active: "Active", past_due: "Payment needs attention", pending_payment: "Waiting for payment",
  cancelled: "Cancelled (read-only)", sales_requested: "Sales will contact you",
};

export function CapTablesCard() {
  const fn = useServerFn(getMyCapTables);
  const portal = useServerFn(openCapTableBillingPortal);
  const q = useQuery({ queryKey: ["my-cap-tables"], queryFn: () => fn({ data: { environment: getStripeEnvironment() } }) });
  const subs = q.data?.subscriptions ?? [];
  const openBilling = async () => {
    try {
      const r = await portal({ data: { environment: getStripeEnvironment(), returnUrl: window.location.href } });
      if ("error" in r) throw new Error(r.error);
      window.open(r.url, "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (!q.data?.clientId) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2"><PieChart className="size-4" />Cap tables</CardTitle>
          <CardDescription>Pick a plan, set up auto pay, then build your cap table.</CardDescription>
        </div>
        {q.data.canManage && (
          <Button asChild size="sm"><Link to="/client/add-cap-table"><Plus className="mr-1 size-4" />Add a cap table</Link></Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {subs.length === 0 && <p className="text-sm text-muted-foreground">No cap tables yet.</p>}
        {subs.map((s: any) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">{s.company_name}</p>
              <p className="text-xs text-muted-foreground">
                {CAP_TABLE_TIERS.find((t) => t.key === s.tier)?.name ?? s.tier} plan, billed {s.billing_interval}
                {s.current_period_end ? `, renews ${new Date(s.current_period_end).toLocaleDateString()}` : ""}
                {s.cancel_at_period_end ? " (ends at period end)" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={s.status === "active" ? "default" : s.status === "past_due" ? "destructive" : "secondary"}>{LABEL[s.status] ?? s.status}</Badge>
              {(s.status === "active" || s.status === "past_due") && (
                <Button asChild size="sm" variant="outline"><Link to="/client/cap-table">Open</Link></Button>
              )}
            </div>
          </div>
        ))}
        {q.data.canManage && subs.some((s: any) => s.tier !== "free" && s.status !== "sales_requested") && (
          <Button size="sm" variant="ghost" onClick={openBilling}>Manage billing (change plan, card or cancel)</Button>
        )}
      </CardContent>
    </Card>
  );
}
