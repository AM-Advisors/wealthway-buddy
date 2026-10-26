/** What an investor can provide for verified (506(c)) accreditation, and professional-request rules. Pure. */
export type EvidenceMethod = "income_documents" | "net_worth_documents" | "professional_license" | "entity_documents" | "third_party_letter";

export type EvidenceOption = { method: EvidenceMethod; title: string; provide: string[]; docKinds: string[]; defaultKind: string };

export const EVIDENCE_OPTIONS: EvidenceOption[] = [
  { method: "income_documents", title: "Income", provide: ["W-2s, 1099s, K-1s or tax returns for the last 2 years", "Over $200,000 a year individually, or $300,000 with a spouse or partner, and you expect the same this year"], docKinds: ["w2", "tax_return", "other"], defaultKind: "tax_return" },
  { method: "net_worth_documents", title: "Net worth", provide: ["Bank, brokerage or retirement statements from the last 3 months", "A credit report from the last 3 months showing debts", "Over $1M net worth, not counting your main home"], docKinds: ["brokerage_statement", "credit_report", "other"], defaultKind: "brokerage_statement" },
  { method: "professional_license", title: "Professional license", provide: ["Your Series 7, 65 or 82 license record in good standing"], docKinds: ["other"], defaultKind: "other" },
  { method: "entity_documents", title: "Entity", provide: ["Financial statements showing over $5M in assets", "Or proof that every owner is accredited"], docKinds: ["brokerage_statement", "other"], defaultKind: "other" },
  { method: "third_party_letter", title: "Letter from a professional", provide: ["A signed letter from a CPA, attorney, registered investment adviser or broker-dealer", "Dated within the last 90 days, confirming they verified your accredited status"], docKinds: ["verification_letter"], defaultKind: "verification_letter" },
];

export function optionFor(method: string): EvidenceOption {
  return EVIDENCE_OPTIONS.find((o) => o.method === method) ?? EVIDENCE_OPTIONS[1]!;
}

export const PROFESSIONAL_ROLES = { cpa: "Certified public accountant", attorney: "Attorney", investment_adviser: "Registered investment adviser", broker_dealer: "Broker-dealer" } as const;
export type ProfessionalRole = keyof typeof PROFESSIONAL_ROLES;

export const REQUEST_LIMITS = { maxOpen: 3, maxSendsPerDay: 5, expiryDays: 14, maxFileBytes: 15 * 1024 * 1024 };
export const UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/heic"];

export type RequestRow = { status: string; expires_at: string; last_sent_at: string; send_count: number; created_at: string };

/** Effective status: an open request past its expiry reads as expired. */
export function effectiveStatus(r: Pick<RequestRow, "status" | "expires_at">, now = Date.now()): string {
  return r.status === "requested" && Date.parse(r.expires_at) < now ? "expired" : r.status;
}

/** Why a new send is refused, or null when allowed. */
export function sendBlocked(rows: RequestRow[], now = Date.now()): string | null {
  const open = rows.filter((r) => effectiveStatus(r, now) === "requested").length;
  if (open >= REQUEST_LIMITS.maxOpen) return `You can have up to ${REQUEST_LIMITS.maxOpen} open requests. Cancel one first.`;
  const day = now - 24 * 3600 * 1000;
  const sends = rows.filter((r) => Date.parse(r.last_sent_at) > day || Date.parse(r.created_at) > day).length;
  if (sends >= REQUEST_LIMITS.maxSendsPerDay) return "Too many requests sent today. Try again tomorrow.";
  return null;
}

/** Whether an upload link may be used right now. */
export function uploadAllowed(r: Pick<RequestRow, "status" | "expires_at"> | null, now = Date.now()): string | null {
  if (!r) return "This link is not valid.";
  const s = effectiveStatus(r, now);
  if (s === "uploaded") return "A letter was already uploaded with this link. Thank you.";
  if (s === "canceled") return "The investor canceled this request.";
  if (s === "expired") return "This link has expired. Ask the investor to send a new request.";
  return null;
}
