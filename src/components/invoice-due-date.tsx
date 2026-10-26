import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { billingDate, invoiceDueState } from "@/lib/client-billing-links";
export function InvoiceDueDate({ invoice }: { invoice: { due_date?: string | null; status?: string; total_cents?: unknown; recorded_paid_cents?: unknown } }) {
  const state = invoiceDueState(invoice, new Date().toISOString().slice(0, 10));
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    <span>Payment due: <strong>{billingDate(invoice.due_date)}</strong></span>
    {state === "overdue" ? <Badge variant="destructive">Overdue</Badge> : state === "due_today" ? <Badge variant="outline">Due today</Badge> : null}
  </div>;
}