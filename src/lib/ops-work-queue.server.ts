/**
 * Server side of the Operations work queue (server-only module).
 *
 * Every item below is read straight from the workflow record that owns it —
 * an onboarding, a capital call, a bank line, a journal entry, a valuation, a
 * NAV version, an allocation run, a report, a document. Nothing is written,
 * no status is duplicated, and no due date or owner appears unless the source
 * record actually has one.
 *
 * A collector only runs when the reader may see that area, so unauthorized
 * work is never fetched and then hidden. What survives that is filtered again
 * by the exact step (prepare / review / approve) the item asks for.
 */

import { requireOperations } from "@/lib/ops-access.functions";
import { can, type OpsArea, type OpsCapability } from "@/lib/ops-capabilities";
import { redactActivity } from "@/lib/ops-records";
import {
  UNCONFIGURED_AREAS,
  applyFilters,
  countBy,
  destinationFor,
  filterByCapability,
  groupBySection,
  paginate,
  priorityFor,
  sectionOf,
  sortItems,
  summaryIsSafe,
  type WorkFilters,
  type WorkItem,
  type WorkSection,
} from "@/lib/ops-work-items";

const SOURCE_LIMIT = 200;

const rows = <T = any>(res: { data: any; error: any }): T[] => {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T[];
};

/** A source that fails (missing table, tightened policy) must not blank the page. */
async function safely<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch {
    return [];
  }
}

type Ctx = { userId: string; supabase: any };

type Lookup = {
  funds: Map<string, { name: string; clientId: string | null }>;
  clients: Map<string, string>;
  people: Map<string, string>;
  books: Map<string, string>;
};

async function lookups(s: any): Promise<Lookup> {
  const [offerings, clients, books] = await Promise.all([
    safely(async () => rows(await s.from("offerings").select("id, name, client_id"))),
    safely(async () => rows(await s.from("clients").select("id, name"))),
    safely(async () => rows(await s.from("ledger_books").select("id, offering_id"))),
  ]);
  return {
    funds: new Map(
      offerings.map((f: any) => [f.id, { name: f.name as string, clientId: f.client_id ?? null }]),
    ),
    clients: new Map(clients.map((c: any) => [c.id, c.name as string])),
    people: new Map(),
    books: new Map(books.map((b: any) => [b.id, b.offering_id as string])),
  };
}

async function fillPeople(s: any, lookup: Lookup, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean) as string[])].filter((id) => !lookup.people.has(id));
  if (!unique.length) return;
  const people = await safely(async () =>
    rows(await s.from("profiles").select("user_id, legal_name, email").in("user_id", unique)),
  );
  for (const p of people as any[]) {
    lookup.people.set(p.user_id, p.legal_name || p.email || "Unnamed person");
  }
}

/** Attach fund, client and priority in one place so no collector can forget. */
function build(
  lookup: Lookup,
  now: Date,
  input: Omit<WorkItem, "priority" | "clientId" | "clientName" | "fundName"> & {
    clientId?: string | null;
  },
): WorkItem {
  const fund = input.fundId ? lookup.funds.get(input.fundId) : undefined;
  const clientId = input.clientId ?? fund?.clientId ?? null;
  const item: WorkItem = {
    ...input,
    fundName: fund?.name ?? null,
    clientId,
    clientName: clientId ? (lookup.clients.get(clientId) ?? null) : null,
    investorName: input.investorUserId ? (lookup.people.get(input.investorUserId) ?? null) : null,
    priority: priorityFor(
      {
        area: input.area,
        requiredAction: input.requiredAction,
        ...(input.blocked === undefined ? {} : { blocked: input.blocked }),
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
      },
      now,
    ),
  };
  return item;
}

/* --------------------------------------------------------------- collectors */

async function onboardingItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  const out: WorkItem[] = [];

  let q = s
    .from("investor_onboardings")
    .select(
      "id, offering_id, investor_user_id, investment_profile_id, stage, funding_status, assigned_to, last_activity_at, updated_at",
    )
    .in("stage", ["verification", "eligibility", "subscription", "signature", "harmonious_review"])
    .is("closed_at", null)
    .limit(SOURCE_LIMIT);
  if (fundId) q = q.eq("offering_id", fundId);
  const onboardings = await safely(async () => rows(await q));
  await fillPeople(
    s,
    lookup,
    onboardings.flatMap((o: any) => [o.investor_user_id, o.assigned_to]),
  );
  for (const o of onboardings as any[]) {
    const identity = o.stage === "verification";
    out.push(
      build(lookup, now, {
        id: `onboarding:${o.id}`,
        source: "onboarding.review",
        area: "onboarding",
        recordType: "investor",
        recordId: o.investor_user_id,
        recordTab: identity ? "identity" : "investments",
        title: `${lookup.people.get(o.investor_user_id) ?? "Investor"} — onboarding`,
        reason:
          o.stage === "harmonious_review"
            ? "Submitted for Harmonious review"
            : `Waiting at the ${o.stage.replace(/_/g, " ")} step`,
        workflowState: o.stage,
        requiredAction: o.stage === "harmonious_review" ? "review" : "prepare",
        fundId: o.offering_id,
        investorUserId: o.investor_user_id,
        investmentProfileId: o.investment_profile_id,
        assignedTo: o.assigned_to ?? null,
        assignedToName: o.assigned_to ? (lookup.people.get(o.assigned_to) ?? null) : null,
        dueDate: null,
        at: o.last_activity_at ?? o.updated_at ?? null,
      }),
    );
  }

  const exceptions = await safely(async () =>
    rows(
      await s
        .from("investor_onboarding_exceptions")
        .select("id, onboarding_id, exception_type, severity, owner, status, detail, created_at")
        .neq("status", "resolved")
        .limit(SOURCE_LIMIT),
    ),
  );
  const byId = new Map((onboardings as any[]).map((o) => [o.id, o]));
  for (const e of exceptions as any[]) {
    const parent = byId.get(e.onboarding_id);
    if (!parent) continue;
    if (fundId && parent.offering_id !== fundId) continue;
    out.push(
      build(lookup, now, {
        id: `onboarding-exception:${e.id}`,
        source: "onboarding.exception",
        area: "onboarding",
        recordType: "investor",
        recordId: parent.investor_user_id,
        recordTab: "identity",
        title: `${lookup.people.get(parent.investor_user_id) ?? "Investor"} — onboarding exception`,
        reason: String(e.exception_type ?? "Exception raised").replace(/_/g, " "),
        workflowState: String(e.status ?? "open"),
        requiredAction: "review",
        fundId: parent.offering_id,
        investorUserId: parent.investor_user_id,
        assignedTo: null,
        assignedToName: typeof e.owner === "string" ? e.owner : null,
        blocked: true,
        blockReason: String(e.exception_type ?? "Exception raised").replace(/_/g, " "),
        at: e.created_at ?? null,
      }),
    );
  }

  const holds = await safely(async () =>
    rows(
      await s
        .from("compliance_holds")
        .select("id, client_id, offering_id, subject_user_id, scope, reason, status, placed_at")
        .eq("status", "active")
        .limit(SOURCE_LIMIT),
    ),
  );
  await fillPeople(s, lookup, (holds as any[]).map((h) => h.subject_user_id));
  for (const h of holds as any[]) {
    if (fundId && h.offering_id !== fundId) continue;
    const onInvestor = Boolean(h.subject_user_id);
    out.push(
      build(lookup, now, {
        id: `hold:${h.id}`,
        source: "onboarding.hold",
        area: "onboarding",
        recordType: onInvestor ? "investor" : "fund",
        recordId: onInvestor ? h.subject_user_id : h.offering_id,
        recordTab: onInvestor ? "identity" : "overview",
        title: onInvestor
          ? `${lookup.people.get(h.subject_user_id) ?? "Investor"} — compliance hold`
          : "Compliance hold on the fund",
        reason: "A compliance hold is in place",
        workflowState: "active",
        requiredAction: "review",
        clientId: h.client_id ?? null,
        fundId: h.offering_id ?? null,
        investorUserId: h.subject_user_id ?? null,
        blocked: true,
        blockReason: String(h.reason ?? "Compliance hold"),
        at: h.placed_at ?? null,
      }),
    );
  }

  return out;
}

async function identityItems(s: any, lookup: Lookup, now: Date) {
  const applications = await safely(async () =>
    rows(
      await s
        .from("investor_applications")
        .select("id, user_id, offering_id, status, kyc_status, aml_status, accreditation_status")
        .limit(SOURCE_LIMIT),
    ),
  );
  const byApp = new Map((applications as any[]).map((a) => [a.id, a]));
  await fillPeople(s, lookup, (applications as any[]).map((a) => a.user_id));

  const [kyc, accreditation] = await Promise.all([
    safely(async () =>
      rows(
        await s
          .from("kyc_verifications")
          .select("id, application_id, status, expired_at, updated_at")
          .limit(SOURCE_LIMIT),
      ),
    ),
    safely(async () =>
      rows(
        await s
          .from("accreditation_records")
          .select("id, application_id, status, expires_at, updated_at")
          .limit(SOURCE_LIMIT),
      ),
    ),
  ]);

  const out: WorkItem[] = [];
  for (const k of kyc as any[]) {
    const app = byApp.get(k.application_id);
    if (!app) continue;
    const waiting = ["pending", "review", "in_review", "requires_review", "failed"].includes(
      String(k.status),
    );
    if (!waiting) continue;
    out.push(
      build(lookup, now, {
        id: `kyc:${k.id}`,
        source: "onboarding.kyc",
        area: "onboarding",
        recordType: "investor",
        recordId: app.user_id,
        recordTab: "identity",
        title: `${lookup.people.get(app.user_id) ?? "Investor"} — identity check`,
        reason: "Identity verification needs a decision",
        workflowState: String(k.status),
        requiredAction: "review",
        fundId: app.offering_id ?? null,
        investorUserId: app.user_id,
        dueDate: k.expired_at ?? null,
        at: k.updated_at ?? null,
      }),
    );
  }
  for (const a of accreditation as any[]) {
    const app = byApp.get(a.application_id);
    if (!app) continue;
    const waiting = ["pending", "review", "submitted"].includes(String(a.status));
    if (!waiting) continue;
    out.push(
      build(lookup, now, {
        id: `accreditation:${a.id}`,
        source: "onboarding.accreditation",
        area: "onboarding",
        recordType: "investor",
        recordId: app.user_id,
        recordTab: "identity",
        title: `${lookup.people.get(app.user_id) ?? "Investor"} — accreditation`,
        reason: "Accreditation needs a decision",
        workflowState: String(a.status),
        requiredAction: "review",
        fundId: app.offering_id ?? null,
        investorUserId: app.user_id,
        dueDate: a.expires_at ?? null,
        at: a.updated_at ?? null,
      }),
    );
  }
  return out;
}

async function capitalItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  const out: WorkItem[] = [];

  let callQ = s
    .from("capital_calls")
    .select("id, offering_id, call_number, title, status, due_date, prepared_by, updated_at")
    .in("status", ["draft", "requested", "in_review"])
    .limit(SOURCE_LIMIT);
  if (fundId) callQ = callQ.eq("offering_id", fundId);
  for (const c of (await safely(async () => rows(await callQ))) as any[]) {
    const action = c.status === "draft" ? "prepare" : c.status === "requested" ? "review" : "approve";
    out.push(
      build(lookup, now, {
        id: `capital-call:${c.id}`,
        source: "capital.call",
        area: "capital",
        recordType: "fund",
        recordId: c.offering_id,
        recordTab: "capital",
        title: `Capital call ${c.call_number ?? ""}`.trim(),
        reason:
          action === "prepare"
            ? "Capital call is still being prepared"
            : action === "review"
              ? "Capital call is waiting for review"
              : "Capital call is waiting for approval",
        workflowState: String(c.status),
        requiredAction: action,
        fundId: c.offering_id,
        dueDate: c.due_date ?? null,
        at: c.updated_at ?? null,
      }),
    );
  }

  let fundingQ = s
    .from("expected_fundings")
    .select(
      "id, offering_id, investor_user_id, investment_profile_id, status, expected_by, expected_amount_cents, received_amount_cents, updated_at",
    )
    .in("status", ["expected", "partially_received"])
    .limit(SOURCE_LIMIT);
  if (fundId) fundingQ = fundingQ.eq("offering_id", fundId);
  const fundings = await safely(async () => rows(await fundingQ));
  await fillPeople(s, lookup, (fundings as any[]).map((f) => f.investor_user_id));
  for (const f of fundings as any[]) {
    const partial = f.status === "partially_received";
    out.push(
      build(lookup, now, {
        id: `expected-funding:${f.id}`,
        source: "capital.expected",
        area: "capital",
        recordType: "fund",
        recordId: f.offering_id,
        recordTab: "capital",
        title: `${lookup.people.get(f.investor_user_id) ?? "Investor"} — expected funding`,
        reason: partial ? "Only part of the expected amount has arrived" : "Funds are still expected",
        workflowState: String(f.status),
        requiredAction: "review",
        fundId: f.offering_id,
        investorUserId: f.investor_user_id ?? null,
        investmentProfileId: f.investment_profile_id ?? null,
        dueDate: f.expected_by ?? null,
        blocked: partial,
        blockReason: partial ? "Partial funding received" : null,
        at: f.updated_at ?? null,
      }),
    );
  }

  return out;
}

async function reconciliationItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  const out: WorkItem[] = [];

  let q = s
    .from("bank_reconciliations")
    .select("id, offering_id, status, transaction_type, confidence, updated_at")
    .in("status", ["ingested", "auto_matched", "harmonious_reviewed", "information_requested"])
    .limit(SOURCE_LIMIT);
  if (fundId) q = q.eq("offering_id", fundId);
  for (const r of (await safely(async () => rows(await q))) as any[]) {
    const waiting = r.status === "harmonious_reviewed";
    const stalled = r.status === "information_requested";
    out.push(
      build(lookup, now, {
        id: `reconciliation:${r.id}`,
        source: "reconciliation.item",
        area: "accounting",
        recordType: "fund",
        recordId: r.offering_id,
        recordTab: "accounting",
        title: "Bank line to reconcile",
        reason: stalled
          ? "Information has been requested and not yet answered"
          : waiting
            ? "Reviewed by Harmonious and waiting for the other party"
            : r.status === "auto_matched"
              ? "A proposed match is waiting for review"
              : "Unmatched bank line",
        workflowState: String(r.status),
        requiredAction: waiting ? "approve" : "review",
        fundId: r.offering_id,
        blocked: stalled,
        blockReason: stalled ? "Waiting on requested information" : null,
        at: r.updated_at ?? null,
      }),
    );
  }

  let exQ = s
    .from("accounting_exceptions")
    .select("id, offering_id, kind, status, detail, is_material, opened_by, opened_at")
    .in("status", ["open", "investigating"])
    .limit(SOURCE_LIMIT);
  if (fundId) exQ = exQ.eq("offering_id", fundId);
  const exceptions = await safely(async () => rows(await exQ));
  await fillPeople(s, lookup, (exceptions as any[]).map((e) => e.opened_by));
  for (const e of exceptions as any[]) {
    out.push(
      build(lookup, now, {
        id: `accounting-exception:${e.id}`,
        source: "reconciliation.exception",
        area: "accounting",
        recordType: "fund",
        recordId: e.offering_id,
        recordTab: "accounting",
        title: "Accounting exception",
        reason: String(e.kind ?? "exception").replace(/_/g, " "),
        workflowState: String(e.status ?? "open"),
        requiredAction: "review",
        fundId: e.offering_id,
        assignedTo: e.opened_by ?? null,
        assignedToName: e.opened_by ? (lookup.people.get(e.opened_by) ?? null) : null,
        blocked: true,
        blockReason: String(e.kind ?? "exception").replace(/_/g, " "),
        at: e.opened_at ?? null,
      }),
    );
  }

  return out;
}

async function accountingItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  const out: WorkItem[] = [];
  const fundOf = (bookId: string | null) => (bookId ? (lookup.books.get(bookId) ?? null) : null);

  const entries = await safely(async () =>
    rows(
      await s
        .from("journal_entries")
        .select("id, book_id, entry_no, memo, status, entry_date, prepared_by, updated_at")
        .in("status", ["draft", "reviewed", "approved"])
        .limit(SOURCE_LIMIT),
    ),
  );
  for (const e of entries as any[]) {
    const fund = fundOf(e.book_id);
    if (!fund || (fundId && fund !== fundId)) continue;
    const action = e.status === "draft" ? "prepare" : e.status === "reviewed" ? "approve" : "approve";
    out.push(
      build(lookup, now, {
        id: `journal:${e.id}`,
        source: "accounting.journal",
        area: "accounting",
        recordType: "fund",
        recordId: fund,
        recordTab: "accounting",
        title: `Journal entry ${e.entry_no ?? ""}`.trim(),
        reason:
          e.status === "draft"
            ? "Journal entry is still in preparation"
            : e.status === "reviewed"
              ? "Reviewed and waiting for approval"
              : "Approved but not yet posted",
        workflowState: String(e.status),
        requiredAction: action,
        fundId: fund,
        at: e.updated_at ?? null,
      }),
    );
  }

  const periods = await safely(async () =>
    rows(
      await s
        .from("accounting_periods")
        .select("id, book_id, label, status, period_end, updated_at")
        .in("status", ["soft_closed", "review"])
        .limit(SOURCE_LIMIT),
    ),
  );
  for (const p of periods as any[]) {
    const fund = fundOf(p.book_id);
    if (!fund || (fundId && fund !== fundId)) continue;
    out.push(
      build(lookup, now, {
        id: `period:${p.id}`,
        source: "accounting.period",
        area: "accounting",
        recordType: "fund",
        recordId: fund,
        recordTab: "accounting",
        title: `Period close — ${p.label ?? p.period_end ?? ""}`.trim(),
        reason: p.status === "review" ? "Close review in progress" : "Soft closed and awaiting review",
        workflowState: String(p.status),
        requiredAction: "review",
        fundId: fund,
        dueDate: p.period_end ?? null,
        at: p.updated_at ?? null,
      }),
    );
  }

  const valuations = await safely(async () =>
    rows(
      await s
        .from("asset_valuations")
        .select("id, offering_id, asset_name, status, valuation_date, updated_at")
        .in("status", ["draft", "review", "returned"])
        .limit(SOURCE_LIMIT),
    ),
  );
  for (const v of valuations as any[]) {
    if (fundId && v.offering_id !== fundId) continue;
    const returned = v.status === "returned";
    out.push(
      build(lookup, now, {
        id: `valuation:${v.id}`,
        source: "accounting.valuation",
        area: "accounting",
        recordType: "fund",
        recordId: v.offering_id,
        recordTab: "accounting",
        title: `Valuation — ${v.asset_name ?? "holding"}`,
        reason: returned
          ? "Valuation was challenged and sent back"
          : v.status === "review"
            ? "Valuation is waiting for review"
            : "Valuation is still being prepared",
        workflowState: String(v.status),
        requiredAction: v.status === "draft" ? "prepare" : "review",
        fundId: v.offering_id,
        blocked: returned,
        blockReason: returned ? "Valuation challenged" : null,
        at: v.updated_at ?? null,
      }),
    );
  }

  const navs = await safely(async () =>
    rows(
      await s
        .from("nav_versions")
        .select("id, offering_id, status, period_label, as_of_date, manager_challenge_note, updated_at")
        .in("status", ["draft", "review", "approved"])
        .limit(SOURCE_LIMIT),
    ),
  );
  for (const n of navs as any[]) {
    if (fundId && n.offering_id !== fundId) continue;
    const challenged = Boolean(n.manager_challenge_note);
    out.push(
      build(lookup, now, {
        id: `nav:${n.id}`,
        source: "accounting.nav",
        area: "accounting",
        recordType: "fund",
        recordId: n.offering_id,
        recordTab: "accounting",
        title: `NAV — ${n.period_label ?? n.as_of_date ?? ""}`.trim(),
        reason: challenged
          ? "The fund manager has challenged this NAV"
          : n.status === "draft"
            ? "NAV is still being prepared"
            : n.status === "review"
              ? "NAV is waiting for review"
              : "Approved and waiting to be published",
        workflowState: String(n.status),
        requiredAction: n.status === "draft" ? "prepare" : n.status === "review" ? "review" : "approve",
        fundId: n.offering_id,
        blocked: challenged,
        blockReason: challenged ? "Manager challenge outstanding" : null,
        at: n.updated_at ?? null,
      }),
    );
  }

  const runs = await safely(async () =>
    rows(
      await s
        .from("allocation_runs")
        .select("id, offering_id, status, period_end, difference_cents, manager_response, updated_at")
        .in("status", ["draft", "review", "manager_review", "approved"])
        .limit(SOURCE_LIMIT),
    ),
  );
  for (const r of runs as any[]) {
    if (fundId && r.offering_id !== fundId) continue;
    const difference = Number(r.difference_cents ?? 0) !== 0;
    const challenged = r.manager_response === "challenged";
    out.push(
      build(lookup, now, {
        id: `allocation:${r.id}`,
        source: "accounting.allocation",
        area: "accounting",
        recordType: "fund",
        recordId: r.offering_id,
        recordTab: "accounting",
        title: `Allocation run — ${r.period_end ?? ""}`.trim(),
        reason: difference
          ? "The run does not tie back to fund net assets"
          : challenged
            ? "The fund manager has challenged this run"
            : r.status === "draft"
              ? "Allocation run is still being prepared"
              : r.status === "approved"
                ? "Approved and waiting to be finalised"
                : "Allocation run is waiting for review",
        workflowState: String(r.status),
        requiredAction: r.status === "draft" ? "prepare" : r.status === "approved" ? "approve" : "review",
        fundId: r.offering_id,
        blocked: difference || challenged,
        blockReason: difference
          ? "Unexplained allocation difference"
          : challenged
            ? "Manager challenge outstanding"
            : null,
        at: r.updated_at ?? null,
      }),
    );
  }

  return out;
}

async function reportingItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  const out: WorkItem[] = [];
  let q = s
    .from("financial_reports")
    .select("id, offering_id, report_type, status, period_end, manager_response, updated_at")
    .in("status", ["prepared", "review", "approved"])
    .limit(SOURCE_LIMIT);
  if (fundId) q = q.eq("offering_id", fundId);
  for (const r of (await safely(async () => rows(await q))) as any[]) {
    const challenged = r.manager_response === "challenged";
    out.push(
      build(lookup, now, {
        id: `report:${r.id}`,
        source: "reports.report",
        area: "reports",
        recordType: "fund",
        recordId: r.offering_id,
        recordTab: "accounting",
        title: `${String(r.report_type ?? "report").replace(/_/g, " ")} — ${r.period_end ?? ""}`.trim(),
        reason: challenged
          ? "The fund manager has challenged this report"
          : r.status === "approved"
            ? "Approved and waiting to be published"
            : "Report is waiting for review",
        workflowState: String(r.status),
        requiredAction: r.status === "approved" ? "approve" : "review",
        fundId: r.offering_id,
        dueDate: r.period_end ?? null,
        blocked: challenged,
        blockReason: challenged ? "Manager challenge outstanding" : null,
        at: r.updated_at ?? null,
      }),
    );
  }
  return out;
}

async function documentItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  let q = s
    .from("investor_documents")
    .select("id, user_id, offering_id, doc_kind, review_status, uploaded_at")
    .eq("review_status", "pending")
    .limit(SOURCE_LIMIT);
  if (fundId) q = q.eq("offering_id", fundId);
  const docs = await safely(async () => rows(await q));
  await fillPeople(s, lookup, (docs as any[]).map((d) => d.user_id));
  return (docs as any[]).map((d) =>
    build(lookup, now, {
      id: `investor-document:${d.id}`,
      source: "documents.review",
      area: "documents",
      recordType: "investor",
      recordId: d.user_id,
      recordTab: "documents",
      title: `${lookup.people.get(d.user_id) ?? "Investor"} — ${String(d.doc_kind ?? "document").replace(/_/g, " ")}`,
      reason: "Uploaded document is waiting for review",
      workflowState: String(d.review_status),
      requiredAction: "review",
      fundId: d.offering_id ?? null,
      investorUserId: d.user_id,
      at: d.uploaded_at ?? null,
    }),
  );
}

/** Contract ingestion alerts — derived per document, so never duplicated. */
async function contractItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  if (fundId) return [];
  const { contractAlerts } = await import("@/lib/contract-ingestion");
  const docs = await safely(async () =>
    rows(await s.from("client_governing_documents").select("*").neq("review_status", "superseded").limit(SOURCE_LIMIT)),
  );
  const today = now.toISOString().slice(0, 10);
  return (docs as any[]).flatMap((d) =>
    contractAlerts(d, today).map((a) =>
      build(lookup, now, {
        id: `contract:${d.id}:${a.kind}`,
        source: "clients.contracts",
        area: "clients",
        recordType: "client",
        recordId: d.client_id,
        recordTab: "contracts",
        title: `${a.title} — ${d.title}`,
        reason: a.title,
        workflowState: a.kind,
        requiredAction: a.kind === "awaiting_review" || a.kind === "amendment_review" ? "approve" : "prepare",
        clientId: d.client_id,
        at: d.updated_at ?? null,
      } as any),
    ),
  ).concat(await contractIntelligenceItems(s, lookup, now, docs as any[]));
}

/** Client 360 engagement tasks: missing SOW template, SOW blockers, custom pricing and reassignments. */
async function engagementItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  const { resolveSowTemplate, engagementTypeFor, findApplicableSow, NO_TEMPLATE_MESSAGE } = await import("@/lib/client-admin-model");
  const [funds, sows, templates, sels, reassign] = await Promise.all([
    safely(async () => rows(await s.from("offerings").select("id, name, fund_type, client_id, created_at").not("client_id", "is", null).limit(SOURCE_LIMIT))),
    safely(async () => rows(await s.from("client_sows").select("id, client_id, offering_id, status, executed_at, locked, amends_sow_id, review_blockers, title, updated_at").limit(SOURCE_LIMIT))),
    safely(async () => rows(await s.from("sow_templates").select("*"))),
    safely(async () => rows(await s.from("client_service_selections").select("id, client_id, offering_id, service_key, status, override_status, updated_at").not("status", "in", "(removed,terminated)").limit(SOURCE_LIMIT))),
    safely(async () => rows(await s.from("fund_client_reassignments").select("*").eq("status", "pending"))),
  ]);
  const today = now.toISOString().slice(0, 10);
  const out: any[] = [];
  const base = (o: any) => build(lookup, now, { source: "clients.engagements", area: "clients", recordType: "client", ...o } as any);
  for (const f of funds as any[]) {
    if (fundId && f.id !== fundId) continue;
    const app = findApplicableSow(sows as any[], f.client_id, f.id);
    if (app.executed || app.draft) continue;
    if (!(sels as any[]).some((x) => x.offering_id === f.id) && !(sows as any[]).length) continue;
    if (resolveSowTemplate(templates as any[], engagementTypeFor(f), today).status === "resolved") continue;
    out.push(base({ id: `engagement:${f.id}:no_template`, recordId: f.client_id, recordTab: "funds", title: `${NO_TEMPLATE_MESSAGE} — ${f.name}`, reason: NO_TEMPLATE_MESSAGE, workflowState: "no_template", requiredAction: "prepare", clientId: f.client_id, fundId: f.id, at: f.created_at }));
  }
  for (const w of sows as any[]) {
    if (w.executed_at || (fundId && w.offering_id !== fundId)) continue;
    const b = Array.isArray(w.review_blockers) ? w.review_blockers : [];
    if (!b.length) continue;
    out.push(base({ id: `engagement:sow:${w.id}:blocked`, recordId: w.client_id, recordTab: "services", title: `SOW needs attention — ${w.title}`, reason: b.map((x: any) => x.message).join(" "), workflowState: "sow_blocked", requiredAction: "prepare", clientId: w.client_id, at: w.updated_at }));
  }
  for (const x of sels as any[]) {
    if (x.override_status !== "pending_approval" || (fundId && x.offering_id !== fundId)) continue;
    out.push(base({ id: `engagement:price:${x.id}`, recordId: x.client_id, recordTab: "services", title: `Custom pricing awaiting approval — ${x.service_key}`, reason: "Custom pricing must be approved by a second person.", workflowState: "pricing_override", requiredAction: "approve", clientId: x.client_id, at: x.updated_at }));
  }
  for (const r of reassign as any[]) {
    if (fundId && r.offering_id !== fundId) continue;
    out.push(base({ id: `engagement:reassign:${r.id}`, recordId: r.to_client_id, recordTab: "funds", title: "Fund reassignment awaiting review", reason: r.reason, workflowState: "reassignment", requiredAction: "approve", clientId: r.to_client_id, fundId: r.offering_id, at: r.requested_at }));
  }
  return out;
}

/** Scope conflicts and renewal reminders — derived, one row per conflict / document. */
async function contractIntelligenceItems(s: any, lookup: Lookup, now: Date, docs: any[]) {
  if (!docs.length) return [];
  const { detectConflicts, computeLifecycle, renewalReminder, CONFLICT_TASK_TITLE } = await import("@/lib/contract-intelligence");
  const today = now.toISOString().slice(0, 10);
  const ids = docs.map((d) => d.id);
  const [terms, rels] = await Promise.all([
    safely(async () => rows(await s.from("contract_terms").select("document_id, term_key, current_value, amount_cents, service_key, status, source_page, source_section, source_quote").in("document_id", ids))),
    safely(async () => rows(await s.from("contract_document_relationships").select("*").eq("status", "active").eq("approval_status", "approved"))),
  ]);
  const withTerms = docs.map((d) => ({ ...d, applies_to_service_keys: d.applies_to_service_keys ?? [], terms: (terms as any[]).filter((t) => t.document_id === d.id) }));
  const byClient = new Map<string, any[]>();
  withTerms.forEach((d) => byClient.set(d.client_id, [...(byClient.get(d.client_id) ?? []), d]));
  const out: any[] = [];
  for (const [clientId, list] of byClient) {
    for (const c of detectConflicts(list, (rels as any[]).filter((r) => r.client_id === clientId), today)) {
      out.push(build(lookup, now, {
        id: `contract-conflict:${c.key}`,
        source: "clients.contracts",
        area: "clients",
        recordType: "client",
        recordId: clientId,
        recordTab: "contracts",
        title: `${CONFLICT_TASK_TITLE} — ${c.title}`,
        reason: c.title,
        workflowState: c.kind,
        requiredAction: "approve",
        clientId,
        at: null,
      } as any));
    }
  }
  for (const d of withTerms) {
    if (d.review_status !== "approved") continue;
    const r = renewalReminder(computeLifecycle(d, d.terms, today), today);
    if (r)
      out.push(build(lookup, now, {
        id: `contract:${d.id}:renewal`,
        source: "clients.contracts",
        area: "clients",
        recordType: "client",
        recordId: d.client_id,
        recordTab: "contracts",
        title: `Renewal in ${r.daysLeft} days (${r.bucket}-day reminder) — ${d.title}`,
        reason: "Renewal reminder — nothing renews or is sent automatically",
        workflowState: "renewal",
        requiredAction: "prepare",
        clientId: d.client_id,
        at: null,
      } as any));
  }
  return out;
}

/** Google Drive problems. One open row per problem (deduplicated at the source). */
async function driveExceptionItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  let q = s
    .from("drive_exceptions")
    .select("id, offering_id, issue_type, updated_at")
    .eq("status", "open")
    .limit(SOURCE_LIMIT);
  if (fundId) q = q.eq("offering_id", fundId);
  const rowsOut = await safely(async () => rows(await q));
  return (rowsOut as any[])
    .filter((r) => r.offering_id)
    .map((r) =>
      build(lookup, now, {
        id: `drive-exception:${r.id}`,
        source: "documents.drive",
        area: "documents",
        recordType: "fund",
        recordId: r.offering_id,
        recordTab: "documents",
        title: `Google Drive — ${String(r.issue_type).replace(/_/g, " ")}`,
        reason: "Google Drive filing needs attention",
        workflowState: String(r.issue_type),
        requiredAction: "prepare",
        fundId: r.offering_id,
        at: r.updated_at ?? null,
      }),
    );
}

/**
 * Distributions and outbound payments (Phase D).
 *
 * Every line below is read from the distribution record that owns it. There is
 * no queue status: a batch waiting for review is simply a batch whose own
 * status says so, and it leaves the queue the moment that status moves. Money
 * detail never travels with an item — only the fund, the stage and the reason.
 */
async function distributionItems(s: any, lookup: Lookup, now: Date, fundId?: string) {
  const out: WorkItem[] = [];

  let batchQuery = s
    .from("distribution_batches")
    .select(
      "id, offering_id, batch_number, title, status, payment_status, balances, payment_date, recipient_count, prepared_by, updated_at",
    )
    .not("status", "in", "(completed,superseded,cancelled)")
    .limit(SOURCE_LIMIT);
  if (fundId) batchQuery = batchQuery.eq("offering_id", fundId);
  const batches = await safely(async () => rows(await batchQuery));

  const STAGE: Record<string, { action: "prepare" | "review" | "approve" | "execute"; reason: string }> = {
    draft: { action: "prepare", reason: "Distribution is still being prepared" },
    proposed: { action: "prepare", reason: "Proposed distribution has not been sent for review" },
    harmonious_review: { action: "review", reason: "Waiting for Harmonious review" },
    manager_approval: { action: "review", reason: "Waiting for the fund manager's approval" },
    investor_confirmation: { action: "review", reason: "Waiting for investor confirmation" },
    final_approval: { action: "approve", reason: "Waiting for final Harmonious approval" },
    approved: { action: "execute", reason: "Approved and waiting to be sent" },
    executing: { action: "review", reason: "Payments are in flight" },
  };

  for (const b of batches as any[]) {
    const stage = STAGE[String(b.status)];
    if (!stage) continue;
    const unbalanced = b.balances === false;
    out.push(
      build(lookup, now, {
        id: `distribution-batch:${b.id}`,
        source: "capital.distribution",
        area: "capital",
        recordType: "fund",
        recordId: b.offering_id,
        recordTab: "capital",
        title: `${b.title ?? `Distribution #${b.batch_number}`} — ${b.recipient_count ?? 0} investors`,
        reason: unbalanced ? "Gross less withholding and fees does not equal the net payments" : stage.reason,
        workflowState: String(b.status),
        requiredAction: unbalanced ? "review" : stage.action,
        fundId: b.offering_id,
        assignedTo: null,
        // payment_date is a real column on the batch; nothing is invented.
        dueDate: b.payment_date ?? null,
        ...(unbalanced ? { blocked: true, blockReason: "The batch does not reconcile" } : {}),
        at: b.updated_at ?? null,
      }),
    );
  }

  const exceptions = await safely(async () =>
    rows(
      await s
        .from("distribution_exceptions")
        .select("id, offering_id, batch_id, distribution_line_id, investor_user_id, kind, status, detail, created_at")
        .neq("status", "resolved")
        .limit(SOURCE_LIMIT),
    ),
  );
  for (const e of exceptions as any[]) {
    if (fundId && e.offering_id !== fundId) continue;
    out.push(
      build(lookup, now, {
        id: `distribution-exception:${e.id}`,
        source: "capital.distribution.exception",
        area: "capital",
        recordType: "fund",
        recordId: e.offering_id,
        recordTab: "banking",
        title: `Distribution exception — ${String(e.kind ?? "exception").replace(/_/g, " ")}`,
        reason: String(e.kind ?? "exception").replace(/_/g, " "),
        workflowState: String(e.status ?? "open"),
        requiredAction: "review",
        fundId: e.offering_id,
        investorUserId: e.investor_user_id ?? null,
        blocked: true,
        blockReason: String(e.kind ?? "exception").replace(/_/g, " "),
        at: e.created_at ?? null,
      }),
    );
  }

  const changes = await safely(async () =>
    rows(
      await s
        .from("payment_instruction_changes")
        .select(
          "id, offering_id, investor_user_id, status, change_kind, cooling_off_until, requested_at, updated_at",
        )
        .not("status", "in", "(approved,rejected,cancelled)")
        .limit(SOURCE_LIMIT),
    ),
  );
  await fillPeople(s, lookup, (changes as any[]).map((c) => c.investor_user_id));
  for (const c of changes as any[]) {
    if (fundId && c.offering_id && c.offering_id !== fundId) continue;
    const cooling = c.cooling_off_until ? new Date(c.cooling_off_until).getTime() > now.getTime() : false;
    out.push(
      build(lookup, now, {
        id: `payment-instruction-change:${c.id}`,
        source: "capital.payment_instruction",
        area: "capital",
        recordType: "investor",
        recordId: c.investor_user_id,
        recordTab: "capital",
        title: `${lookup.people.get(c.investor_user_id) ?? "Investor"} — payment destination change`,
        reason: cooling
          ? "In the cooling-off period before the new destination can be used"
          : "A change of payment destination is waiting for verification and approval",
        workflowState: String(c.status),
        requiredAction: "review",
        fundId: c.offering_id ?? null,
        investorUserId: c.investor_user_id,
        blocked: true,
        blockReason: cooling ? "Cooling-off period" : "Destination not yet verified",
        at: c.updated_at ?? c.requested_at ?? null,
      }),
    );
  }

  const payments = await safely(async () =>
    rows(
      await s
        .from("distribution_payments")
        .select("id, offering_id, distribution_line_id, status, failure_reason, updated_at")
        .in("status", ["failed", "returned", "reversed"])
        .limit(SOURCE_LIMIT),
    ),
  );
  for (const p of payments as any[]) {
    if (fundId && p.offering_id !== fundId) continue;
    out.push(
      build(lookup, now, {
        id: `distribution-payment:${p.id}`,
        source: "capital.distribution.payment",
        area: "capital",
        recordType: "fund",
        recordId: p.offering_id,
        recordTab: "banking",
        title: `Payment ${String(p.status)}`,
        reason: String(p.failure_reason ?? "The bank did not complete this payment"),
        workflowState: String(p.status),
        requiredAction: "review",
        fundId: p.offering_id,
        blocked: true,
        blockReason: String(p.status) === "returned" ? "Payment returned" : "Payment failed",
        at: p.updated_at ?? null,
      }),
    );
  }

  const settled = await safely(async () =>
    rows(
      await s
        .from("distribution_lines")
        .select(
          "id, offering_id, investor_user_id, display_name, payment_state, reconciliation_state, accounting_state, updated_at",
        )
        .eq("payment_state", "confirmed")
        .limit(SOURCE_LIMIT),
    ),
  );
  for (const l of settled as any[]) {
    if (fundId && l.offering_id !== fundId) continue;
    const reconciled = l.reconciliation_state === "reconciled";
    const posted = l.accounting_state === "posted";
    if (reconciled && posted) continue;
    out.push(
      build(lookup, now, {
        id: `distribution-settlement:${l.id}`,
        source: reconciled ? "capital.distribution.accounting" : "capital.distribution.reconciliation",
        area: reconciled ? "accounting" : "capital",
        recordType: "fund",
        recordId: l.offering_id,
        recordTab: reconciled ? "accounting" : "banking",
        title: `${l.display_name ?? "Investor"} — paid, ${reconciled ? "awaiting accounting" : "awaiting reconciliation"}`,
        reason: reconciled
          ? "The bank payment is reconciled and the journal has not been posted"
          : "The bank has confirmed the payment and it is not reconciled yet",
        workflowState: reconciled ? String(l.accounting_state) : String(l.reconciliation_state),
        requiredAction: "review",
        fundId: l.offering_id,
        investorUserId: l.investor_user_id ?? null,
        at: l.updated_at ?? null,
      }),
    );
  }

  return out;
}

async function fundRequestItems(s: any, lookup: Lookup, now: Date) {
  const requests = await safely(async () =>
    rows(
      await s
        .from("fund_requests")
        .select("id, client_id, fund_name, status, created_at, updated_at")
        .eq("status", "submitted")
        .limit(SOURCE_LIMIT),
    ),
  );
  return (requests as any[]).map((r) =>
    build(lookup, now, {
      id: `fund-request:${r.id}`,
      source: "funds.request",
      area: "funds",
      recordType: "client",
      recordId: r.client_id,
      recordTab: "overview",
      title: `New fund request — ${r.fund_name}`,
      reason: "New fund request requires review",
      workflowState: String(r.status),
      requiredAction: "review",
      clientId: r.client_id,
      dueDate: null,
      at: r.updated_at ?? r.created_at ?? null,
    }),
  );
}

/* -------------------------------------------------------------- the queue */


const COLLECTORS: {
  area: OpsArea;
  load: (s: any, lookup: Lookup, now: Date, fundId?: string) => Promise<WorkItem[]>;
}[] = [
  { area: "onboarding", load: onboardingItems },
  { area: "funds", load: (s, l, n) => fundRequestItems(s, l, n) },
  { area: "onboarding", load: (s, l, n) => identityItems(s, l, n) },
  { area: "capital", load: capitalItems },
  { area: "accounting", load: reconciliationItems },
  { area: "accounting", load: accountingItems },
  { area: "reports", load: reportingItems },
  { area: "documents", load: documentItems },
  { area: "documents", load: driveExceptionItems },
  { area: "clients", load: contractItems },
  { area: "clients", load: engagementItems },
  { area: "capital", load: distributionItems },


];

export type WorkQueueInput = {
  filters?: WorkFilters;
  page?: number;
  pageSize?: number;
};

/** Everything Operations Home needs, already narrowed to what this person may act on. */
export async function workQueue(context: Ctx, input: WorkQueueInput = {}) {
  const { capabilities, roles } = await requireOperations(context);
  const s = context.supabase;
  const now = new Date();
  const filters = input.filters ?? {};
  const lookup = await lookups(s);

  const collected = await Promise.all(
    COLLECTORS.map(async ({ area, load }) =>
      // never read an area this person may not see
      can(capabilities, area, "see") ? load(s, lookup, now, filters.fundId) : [],
    ),
  );

  const authorized = filterByCapability(collected.flat(), capabilities).filter(summaryIsSafe);
  const filtered = sortItems(applyFilters(authorized, filters, context.userId, now));
  const page = paginate(filtered, input.page ?? 1, input.pageSize ?? 25);

  const sections = groupBySection(authorized, now);
  const sectionCounts = Object.fromEntries(
    Object.entries(sections).map(([key, items]) => [key, items.length]),
  ) as Record<WorkSection, number>;

  return {
    roles,
    capabilities,
    items: page.rows.map((item) => ({ ...item, destination: destinationFor(item), section: sectionOf(item, now) })),
    total: page.total,
    page: page.page,
    pages: page.pages,
    sectionCounts,
    byArea: countBy(authorized, (i) => i.area),
    byPriority: countBy(authorized, (i) => i.priority),
    mine: authorized.filter((i) => i.assignedTo === context.userId).length,
    funds: [...lookup.funds.entries()]
      .filter(([id]) => authorized.some((i) => i.fundId === id))
      .map(([id, f]) => ({ id, name: f.name })),
    clients: [...lookup.clients.entries()]
      .filter(([id]) => authorized.some((i) => i.clientId === id))
      .map(([id, name]) => ({ id, name })),
    unconfigured: UNCONFIGURED_AREAS,
  };
}

/** The sanitized trail already kept by the platform, newest first. */
export async function recentOperationsActivity(context: Ctx, limit = 20) {
  await requireOperations(context);
  const s = context.supabase;
  const events = await safely(async () =>
    rows(
      await s
        .from("ai_action_log")
        .select("id, client_id, created_at, actor_role, feature, action, summary, actor_id")
        .order("created_at", { ascending: false })
        .limit(limit),
    ),
  );
  const lookup = await lookups(s);
  await fillPeople(s, lookup, (events as any[]).map((e) => e.actor_id));
  return {
    activity: (events as any[]).map((e) =>
      redactActivity({
        at: e.created_at,
        actor: e.actor_id ? (lookup.people.get(e.actor_id) ?? "Harmonious team") : "Harmonious team",
        capacity: String(e.actor_role ?? "operations"),
        action: String(e.action ?? "").replace(/_/g, " "),
        resource: e.client_id ? (lookup.clients.get(e.client_id) ?? "Client") : (e.feature ?? "Platform"),
        detail: e.summary ? { summary: e.summary } : null,
      }),
    ),
  };
}

export type { OpsCapability };
