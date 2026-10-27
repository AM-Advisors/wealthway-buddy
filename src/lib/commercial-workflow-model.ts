import { invoiceBalance } from "./invoice-balance";
import { salesScope } from "./sales-model";
export function commercialAreas(roles: readonly string[]) {
  return {
    sales: salesScope(roles) !== "none",
    marketing: roles.some(r => ["marketing_manager", "marketing_specialist", "admin", "executive", "super_admin"].includes(r)),
    accountManagement: roles.some(r => ["account_manager", "client_success", "sales_management", "cro", "admin", "executive", "super_admin", "leadership"].includes(r)),
    finance: roles.some(r => ["finance", "tax", "fund_administration", "admin", "executive", "super_admin", "leadership"].includes(r)),
    feeReview: roles.includes("admin"),
  };
}
export function commercialBalanceTotals(invoices: { total_cents: unknown; status: string; recorded_paid_cents?: unknown; due_date?: string | null }[], today: string) {
  return invoices.filter(i => !["draft", "void", "cancelled", "canceled"].includes(i.status)).reduce((sum, invoice) => {
    const balance = invoiceBalance(invoice);
    return { billed: sum.billed + Math.max(0, Math.round(Number(invoice.total_cents) || 0)), received: sum.received + balance.paidCents, remaining: sum.remaining + balance.remainingCents, overdue: sum.overdue + (invoice.due_date && invoice.due_date < today ? balance.remainingCents : 0) };
  }, { billed: 0, received: 0, remaining: 0, overdue: 0 });
}