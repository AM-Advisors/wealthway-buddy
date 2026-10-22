/** Where a quote / proposal / RFP / RFQ stands, from facts already recorded. Display only. */
export type ProgressStep = { key: string; label: string; done: boolean; at: string | null };

export function salesProgress(input: {
  status: string;
  approvedAt?: string | null;
  events?: { event: string; created_at: string }[];
  signedAt?: string | null;
  sowStatus?: string | null;
  sowAt?: string | null;
  invoiceStatus?: string | null;
  invoiceAt?: string | null;
}): ProgressStep[] {
  const ev = input.events ?? [];
  const firstAt = (name: string) => ev.filter((e) => e.event === name).map((e) => e.created_at).sort()[0] ?? null;
  const approvedAt = input.approvedAt ?? firstAt("approved");
  const sentAt = firstAt("sent");
  const st = input.status;
  const signed = !!input.signedAt || st === "signed" || st === "won";
  const sent = !!sentAt || ["sent", "signed", "won", "lost"].includes(st) || signed;
  const approved = !!approvedAt || ["approved"].includes(st) || sent;
  const paid = input.invoiceStatus === "paid";
  return [
    { key: "draft", label: "Draft", done: true, at: null },
    { key: "approved", label: "Approved", done: approved, at: approvedAt },
    { key: "sent", label: "Sent", done: sent, at: sentAt },
    { key: "signed", label: "Signed", done: signed, at: input.signedAt ?? null },
    { key: "sow", label: "SOW", done: !!input.sowStatus, at: input.sowAt ?? null },
    { key: "invoice", label: "Invoice", done: !!input.invoiceStatus, at: input.invoiceAt ?? null },
    { key: "paid", label: "Paid", done: paid, at: null },
  ];
}
