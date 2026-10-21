/** Pure rules for client sign-and-approve of quotes/proposals/RFPs/RFQs and Harmonious payment instructions. */
export type AcceptKind = "quote" | "proposal" | "rfp" | "rfq";

export const acceptanceKey = (kind: AcceptKind, id: string, version: number) => `${kind === "quote" ? "quote" : "salesdoc"}:${id}:${version}`;

/** Status a record must be in before a client may sign it. */
export function signBlocker(kind: AcceptKind, status: string, approvedVersion: number | null, version: number): string | null {
  if (kind === "quote") return status === "approved" || status === "sent" ? null : "This quote isn't approved for signing yet.";
  if (status !== "sent" && status !== "approved") return "This document isn't approved for signing yet.";
  if (approvedVersion !== version) return "This link is for an older version. Ask your Harmonious contact for the latest one.";
  return null;
}

/** Staff never sign on a client's behalf. */
export function signerBlocker(signer: { isStaff: boolean; isClientMember: boolean; viaLink: boolean }): string | null {
  if (signer.isStaff && !signer.isClientMember) return "Harmonious staff can't sign for a client.";
  if (!signer.viaLink && !signer.isClientMember) return "Only someone from the client's organization can sign this.";
  return null;
}

export type QuoteLine = { service_key: string | null; label: string; quantity: number | string; unit_cents: number | string; line_cents: number | string; sort_order?: number | null };

/** Invoice lines come only from the approved quote's lines; nothing is repriced. */
export function invoiceLinesFromQuote(lines: QuoteLine[]) {
  return lines
    .filter((l) => Number(l.line_cents) > 0)
    .map((l, i) => ({
      source: "manual",
      service_key: l.service_key ?? "quote",
      label: l.label,
      quantity: Math.max(1, Math.round(Number(l.quantity) || 1)),
      unit_cents: Math.round(Number(l.line_cents) / Math.max(1, Math.round(Number(l.quantity) || 1))),
      amount_cents: Math.round(Number(l.line_cents)),
      sort_order: l.sort_order ?? i,
    }));
}

export const maskTail = (v: string | null | undefined) => {
  const s = String(v ?? "").replace(/\s+/g, "");
  return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`;
};

/** Only approved remittance versions are ever shown to a client. */
export function clientRemittance<T extends { status: string; account_number: string; routing_number: string }>(row: T | null | undefined, reveal: boolean) {
  if (!row || row.status !== "approved") return null;
  return { ...row, account_number: reveal ? row.account_number : maskTail(row.account_number), routing_number: reveal ? row.routing_number : maskTail(row.routing_number) };
}

/** Maker-checker for payment instructions; Super Admins may self-approve with a reason. */
export function remittanceApprovalBlocker(a: { approverId: string; preparedBy: string; isSuperAdmin: boolean; reason?: string | null | undefined }): string | null {
  if (a.approverId !== a.preparedBy) return null;
  if (!a.isSuperAdmin) return "A different person must approve payment instructions.";
  return (a.reason ?? "").trim().length >= 5 ? null : "Give a reason to approve your own entry.";
}
