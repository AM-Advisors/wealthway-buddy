import { commercialAreas } from "../commercial-workflow-model";
import { QA_INVOICE, fictionalBillingReadback } from "./billing-fixtures";
import type { CommercialWorkflowData } from "@/components/commercial-workflow";
export function fictionalCommercialWorkflow(): CommercialWorkflowData {
  const { balance } = fictionalBillingReadback();
  return {
    areas: commercialAreas(["super_admin", "admin"]), asOf: "2026-10-27T05:00:00Z", canQualify: true,
    team: [{ id: "qa-rep", name: "Avery Quinn" }],
    inquiries: [{ id: "qa-inquiry", name: "Taylor Brook", company: "Juniper Ridge Ventures", work_email: "taylor@example.test", intent: "fund_administration", utm_campaign: "Autumn introduction" }],
    finance: { totals: { revenue12m: balance.paidCents, outstanding: balance.remainingCents, overdue: 0 }, invoices: [{ id: QA_INVOICE.id, number: QA_INVOICE.number, client: "Fablewood Ventures", due: QA_INVOICE.due_date, status: "partially_paid", cents: QA_INVOICE.total_cents, receivedCents: balance.paidCents, remainingCents: balance.remainingCents }] },
    accountManagement: { handoffs: [{ id: "qa-quote-1", quote: "FABLE-Q001", client: "Fablewood Ventures", title: "Quarterly administration", cents: 1200000, fundId: "qa-fund", handedOff: true, needsReview: false }] },
    commissions: { rows: [{ status: "expected", paid: false, amountCents: 90000 }, { status: "scheduled", paid: true, amountCents: 30000 }] },
  };
}