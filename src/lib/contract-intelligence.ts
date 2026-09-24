import { EXTENDED_RELATIONSHIP_TYPES } from "@/lib/contract-coverage";
/**
 * Contract intelligence — pure, deterministic rules (browser-safe, no I/O).
 *
 * Everything here works only from human-reviewed terms and reviewer-recorded
 * relationships. Nothing decides which legal provision controls, whether a
 * contract is enforceable, or whether it was executed. Where the approved
 * terms don't give enough information, the answer is "unable to calculate",
 * never a guess.
 */
import { TERM_CATALOG, parseDays } from "@/lib/contract-ingestion";

/* ------------------------------------------------------------------ types */

export type TermLite = {
  id?: string;
  term_key: string;
  label?: string;
  category?: string;
  current_value: string | null;
  amount_cents: number | null;
  service_key: string | null;
  status: "needs_review" | "confirmed" | "corrected" | "not_applicable";
  source_page?: string | null;
  source_section?: string | null;
  source_quote?: string | null;
};

export type DocLite = {
  id: string;
  client_id: string;
  doc_type: string;
  title: string;
  version?: number;
  review_status: string;
  execution_status: string;
  precedence_status: string;
  effective_date: string | null;
  expiration_date: string | null;
  notice_days: number | null;
  applies_to_offering_ids: string[];
  applies_to_service_keys?: string[];
  parent_document_id?: string | null;
  supersedes_id?: string | null;
  terminated_on?: string | null;
};

export type Relationship = {
  id: string;
  document_id: string;
  related_document_id: string | null;
  relationship_type: RelationshipType;
  scope: "client_wide" | "fund" | "service";
  status: "active" | "retired";
};

export const RELATIONSHIP_TYPES = EXTENDED_RELATIONSHIP_TYPES.map((r) => ({ value: r.value, label: r.label })) as unknown as readonly { value: (typeof EXTENDED_RELATIONSHIP_TYPES)[number]["value"]; label: string }[];
export type RelationshipType = (typeof EXTENDED_RELATIONSHIP_TYPES)[number]["value"];

/** Relationship types where the reviewer must give a reason. */
export const RELATIONSHIP_NEEDS_REASON: RelationshipType[] = [
  "controls_fund_scope",
  "controls_service_scope",
  "msa_controls_except_override",
  "other",
];

export function relationshipProblem(input: {
  relationship_type: RelationshipType;
  related_document_id: string | null;
  document_id: string;
  reason: string | null | undefined;
  scope: "client_wide" | "fund" | "service" | "provision";
  offering_ids: string[];
  service_keys: string[];
  provision_reference?: string | null;
}): string | null {
  if (input.related_document_id === input.document_id) return "A document can't relate to itself.";
  if (input.relationship_type !== "other" && !input.related_document_id)
    return "Choose the related document.";
  if (RELATIONSHIP_NEEDS_REASON.includes(input.relationship_type) && !(input.reason ?? "").trim())
    return "Give the reason or source provision for this relationship.";
  if (input.scope === "fund" && input.offering_ids.length === 0) return "Choose the Fund this applies to.";
  if (input.scope === "service" && input.service_keys.length === 0) return "Choose the Service this applies to.";
  if (input.scope === "provision" && !(input.provision_reference ?? "").trim()) return "Name the provision this applies to.";
  return null;
}

/* --------------------------------------------------------------- helpers */

const reviewed = (t: TermLite | undefined) =>
  !!t && (t.status === "confirmed" || t.status === "corrected");
const reviewedValue = (terms: TermLite[], key: string) => {
  const t = terms.find((x) => x.term_key === key);
  return reviewed(t) ? (t!.current_value ?? null) : null;
};
const normText = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
const daysUntil = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, eighteen: 18, twenty: 20, "twenty-four": 24, thirty: 30, "thirty-six": 36,
};

/** "12 months", "one (1) year", "3 years" → months. Anything else → null (never guessed). */
export function parseTermMonths(text: string | null | undefined): number | null {
  const s = normText(text).replace(/\(\s*\d+\s*\)/g, " ");
  if (!s) return null;
  const m = s.match(/(\d+|[a-z-]+)\s*(?:-|\s)?\s*(years?|yrs?|months?|mos?)\b/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : WORD_NUM[m[1]!];
  if (!n) return null;
  return m[2]!.startsWith("y") ? n * 12 : n;
}

/** Reviewed auto-renewal value → true / false / null (unclear stays unclear). */
export function parseAutoRenew(text: string | null | undefined): boolean | null {
  const s = normText(text);
  if (!s) return null;
  if (/\b(no|none|not|does not|doesn't|will not|won't)\b/.test(s)) return false;
  if (/\b(yes|automatic(ally)?|auto-?renew(s|al)?|renews?)\b/.test(s)) return true;
  return null;
}

/* ------------------------------------------------------ compare versions */

/** Terms the comparison always highlights (spec §1). */
export const HIGHLIGHT_KEYS = new Set([
  "harmonious_entity", "client_entity", "other_parties",
  "effective_date", "initial_term", "expiration_date",
  "auto_renewal", "renewal_period", "renewal_notice_deadline",
  "termination_notice", "termination_rights", "termination_type", "cancellation_fees",
  "notice_delivery_method", "notice_recipient",
  "contracted_services", "covered_entities", "included_work", "excluded_work",
  "setup_fee", "annual_fee", "recurring_fee", "per_fund_fee", "per_investor_fee", "k1_tax_fee",
  "filing_fee", "transaction_fee", "hourly_fee", "minimum_fee", "discounts_credits", "payment_terms",
  "liability_summary", "indemnification", "confidentiality", "data_security",
  "governing_law", "dispute_resolution", "assignment", "subcontractors",
  "precedence_clause", "signatories", "special_terms",
  "doc:effective_date", "doc:expiration_date", "doc:notice_days", "doc:notice_deadline",
  "doc:funds", "doc:services", "doc:precedence", "doc:execution",
]);

export type CompareSide = {
  value: string | null;
  amountCents: number | null;
  reviewed: boolean;
  termId: string | null;
  page: string | null;
  section: string | null;
  quote: string | null;
} | null;

export type CompareRow = {
  key: string;
  label: string;
  category: string;
  kind: "added" | "removed" | "changed" | "unchanged";
  highlight: boolean;
  before: CompareSide;
  after: CompareSide;
};

function sideFromTerm(t: TermLite | undefined): CompareSide {
  if (!t || t.status === "not_applicable") return null;
  if (t.current_value == null && t.amount_cents == null) return null;
  return {
    value: t.current_value,
    amountCents: t.amount_cents,
    reviewed: reviewed(t),
    termId: t.id ?? null,
    page: t.source_page ?? null,
    section: t.source_section ?? null,
    quote: t.source_quote ?? null,
  };
}
const docSide = (value: string | null): CompareSide =>
  value == null || value === "" ? null : { value, amountCents: null, reviewed: true, termId: null, page: null, section: null, quote: null };

function docFields(d: DocLite, names: { funds: (ids: string[]) => string; services: (keys: string[]) => string }) {
  const deadline = d.expiration_date && d.notice_days != null ? addDays(d.expiration_date, -d.notice_days) : null;
  return {
    "doc:effective_date": ["Effective date (confirmed)", d.effective_date],
    "doc:expiration_date": ["Expiration (confirmed)", d.expiration_date],
    "doc:notice_days": ["Notice period (days)", d.notice_days == null ? null : String(d.notice_days)],
    "doc:notice_deadline": ["Notice deadline", deadline],
    "doc:funds": ["Fund applicability", d.applies_to_offering_ids.length ? names.funds(d.applies_to_offering_ids) : "Client-wide"],
    "doc:services": ["Service applicability", (d.applies_to_service_keys ?? []).length ? names.services(d.applies_to_service_keys!) : "All contracted services"],
    "doc:precedence": ["Document precedence", d.precedence_status],
    "doc:execution": ["Signatures / execution", d.execution_status],
  } as Record<string, [string, string | null]>;
}

function sameSide(a: CompareSide, b: CompareSide) {
  if (!a || !b) return false;
  if ((a.amountCents ?? null) !== (b.amountCents ?? null)) return false;
  return normText(a.value) === normText(b.value);
}

/**
 * Side-by-side comparison of two documents' structured terms. Purely
 * mechanical: it says what changed, never what the change means legally.
 */
export function compareDocuments(
  before: { doc: DocLite; terms: TermLite[] },
  after: { doc: DocLite; terms: TermLite[] },
  names = { funds: (ids: string[]) => ids.join(", "), services: (keys: string[]) => keys.join(", ") },
): { rows: CompareRow[]; basedOnApprovedTerms: boolean; counts: Record<CompareRow["kind"], number> } {
  const rows: CompareRow[] = [];
  const push = (key: string, label: string, category: string, b: CompareSide, a: CompareSide) => {
    if (!b && !a) return;
    const kind: CompareRow["kind"] = !b ? "added" : !a ? "removed" : sameSide(b, a) ? "unchanged" : "changed";
    rows.push({ key, label, category, kind, highlight: HIGHLIGHT_KEYS.has(key), before: b, after: a });
  };
  for (const def of TERM_CATALOG) {
    push(
      def.key,
      def.label,
      def.category,
      sideFromTerm(before.terms.find((t) => t.term_key === def.key)),
      sideFromTerm(after.terms.find((t) => t.term_key === def.key)),
    );
  }
  const bf = docFields(before.doc, names);
  const af = docFields(after.doc, names);
  for (const k of Object.keys(bf)) push(k, bf[k]![0], "Document", docSide(bf[k]![1]), docSide(af[k]![1]));
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  rows.forEach((r) => counts[r.kind]++);
  const approved = (s: string) => s === "approved" || s === "superseded";
  return {
    rows,
    basedOnApprovedTerms: approved(before.doc.review_status) && approved(after.doc.review_status),
    counts,
  };
}

/* ---------------------------------------------------- document graph */

export type FamilyNode = { doc: DocLite; children: FamilyNode[]; links: { type: string; to: string }[] };

/**
 * Client → Master agreement → SOW → Amendment → New version, built only from
 * explicit links (parent / supersedes set at upload, or reviewer-recorded
 * relationships) — never from upload order.
 */
export function buildFamily(docs: DocLite[], rels: Relationship[]): FamilyNode[] {
  const byId = new Map(docs.map((d) => [d.id, { doc: d, children: [] as FamilyNode[], links: [] as { type: string; to: string }[] }]));
  const parentOf = new Map<string, string>();
  for (const d of docs) {
    const p = d.parent_document_id ?? d.supersedes_id ?? null;
    if (p && byId.has(p)) {
      parentOf.set(d.id, p);
      byId.get(d.id)!.links.push({ type: d.parent_document_id ? "amends" : "supersedes", to: p });
    }
  }
  for (const r of rels) {
    if (r.status !== "active" || !r.related_document_id || !byId.has(r.document_id) || !byId.has(r.related_document_id)) continue;
    byId.get(r.document_id)!.links.push({ type: r.relationship_type, to: r.related_document_id });
    if (!parentOf.has(r.document_id) && !createsCycle(parentOf, r.document_id, r.related_document_id))
      parentOf.set(r.document_id, r.related_document_id);
  }
  const roots: FamilyNode[] = [];
  for (const [id, node] of byId) {
    const p = parentOf.get(id);
    if (p && byId.has(p)) byId.get(p)!.children.push(node);
    else roots.push(node);
  }
  const rank = (t: string) => ["msa", "engagement", "sow", "pricing_schedule", "addendum", "amendment", "other"].indexOf(t);
  const sort = (ns: FamilyNode[]) => {
    ns.sort((a, b) => rank(a.doc.doc_type) - rank(b.doc.doc_type) || String(a.doc.effective_date ?? "").localeCompare(String(b.doc.effective_date ?? "")));
    ns.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
function createsCycle(parentOf: Map<string, string>, child: string, parent: string) {
  let cur: string | undefined = parent;
  for (let i = 0; cur && i < 100; i++) {
    if (cur === child) return true;
    cur = parentOf.get(cur);
  }
  return false;
}

/* ------------------------------------------------- conflict detection */

export type ConflictProvision = {
  documentId: string;
  documentTitle: string;
  termKey: string | null;
  value: string | null;
  page: string | null;
  section: string | null;
  quote: string | null;
};
export type ContractConflict = {
  key: string;
  kind:
    | "notice_period"
    | "overlapping_sow"
    | "price"
    | "fund_vs_client_price"
    | "unlinked_amendment"
    | "overlapping_agreement"
    | "renewal"
    | "governing_law"
    | "payment_terms"
    | "precedence_unresolved";
  title: string;
  documentIds: string[];
  provisions: ConflictProvision[];
};
export const CONFLICT_TASK_TITLE = "Contract Scope Conflict — Review Required";

const isActive = (d: DocLite, today: string) =>
  d.review_status !== "superseded" &&
  d.review_status !== "draft" &&
  !(d.terminated_on && d.terminated_on <= today);

function rangesOverlap(a: DocLite, b: DocLite) {
  const aStart = a.effective_date ?? "0000-01-01";
  const bStart = b.effective_date ?? "0000-01-01";
  const aEnd = a.expiration_date ?? a.terminated_on ?? "9999-12-31";
  const bEnd = b.expiration_date ?? b.terminated_on ?? "9999-12-31";
  return aStart <= bEnd && bStart <= aEnd;
}
function scopesOverlap(a: DocLite, b: DocLite) {
  const fa = a.applies_to_offering_ids, fb = b.applies_to_offering_ids;
  const funds = !fa.length || !fb.length || fa.some((x) => fb.includes(x));
  const sa = a.applies_to_service_keys ?? [], sb = b.applies_to_service_keys ?? [];
  const services = !sa.length || !sb.length || sa.some((x) => sb.includes(x));
  return funds && services;
}
const directlyLinked = (a: DocLite, b: DocLite) =>
  a.parent_document_id === b.id || b.parent_document_id === a.id || a.supersedes_id === b.id || b.supersedes_id === a.id;

/**
 * A pair counts as resolved only when a reviewer recorded an active relationship
 * between the two documents AND confirmed precedence on the document carrying it.
 */
function pairResolved(a: DocLite, b: DocLite, rels: Relationship[]) {
  return rels.some((r) => {
    if (r.status !== "active") return false;
    const pair = (r.document_id === a.id && r.related_document_id === b.id) || (r.document_id === b.id && r.related_document_id === a.id);
    if (!pair) return false;
    const holder = r.document_id === a.id ? a : b;
    return holder.precedence_status === "confirmed";
  });
}
const supersedesPair = (a: DocLite, b: DocLite, rels: Relationship[]) =>
  a.supersedes_id === b.id ||
  b.supersedes_id === a.id ||
  rels.some(
    (r) => r.status === "active" && r.relationship_type === "supersedes" &&
      ((r.document_id === a.id && r.related_document_id === b.id) || (r.document_id === b.id && r.related_document_id === a.id)),
  );

function provision(d: DocLite, t: TermLite | undefined, key: string | null): ConflictProvision {
  return {
    documentId: d.id,
    documentTitle: d.title,
    termKey: key,
    value: t ? t.current_value : null,
    page: t?.source_page ?? null,
    section: t?.source_section ?? null,
    quote: t?.source_quote ?? null,
  };
}

/**
 * Deterministic conflict detection over human-reviewed terms. It flags; it never
 * decides which provision wins. Output is stable and de-duplicated by key.
 */
export function detectConflicts(
  docs: (DocLite & { terms: TermLite[] })[],
  rels: Relationship[],
  today: string,
): ContractConflict[] {
  const active = docs.filter((d) => isActive(d, today));
  const out = new Map<string, ContractConflict>();
  const add = (c: Omit<ContractConflict, "key"> & { extra?: string }) => {
    const key = `${c.kind}:${[...c.documentIds].sort().join("+")}${c.extra ? `:${c.extra}` : ""}`;
    if (!out.has(key)) out.set(key, { key, kind: c.kind, title: c.title, documentIds: c.documentIds, provisions: c.provisions });
  };
  const termOf = (d: DocLite & { terms: TermLite[] }, key: string) => {
    const t = d.terms.find((x) => x.term_key === key);
    return reviewed(t) ? t : undefined;
  };

  // Unlinked amendments.
  for (const d of active) {
    if (d.doc_type !== "amendment") continue;
    const linked = d.parent_document_id || rels.some((r) => r.status === "active" && r.related_document_id && (r.document_id === d.id || r.related_document_id === d.id));
    if (!linked)
      add({ kind: "unlinked_amendment", title: "Amendment appears to modify an agreement but isn't linked", documentIds: [d.id], provisions: [provision(d, undefined, null)] });
  }

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!, b = active[j]!;
      if (!rangesOverlap(a, b)) continue;
      const related = directlyLinked(a, b) || scopesOverlap(a, b);
      if (!related) continue;
      const resolved = pairResolved(a, b, rels);
      const superseded = supersedesPair(a, b, rels);

      // Term-by-term disagreements.
      const textConflict = (key: string, kind: ContractConflict["kind"], title: string, cmp: (x: string, y: string) => boolean) => {
        const ta = termOf(a, key), tb = termOf(b, key);
        if (!ta || !tb || ta.current_value == null || tb.current_value == null) return;
        if (cmp(ta.current_value, tb.current_value)) return;
        if (resolved || superseded) return;
        add({ kind, title, documentIds: [a.id, b.id], provisions: [provision(a, ta, key), provision(b, tb, key)] });
      };
      textConflict("termination_notice", "notice_period", "Different termination notice periods", (x, y) => {
        const dx = parseDays(x), dy = parseDays(y);
        return dx != null && dy != null ? dx === dy : normText(x) === normText(y);
      });
      textConflict("auto_renewal", "renewal", "Conflicting renewal provisions", (x, y) => parseAutoRenew(x) === parseAutoRenew(y) && parseAutoRenew(x) !== null || normText(x) === normText(y));
      textConflict("governing_law", "governing_law", "Conflicting governing law", (x, y) => normText(x) === normText(y));
      textConflict("payment_terms", "payment_terms", "Conflicting payment terms", (x, y) => normText(x) === normText(y));

      // Pricing disagreements for the same service and overlapping period.
      for (const ta of a.terms) {
        if (!reviewed(ta) || ta.amount_cents == null || !ta.service_key) continue;
        const tb = b.terms.find((x) => reviewed(x) && x.service_key === ta.service_key && x.amount_cents != null && x.term_key === ta.term_key);
        if (!tb || tb.amount_cents === ta.amount_cents || resolved || superseded) continue;
        const aFund = a.applies_to_offering_ids.length > 0, bFund = b.applies_to_offering_ids.length > 0;
        const kind = aFund !== bFund ? "fund_vs_client_price" : "price";
        add({
          kind,
          title: kind === "price" ? "Different prices for the same service and period" : "Fund-specific price differs from client-wide price",
          documentIds: [a.id, b.id],
          provisions: [provision(a, ta, ta.term_key), provision(b, tb, tb.term_key)],
          extra: `${ta.service_key}:${ta.term_key}`,
        });
      }

      // Overlapping governing documents of the same kind.
      if (a.doc_type === "sow" && b.doc_type === "sow" && scopesOverlap(a, b) && !resolved && !superseded)
        add({ kind: "overlapping_sow", title: "Two active SOWs appear to govern the same Fund / service", documentIds: [a.id, b.id], provisions: [provision(a, undefined, null), provision(b, undefined, null)] });
      const master = (t: string) => t === "msa" || t === "engagement";
      if (master(a.doc_type) && master(b.doc_type) && !resolved && !superseded)
        add({ kind: "overlapping_agreement", title: "New agreement overlaps an existing agreement", documentIds: [a.id, b.id], provisions: [provision(a, undefined, null), provision(b, undefined, null)] });
    }
  }

  // Precedence still open on a document that sits in a family with other active documents.
  for (const d of active) {
    if (d.precedence_status !== "requires_review" || d.review_status === "uploaded") continue;
    const family = active.filter((o) => o.id !== d.id && (directlyLinked(d, o) || scopesOverlap(d, o)));
    if (family.length)
      add({ kind: "precedence_unresolved", title: "Precedence hasn't resolved which term controls", documentIds: [d.id], provisions: [provision(d, termOf(d, "precedence_clause"), "precedence_clause")] });
  }
  return [...out.values()];
}

/* ----------------------------------------------------- lifecycle engine */

export const LIFECYCLE_STATUSES = [
  "Draft", "Awaiting Review", "Awaiting Signature Confirmation", "Future Effective", "Active",
  "Renewal Window", "Notice Window", "Expiring", "Expired", "Superseded", "Terminated",
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];
export const UNABLE = "Unable to calculate — review required";

export type Lifecycle = {
  status: LifecycleStatus;
  effectiveDate: string | null;
  initialTermEnd: string | null;
  autoRenews: boolean | null;
  renewalDate: string | null;
  currentTermEnd: string | null;
  expirationDate: string | null;
  noticePeriodDays: number | null;
  noticeDeadline: string | null;
  unable: string[];
};

export const RENEWAL_WINDOW_DAYS = 60;
export const NOTICE_WINDOW_DAYS = 30;
export const EXPIRING_DAYS = 60;

/** Lifecycle dates from approved terms only. Missing inputs → listed in `unable`, never guessed. */
export function computeLifecycle(doc: DocLite, terms: TermLite[], today: string): Lifecycle {
  const unable: string[] = [];
  const effectiveDate = doc.effective_date ?? null;
  if (!effectiveDate) unable.push("effective date");
  const months = parseTermMonths(reviewedValue(terms, "initial_term"));
  let initialTermEnd = doc.expiration_date ?? null;
  if (!initialTermEnd && effectiveDate && months) initialTermEnd = addDays(addMonths(effectiveDate, months), -1);
  if (!initialTermEnd) unable.push("initial term end");
  const autoRenews = parseAutoRenew(reviewedValue(terms, "auto_renewal"));
  const renewalMonths = parseTermMonths(reviewedValue(terms, "renewal_period"));

  let renewalDate: string | null = null;
  let currentTermEnd: string | null = initialTermEnd;
  if (autoRenews === true && initialTermEnd) {
    renewalDate = addDays(initialTermEnd, 1);
    if (renewalDate <= today) {
      if (!renewalMonths) {
        renewalDate = null;
        currentTermEnd = null;
        unable.push("renewal period");
      } else {
        let end = initialTermEnd;
        for (let i = 0; i < 200 && addDays(end, 1) <= today; i++) end = addDays(addMonths(addDays(end, 1), renewalMonths), -1);
        currentTermEnd = end;
        renewalDate = addDays(end, 1);
      }
    }
  } else if (autoRenews === null && initialTermEnd) {
    unable.push("renewal (automatic renewal not stated)");
  }
  const expirationDate = autoRenews === false ? initialTermEnd : null;

  const noticePeriodDays = doc.notice_days ?? parseDays(reviewedValue(terms, "termination_notice"));
  const renewalNotice = parseDays(reviewedValue(terms, "renewal_notice_deadline"));
  const deadlineDays = autoRenews === true ? (renewalNotice ?? noticePeriodDays) : noticePeriodDays;
  const noticeDeadline = currentTermEnd && deadlineDays != null ? addDays(currentTermEnd, -deadlineDays) : null;
  if (!noticeDeadline) unable.push("notice deadline");

  let status: LifecycleStatus;
  if (doc.review_status === "superseded") status = "Superseded";
  else if (doc.terminated_on && doc.terminated_on <= today) status = "Terminated";
  else if (doc.review_status === "draft") status = "Draft";
  else if (doc.review_status !== "approved") status = "Awaiting Review";
  else if (doc.execution_status !== "executed_confirmed") status = "Awaiting Signature Confirmation";
  else if (effectiveDate && effectiveDate > today) status = "Future Effective";
  else if (expirationDate && expirationDate < today) status = "Expired";
  else if (noticeDeadline && daysUntil(today, noticeDeadline) >= 0 && daysUntil(today, noticeDeadline) <= NOTICE_WINDOW_DAYS) status = "Notice Window";
  else if (renewalDate && daysUntil(today, renewalDate) >= 0 && daysUntil(today, renewalDate) <= RENEWAL_WINDOW_DAYS) status = "Renewal Window";
  else if (expirationDate && daysUntil(today, expirationDate) <= EXPIRING_DAYS) status = "Expiring";
  else status = "Active";

  return { status, effectiveDate, initialTermEnd, autoRenews, renewalDate, currentTermEnd, expirationDate, noticePeriodDays, noticeDeadline, unable };
}

/** Configured reminder intervals (days before a renewal date). */
export const RENEWAL_REMINDER_DAYS = [90, 60, 30, 14] as const;

/**
 * At most one renewal reminder per document: the tightest interval reached.
 * It is a reminder only — nothing renews, terminates or sends notice.
 */
export function renewalReminder(lc: Lifecycle, today: string): { daysLeft: number; bucket: number } | null {
  if (!lc.renewalDate || lc.status === "Superseded" || lc.status === "Terminated") return null;
  const left = daysUntil(today, lc.renewalDate);
  if (left < 0) return null;
  const hit = [...RENEWAL_REMINDER_DAYS].sort((a, b) => a - b).find((b) => left <= b);
  return hit == null ? null : { daysLeft: left, bucket: hit };
}

/** Contract 360 termination / notice summary from approved terms (display only). */
export function terminationSummary(doc: DocLite, terms: TermLite[], lc: Lifecycle) {
  const pick = (key: string) => {
    const t = terms.find((x) => x.term_key === key);
    return reviewed(t) ? { value: t!.current_value, page: t!.source_page ?? null, section: t!.source_section ?? null } : null;
  };
  return {
    terminationType: pick("termination_type"),
    rights: pick("termination_rights"),
    notice: pick("termination_notice"),
    noticePeriodDays: lc.noticePeriodDays,
    noticeDeadline: lc.noticeDeadline,
    deliveryMethod: pick("notice_delivery_method"),
    recipient: pick("notice_recipient"),
    fee: pick("cancellation_fees"),
  };
}

/* ---------------------------------------- effective-dated price resolution */

export type PriceRow = {
  id: string;
  service_key: string | null;
  offering_id: string | null;
  effective_date: string | null;
  contracted_cents: number | null;
  pricing_source: string;
  source_document_id: string | null;
  superseded_at?: string | null;
};

export type PriceResolution<T extends PriceRow = PriceRow> =
  | { status: "resolved"; row: T }
  | { status: "conflict"; rows: T[] }
  | { status: "none" };

/**
 * Client + Fund (if any) + Service + Date → the approved contract price.
 * History is kept: superseded rows still answer for dates before their
 * replacement took effect. Equally-applicable rows with different amounts are
 * a conflict — never silently chosen.
 */
export function resolveContractPrice<T extends PriceRow>(
  rows: T[],
  q: { serviceKey: string; offeringId: string | null; onDate: string },
): PriceResolution<T> {
  const dated = rows.filter(
    (r) => r.pricing_source === "contract" && r.service_key === q.serviceKey && r.effective_date && r.effective_date <= q.onDate &&
      (r.offering_id === null || r.offering_id === q.offeringId),
  );
  if (!dated.length) return { status: "none" };
  const fundLevel = dated.filter((r) => r.offering_id !== null);
  const pool = fundLevel.length ? fundLevel : dated;
  const latest = pool.reduce((m, r) => (r.effective_date! > m ? r.effective_date! : m), "");
  const top = pool.filter((r) => r.effective_date === latest);
  const amounts = new Set(top.map((r) => r.contracted_cents));
  if (amounts.size > 1) return { status: "conflict", rows: top };
  return { status: "resolved", row: top[0]! };
}

/* ------------------------------------------------ granular permissions */

export const CONTRACT_CAPABILITIES = [
  { value: "view_contracts", label: "View Contracts" },
  { value: "upload_contracts", label: "Upload Contracts" },
  { value: "review_terms", label: "Review Extracted Terms" },
  { value: "correct_terms", label: "Correct Contract Terms" },
  { value: "confirm_execution", label: "Confirm Execution" },
  { value: "review_precedence", label: "Review Precedence" },
  { value: "approve_terms", label: "Approve Contract Terms" },
  { value: "configure_pricing", label: "Configure Contract Pricing" },
  { value: "view_pricing", label: "View Contract Pricing" },
  { value: "generate_standard", label: "Generate Standard Agreement" },
  { value: "approve_precedence", label: "Approve Precedence Determinations" },
] as const;
export type ContractCapability = (typeof CONTRACT_CAPABILITIES)[number]["value"];
const ALL_CC = CONTRACT_CAPABILITIES.map((c) => c.value) as ContractCapability[];

/** Baseline by role; explicit grants add to it. Ordinary Operations never approves. */
const CONTRACT_ROLE_BASELINE: Record<string, ContractCapability[]> = {
  super_admin: ALL_CC,
  admin: ALL_CC,
  legal: ["view_contracts", "upload_contracts", "review_terms", "correct_terms", "confirm_execution", "review_precedence", "approve_terms", "view_pricing", "generate_standard", "approve_precedence"],
  finance: ["view_contracts", "view_pricing", "configure_pricing"],
  operations: ["view_contracts", "upload_contracts", "review_terms", "correct_terms"],
  client_success: ["view_contracts", "upload_contracts", "review_terms"],
  compliance: ["view_contracts", "view_pricing"],
  executive: ["view_contracts", "view_pricing"],
};
const STAFF_ROLES = new Set(Object.keys(CONTRACT_ROLE_BASELINE).concat(["fund_administration", "tax"]));

/**
 * Contract capabilities for a person. Explicit grants only count for active
 * Harmonious staff — a Fund Manager or investor gets nothing, whatever a grant row says.
 */
export function contractCapabilitiesFor(roles: readonly string[], grants: readonly string[] = []): ContractCapability[] {
  if (!roles.some((r) => STAFF_ROLES.has(r))) return [];
  const out = new Set<ContractCapability>();
  for (const r of roles) for (const c of CONTRACT_ROLE_BASELINE[r] ?? []) out.add(c);
  for (const g of grants) if ((ALL_CC as string[]).includes(g)) out.add(g as ContractCapability);
  return [...out].sort();
}

/** Approving is the only path to operational terms and needs the explicit capability. */
export function mayApproveTerms(caps: readonly ContractCapability[]) {
  return caps.includes("approve_terms");
}

/* ------------------------------------------- Harmonious standard agreement */

export const STANDARD_FIELDS = [
  { key: "client_legal_name", label: "Client legal name", required: true },
  { key: "client_display_name", label: "Client display name", required: false },
  { key: "client_entity_type", label: "Client entity type", required: false },
  { key: "client_jurisdiction", label: "State / jurisdiction", required: false },
  { key: "client_address", label: "Client address", required: false },
  { key: "client_notice_email", label: "Client notice email", required: false },
  { key: "effective_date", label: "Effective date", required: true },
  { key: "services", label: "Services / scope", required: true },
] as const;
export type StandardFieldKey = (typeof STANDARD_FIELDS)[number]["key"];

/**
 * Fill only the allowed business fields into the approved template. Every
 * other character of the approved legal language is kept exactly as written.
 */
export function renderStandardAgreement(
  sections: { section_no: string; title: string; body: string; sort_order?: number }[],
  fields: Partial<Record<StandardFieldKey, string>>,
) {
  const allowed = new Set<string>(STANDARD_FIELDS.map((f) => f.key));
  const unknown = new Set<string>();
  const used = new Set<string>();
  const fill = (s: string) =>
    s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => {
      if (!allowed.has(k)) {
        unknown.add(k);
        return m;
      }
      used.add(k);
      const v = fields[k as StandardFieldKey];
      return v && v.trim() ? v.trim() : m;
    });
  const rendered = [...sections]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s) => ({ section_no: s.section_no, title: fill(s.title), body: fill(s.body) }));
  const missing = STANDARD_FIELDS.filter((f) => f.required && !(fields[f.key] ?? "").trim()).map((f) => f.label);
  return { sections: rendered, missing, unknownPlaceholders: [...unknown], usedFields: [...used] };
}

export type StandardDraftState = {
  msa_version_id: string | null;
  standard_status: string | null;
  standard_prepared_by: string | null;
  standard_reviewed_by: string | null;
};

/** What stops a standard agreement from being sent to the signing workflow. */
export function standardSendBlockers(
  version: { id: string; status: string } | null,
  draft: StandardDraftState,
  missingFields: string[],
): string[] {
  const out: string[] = [];
  if (!version) out.push("The selected template version doesn't exist.");
  else {
    if (version.status !== "published") out.push("Only an approved (published) template version can be sent.");
    if (draft.msa_version_id !== version.id) out.push("The draft isn't pinned to this exact template version.");
  }
  if (missingFields.length) out.push(`Missing: ${missingFields.join(", ")}.`);
  if (draft.standard_status !== "approved_to_send") out.push("An authorized Harmonious reviewer must approve the preview first.");
  if (draft.standard_reviewed_by && draft.standard_reviewed_by === draft.standard_prepared_by)
    out.push("The reviewer must be a different person from the preparer.");
  return out;
}

/** Keywords that map an approved template section to a structured term. */
const SECTION_TERM_HINTS: [string, RegExp][] = [
  ["termination_rights", /terminat/i],
  ["auto_renewal", /renew/i],
  ["payment_terms", /payment|invoic/i],
  ["confidentiality", /confidential/i],
  ["governing_law", /governing law/i],
  ["dispute_resolution", /dispute|arbitrat/i],
  ["assignment", /assign/i],
  ["subcontractors", /subcontract|third part/i],
  ["indemnification", /indemn/i],
  ["liability_summary", /liabilit/i],
  ["data_security", /data|privacy|security/i],
  ["precedence_clause", /precedence|order of/i],
];

/**
 * Structured terms for an executed standard agreement come from the approved
 * template itself (plus the populated business fields) — not from AI.
 */
export function standardTemplateTerms(
  version: { version: string },
  sections: { section_no: string; title: string; body: string }[],
  fields: Partial<Record<StandardFieldKey, string>>,
): { term_key: string; value: string; section: string | null; quote: string | null }[] {
  const out: { term_key: string; value: string; section: string | null; quote: string | null }[] = [
    { term_key: "agreement_type", value: `Harmonious Standard Agreement v${version.version}`, section: null, quote: null },
  ];
  if (fields.client_legal_name) out.push({ term_key: "client_entity", value: fields.client_legal_name, section: null, quote: null });
  if (fields.effective_date) out.push({ term_key: "effective_date", value: fields.effective_date, section: null, quote: null });
  if (fields.services) out.push({ term_key: "contracted_services", value: fields.services, section: null, quote: null });
  for (const [key, re] of SECTION_TERM_HINTS) {
    const s = sections.find((x) => re.test(x.title));
    if (s) out.push({ term_key: key, value: `See §${s.section_no} ${s.title} (approved template language)`, section: `§${s.section_no}`, quote: s.body.slice(0, 400) });
  }
  return out;
}
