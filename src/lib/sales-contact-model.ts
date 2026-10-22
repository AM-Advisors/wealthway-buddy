/** Missing recipients may be added before sending, never replaced after sending. */
export function canAddSalesContact(contactId: string | null, status: string) {
  return !contactId && ["draft", "rejected", "approved", "pending_approval", "submitted"].includes(status);
}

export type SalesContactInput = { fullName: string; email: string; organization?: string | null | undefined; title?: string | null | undefined; phone?: string | null | undefined };