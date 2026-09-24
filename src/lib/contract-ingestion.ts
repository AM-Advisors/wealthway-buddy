/**
 * Client intake + contract ingestion — pure rules (browser-safe, no I/O).
 *
 * Source-of-truth model:
 *   Signed contract            = the legal source document (stored unchanged, fingerprinted).
 *   Approved structured terms  = Harmonious' operational representation of it.
 * AI extraction only ever proposes terms; nothing here lets an extracted value
 * become operational configuration without a human review and approval.
 */

export const CLIENT_TYPES = [
  "Fund Manager",
  "Investment Manager",
  "Company / Founder",
  "SPV Sponsor",
  "VC Fund",
  "PE Fund",
  "Hedge Fund",
  "Real Estate Fund",
  "Family Office",
  "RIA / Adviser",
  "Law Firm / Professional Partner",
  "Other",
] as const;

export const CONTACT_DESIGNATIONS = [
  "Primary",
  "Billing",
  "Legal",
  "Operations",
  "Fund Manager",
  "Authorized Signatory",
] as const;

export const GOVERNING_DOC_TYPES = [
  { value: "msa", label: "Master services agreement (MSA)" },
  { value: "sow", label: "Statement of work (SOW)" },
  { value: "engagement", label: "Engagement agreement" },
  { value: "amendment", label: "Amendment" },
  { value: "addendum", label: "Addendum" },
  { value: "pricing_schedule", label: "Pricing schedule" },
  { value: "other", label: "Other governing agreement" },
] as const;
export type GoverningDocType = (typeof GOVERNING_DOC_TYPES)[number]["value"];

export const CONTRACT_MIME_TYPES: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const MAX_CONTRACT_BYTES = 25 * 1024 * 1024;

/** Fewer readable characters than this means the document needs manual review (e.g. a scan). */
export const MIN_READABLE_CHARS = 400;
/** Below this confidence an extracted value is treated as ambiguous. */
export const AMBIGUOUS_CONFIDENCE = 0.7;
export const EXTRACTION_PROMPT_VERSION = "contract-terms-v1";

export type TermDef = { key: string; category: string; label: string; material: boolean; pricing?: boolean };

/** Every term the extractor must attempt. Missing ones become "Not found", never invented. */
export const TERM_CATALOG: TermDef[] = [
  { key: "harmonious_entity", category: "Parties", label: "Harmonious contracting entity", material: true },
  { key: "client_entity", category: "Parties", label: "Client legal entity", material: true },
  { key: "other_parties", category: "Parties", label: "Other contracting parties", material: false },
  { key: "agreement_type", category: "Agreement", label: "Agreement type", material: true },
  { key: "effective_date", category: "Agreement", label: "Effective date", material: true },
  { key: "execution_date", category: "Agreement", label: "Execution date", material: false },
  { key: "initial_term", category: "Agreement", label: "Initial term", material: true },
  { key: "expiration_date", category: "Agreement", label: "Expiration", material: false },
  { key: "contracted_services", category: "Services / Scope", label: "Contracted services", material: true },
  { key: "covered_entities", category: "Services / Scope", label: "Funds / SPVs / entities covered", material: true },
  { key: "included_work", category: "Services / Scope", label: "Included work", material: false },
  { key: "excluded_work", category: "Services / Scope", label: "Excluded work", material: false },
  { key: "deliverables", category: "Services / Scope", label: "Deliverables", material: false },
  { key: "service_frequency", category: "Services / Scope", label: "Service frequency", material: false },
  { key: "setup_fee", category: "Pricing", label: "Setup fees", material: true, pricing: true },
  { key: "annual_fee", category: "Pricing", label: "Annual fees", material: true, pricing: true },
  { key: "recurring_fee", category: "Pricing", label: "Recurring fees", material: true, pricing: true },
  { key: "per_fund_fee", category: "Pricing", label: "Per-Fund / SPV fees", material: true, pricing: true },
  { key: "per_investor_fee", category: "Pricing", label: "Per-investor fees", material: true, pricing: true },
  { key: "k1_tax_fee", category: "Pricing", label: "K-1 / tax fees", material: true, pricing: true },
  { key: "filing_fee", category: "Pricing", label: "Filing fees", material: false, pricing: true },
  { key: "transaction_fee", category: "Pricing", label: "Transaction fees", material: false, pricing: true },
  { key: "hourly_fee", category: "Pricing", label: "Hourly fees", material: false, pricing: true },
  { key: "minimum_fee", category: "Pricing", label: "Minimums", material: true, pricing: true },
  { key: "discounts_credits", category: "Pricing", label: "Discounts / credits", material: true },
  { key: "pass_through", category: "Pricing", label: "Pass-through expenses", material: false },
  { key: "payment_terms", category: "Pricing", label: "Payment terms", material: true },
  { key: "termination_notice", category: "Termination", label: "Termination notice period", material: true },
  { key: "termination_rights", category: "Termination", label: "Termination rights", material: false },
  { key: "cancellation_fees", category: "Termination", label: "Cancellation / remaining-fee obligations", material: true },
  { key: "survival", category: "Termination", label: "Survival provisions", material: false },
  { key: "auto_renewal", category: "Renewal", label: "Automatic renewal", material: true },
  { key: "renewal_period", category: "Renewal", label: "Renewal period", material: false },
  { key: "renewal_notice_deadline", category: "Renewal", label: "Renewal notice deadline", material: true },
  { key: "liability_summary", category: "Liability / Indemnification", label: "Liability & indemnification (reference only)", material: false },
  { key: "data_security", category: "Data / Security", label: "Data & security obligations", material: false },
  { key: "special_terms", category: "Special Terms", label: "Negotiated exceptions / custom terms", material: true },
  { key: "precedence_clause", category: "Precedence", label: "Order-of-precedence clause", material: true },
  { key: "signatories", category: "Signatures", label: "Signatories, titles & dates", material: true },
];

export type ExtractedTerm = {
  key: string;
  value: string | null;
  basis: "explicit" | "inferred" | "not_found";
  confidence: number | null;
  page: string | null;
  section: string | null;
  quote: string | null;
};

export type NormalizedTerm = ExtractedTerm & {
  category: string;
  label: string;
  material: boolean;
  status: "needs_review";
  ambiguous: boolean;
  amountCents: number | null;
};

/**
 * Turns whatever the model returned into the full catalog. Unknown keys are dropped,
 * missing keys become "not_found" with no value, empty values are never kept as found,
 * and every term — however confident — starts as "needs_review".
 */
export function normalizeExtraction(raw: unknown): NormalizedTerm[] {
  const list = Array.isArray((raw as any)?.terms) ? ((raw as any).terms as any[]) : [];
  const byKey = new Map<string, any>();
  for (const t of list) if (t && typeof t.key === "string" && !byKey.has(t.key)) byKey.set(t.key, t);
  return TERM_CATALOG.map((def) => {
    const t = byKey.get(def.key);
    const value = typeof t?.value === "string" && t.value.trim() ? t.value.trim().slice(0, 4000) : null;
    let basis: ExtractedTerm["basis"] =
      t?.basis === "explicit" || t?.basis === "inferred" ? t.basis : "not_found";
    if (!value) basis = "not_found";
    const confidence =
      typeof t?.confidence === "number" && t.confidence >= 0 && t.confidence <= 1 ? t.confidence : null;
    const ambiguous =
      basis === "inferred" || (basis === "explicit" && (confidence === null || confidence < AMBIGUOUS_CONFIDENCE));
    return {
      key: def.key,
      category: def.category,
      label: def.label,
      material: def.material,
      value: basis === "not_found" ? null : value,
      basis,
      confidence: basis === "not_found" ? null : confidence,
      page: basis === "not_found" ? null : str(t?.page),
      section: basis === "not_found" ? null : str(t?.section),
      quote: basis === "not_found" ? null : str(t?.quote)?.slice(0, 600) ?? null,
      status: "needs_review" as const,
      ambiguous,
      amountCents: def.pricing && basis !== "not_found" ? parseMoneyCents(value) : null,
    };
  });
}

function str(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
}

/** "$16,000" → 1600000. Returns null when there isn't exactly one amount (ambiguous). */
export function parseMoneyCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = text.match(/\$\s?\d[\d,]*(\.\d{1,2})?/g);
  if (!matches || matches.length !== 1) return null;
  const n = Number(matches[0].replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Days from "sixty (60) days" / "60 days" / "90-day". Null when absent or ambiguous. */
export function parseDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const found = Array.from(new Set((text.match(/(\d{1,3})[\s-]*(?:\)\s*)?(?:calendar\s+|business\s+)?days?/gi) ?? [])
    .map((m) => Number(m.match(/\d{1,3}/)![0]))));
  return found.length === 1 ? (found[0] as number) : null;
}

export function readableQuality(textChars: number): "ok" | "poor" {
  return textChars < MIN_READABLE_CHARS ? "poor" : "ok";
}

/* ------------------------------------------------------------ review / approval */

export type TermRow = {
  id: string;
  term_key: string;
  material: boolean;
  status: "needs_review" | "confirmed" | "corrected" | "not_applicable";
  current_value: string | null;
  amount_cents: number | null;
  service_key: string | null;
};
export type DocRow = {
  id: string;
  client_id: string;
  doc_type: GoverningDocType;
  review_status: string;
  execution_status: "needs_review" | "executed_confirmed" | "not_executed";
  precedence_status: "requires_review" | "confirmed" | "not_applicable";
  applies_to_offering_ids: string[];
  effective_date: string | null;
};

/** Roles allowed to approve contract terms (the existing contract-authority set). */
export const CONTRACT_APPROVER_ROLES = [
  "admin",
  "super_admin",
  "legal",
  "client_success",
  "compliance",
  "finance",
  "executive",
] as const;

export function canApproveContract(roles: readonly string[]): boolean {
  return roles.some((r) => (CONTRACT_APPROVER_ROLES as readonly string[]).includes(r));
}

/** Everything that stops "Approve Contract Terms". Empty list = may approve. */
export function approvalBlockers(doc: DocRow, terms: TermRow[]): string[] {
  const out: string[] = [];
  if (doc.review_status === "approved" || doc.review_status === "superseded") out.push("Already approved.");
  if (doc.review_status === "uploaded") out.push("Terms haven't been read yet.");
  if (doc.execution_status !== "executed_confirmed")
    out.push("A person must confirm the document is fully executed.");
  if (doc.precedence_status === "requires_review") out.push("Precedence requires review.");
  const open = terms.filter((t) => t.material && t.status === "needs_review");
  if (open.length) out.push(`${open.length} material term(s) still need review.`);
  if (!doc.effective_date) out.push("Effective date must be confirmed.");
  return out;
}

export type PricingPlanRow = {
  source_term_id: string;
  service_key: string;
  label: string;
  contracted_cents: number;
  offering_id: string | null;
  effective_date: string | null;
  pricing_source: "contract";
};

/**
 * Which approved pricing terms become Client Contract / Engagement pricing.
 * Only reviewed terms with an exact amount and a mapped service apply; everything
 * else is reported, never guessed. A Fund-specific SOW applies only to that Fund.
 */
export function planPricingApplication(
  doc: DocRow,
  terms: (TermRow & { label?: string })[],
): { rows: PricingPlanRow[]; skipped: { termId: string; reason: string }[] } {
  if (doc.review_status !== "approved") return { rows: [], skipped: [{ termId: "*", reason: "Not approved" }] };
  const pricingKeys = new Set(TERM_CATALOG.filter((t) => t.pricing).map((t) => t.key));
  const offerings = doc.applies_to_offering_ids.length ? doc.applies_to_offering_ids : [null];
  const rows: PricingPlanRow[] = [];
  const skipped: { termId: string; reason: string }[] = [];
  for (const t of terms) {
    if (!pricingKeys.has(t.term_key)) continue;
    if (t.status === "not_applicable") continue;
    if (t.status !== "confirmed" && t.status !== "corrected") {
      skipped.push({ termId: t.id, reason: "Not reviewed" });
      continue;
    }
    if (t.amount_cents == null) {
      skipped.push({ termId: t.id, reason: "No exact amount" });
      continue;
    }
    if (!t.service_key) {
      skipped.push({ termId: t.id, reason: "No service mapped" });
      continue;
    }
    for (const offering of offerings) {
      rows.push({
        source_term_id: t.id,
        service_key: t.service_key,
        label: t.label ?? t.term_key,
        contracted_cents: t.amount_cents,
        offering_id: offering,
        effective_date: doc.effective_date,
        pricing_source: "contract",
      });
    }
  }
  // one source term may only map to one row (DB unique) — keep first offering if a doc covers several
  const seen = new Set<string>();
  return {
    rows: rows.filter((r) => (seen.has(r.source_term_id) ? false : (seen.add(r.source_term_id), true))),
    skipped,
  };
}

/** Contract pricing in effect for a service on a date (never falls back to standard pricing). */
export function effectiveContractPrice<
  T extends { service_key: string; offering_id: string | null; effective_date: string | null; pricing_source: string; contracted_cents: number | null },
>(rows: T[], serviceKey: string, offeringId: string | null, onDate: string): T | null {
  const candidates = rows
    .filter((r) => r.pricing_source === "contract" && r.service_key === serviceKey)
    .filter((r) => r.offering_id === null || r.offering_id === offeringId)
    .filter((r) => !r.effective_date || r.effective_date <= onDate)
    .sort((a, b) => {
      // fund-specific beats client-wide; then latest effective date
      if ((a.offering_id ? 1 : 0) !== (b.offering_id ? 1 : 0)) return (b.offering_id ? 1 : 0) - (a.offering_id ? 1 : 0);
      return String(b.effective_date ?? "").localeCompare(String(a.effective_date ?? ""));
    });
  return candidates[0] ?? null;
}

/* ------------------------------------------------------------ duplicates */

function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(llc|inc|lp|llp|ltd|corp|corporation|company|co|fund|l p)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findDuplicateClients<T extends { id: string; name: string; legal_name?: string | null; primary_contact_email?: string | null }>(
  candidate: { name: string; legal_name?: string | null; primary_email?: string | null },
  existing: T[],
): T[] {
  const names = [norm(candidate.name), norm(candidate.legal_name)].filter(Boolean);
  const email = (candidate.primary_email ?? "").trim().toLowerCase();
  return existing.filter((c) => {
    const theirs = [norm(c.name), norm(c.legal_name)].filter(Boolean);
    if (names.some((n) => theirs.includes(n))) return true;
    return !!email && (c.primary_contact_email ?? "").trim().toLowerCase() === email;
  });
}

export function einLast4(ein: string | null | undefined): string | null {
  const digits = (ein ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits.slice(-4) : null;
}

/* ------------------------------------------------------------ deadlines */

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/** Last day notice can be given before expiration (null when not computable). */
export function noticeDeadline(expiration: string | null, noticeDays: number | null): string | null {
  if (!expiration || noticeDays == null) return null;
  const d = new Date(`${expiration}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - noticeDays);
  return d.toISOString().slice(0, 10);
}

export type ContractAlert = { kind: "awaiting_review" | "manual_review" | "missing_execution" | "expiring" | "notice_deadline" | "amendment_review" | "precedence"; title: string };

/** Derived (never stored) alerts, one per kind per document — so tasks never duplicate. */
export function contractAlerts(
  doc: DocRow & { expiration_date: string | null; notice_days: number | null; title: string },
  today: string,
): ContractAlert[] {
  const out: ContractAlert[] = [];
  if (doc.review_status === "manual_review_required") out.push({ kind: "manual_review", title: "Document requires manual review" });
  else if (doc.review_status === "awaiting_review")
    out.push({
      kind: doc.doc_type === "amendment" ? "amendment_review" : "awaiting_review",
      title: doc.doc_type === "amendment" ? "Amendment requiring review" : "Contract terms awaiting review",
    });
  if (doc.review_status !== "superseded" && doc.review_status !== "uploaded" && doc.execution_status === "needs_review")
    out.push({ kind: "missing_execution", title: "Missing signature / execution evidence" });
  if (doc.review_status === "approved") {
    if (doc.expiration_date) {
      const d = daysBetween(today, doc.expiration_date);
      if (d >= 0 && d <= 60) out.push({ kind: "expiring", title: `Contract expiring in ${d} days` });
    }
    const deadline = noticeDeadline(doc.expiration_date, doc.notice_days);
    if (deadline) {
      const d = daysBetween(today, deadline);
      if (d >= 0 && d <= 30) out.push({ kind: "notice_deadline", title: `Notice deadline in ${d} days` });
    }
  }
  return out;
}
