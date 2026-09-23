/**
 * Company (client engagement) billing and fee-proposal actions for the Action
 * Center. Pure: every item is derived from the invoice or service-request row
 * that owns it. Nothing here invents a due date, payment state, approval state,
 * owner or priority — the only date used is `invoices.due_date`.
 *
 * This replaces the separate "Needs you" calculation the company Home used to
 * run in the browser; the rules below are the same rules, now in one place.
 */
import { buildAttentionItem, type AttentionItem } from "@/lib/attention-model";

/** Invoice states in which the client still owes an approval or a payment. */
export const OPEN_INVOICE_STATES = ["issued", "approved", "partially_paid", "overdue"] as const;
/** Invoice states that mean the client's part is finished. */
export const SETTLED_INVOICE_STATES = ["paid"] as const;

const RECENT_DAYS = 30;

const recent = (at: string | null | undefined, now: number) =>
  Boolean(at) && now - new Date(String(at)).getTime() <= RECENT_DAYS * 86_400_000;

export type InvoiceRow = {
  id: string;
  client_id: string | null;
  status: string | null;
  number?: string | null;
  due_date?: string | null;
  client_approved_at?: string | null;
  updated_at?: string | null;
};

export type ServiceRequestRow = {
  id: string;
  client_id: string | null;
  service_key: string | null;
  status: string | null;
  updated_at?: string | null;
};

/** Has the client already approved this invoice? Only the invoice row says so. */
export function invoiceApproved(i: InvoiceRow): boolean {
  return Boolean(i.client_approved_at) || i.status === "approved";
}

export function companyInvoiceItems(
  invoices: readonly InvoiceRow[],
  clientName: (id: string | null) => string | null,
  now = Date.now(),
): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const i of invoices) {
    const state = String(i.status ?? "");
    const label = `invoice ${i.number ?? ""}`.trim();
    const due = i.due_date ? { dueDate: String(i.due_date).slice(0, 10), dueDateSource: "invoices.due_date" } : {};
    if ((OPEN_INVOICE_STATES as readonly string[]).includes(state)) {
      const approved = invoiceApproved(i);
      out.push(
        buildAttentionItem({
          id: `company-invoice:${i.id}`,
          source: approved ? "company.invoice_payment" : "company.invoice_approval",
          workspace: "company",
          group: "needs_you",
          severity: "action",
          title: approved ? `Pay ${label}` : `Approve ${label}`,
          workflowState: approved && state === "issued" ? "client_approved" : state,
          status: approved
            ? "You approved this invoice — payment is due"
            : "This invoice is waiting for your approval",
          sourceTable: "invoices",
          sourceId: i.id,
          href: "/client/invoices",
          at: i.updated_at ?? null,
          clientName: clientName(i.client_id),
          ...due,
        }),
      );
    } else if ((SETTLED_INVOICE_STATES as readonly string[]).includes(state) && recent(i.updated_at, now)) {
      out.push(
        buildAttentionItem({
          id: `company-invoice:${i.id}`,
          source: "company.invoice_payment",
          workspace: "company",
          group: "recently_completed",
          severity: "info",
          title: `Paid ${label}`,
          workflowState: state,
          status: "This invoice is paid",
          sourceTable: "invoices",
          sourceId: i.id,
          href: "/client/invoices",
          at: i.updated_at ?? null,
          clientName: clientName(i.client_id),
        }),
      );
    }
  }
  return out;
}

export function companyFeeProposalItems(
  requests: readonly ServiceRequestRow[],
  serviceName: (key: string | null) => string,
  clientName: (id: string | null) => string | null,
  now = Date.now(),
): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const r of requests) {
    const state = String(r.status ?? "");
    const name = serviceName(r.service_key);
    const base = {
      id: `company-service-request:${r.id}`,
      source: "company.fee_proposal",
      workspace: "company" as const,
      workflowState: state,
      sourceTable: "service_requests",
      sourceId: r.id,
      href: "/client/services",
      at: r.updated_at ?? null,
      clientName: clientName(r.client_id),
    };
    if (state === "quoted") {
      out.push(
        buildAttentionItem({
          ...base,
          group: "needs_you",
          severity: "action",
          title: `Sign the fee proposal for ${name}`,
          status: "Harmonious has sent a fee proposal for your signature",
        }),
      );
    } else if (state === "requested" || state === "in_review" || state === "signed") {
      out.push(
        buildAttentionItem({
          ...base,
          group: "harmonious_working",
          severity: "info",
          title: `${name} request`,
          status:
            state === "signed"
              ? "Signed — Harmonious is switching this on"
              : "Harmonious is reviewing your request",
        }),
      );
    } else if ((state === "activated" || state === "declined") && recent(r.updated_at, now)) {
      out.push(
        buildAttentionItem({
          ...base,
          group: "recently_completed",
          severity: "info",
          title: `${name} request`,
          status: state === "activated" ? "Approved and switched on" : "Declined",
        }),
      );
    }
  }
  return out;
}
