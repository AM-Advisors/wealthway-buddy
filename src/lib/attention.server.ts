/**
 * Server side of the Action Center (server-only module).
 *
 * Every item is read straight from the workflow record that owns it. Nothing is
 * written, no status is duplicated, and no due date appears unless the source
 * record actually holds one.
 *
 * Scope is resolved here, from the reader's own relationship records — the
 * browser never says which investor, fund, client or delegation it wants. A
 * collector that finds no relationship returns nothing at all.
 */

import {
  ATTENTION_GAPS,
  buildAttentionItem,
  groupAttention,
  safeItems,
  plainStatus,
  type AttentionGap,
  type AttentionItem,
  type AttentionResult,
} from "@/lib/attention-model";
import { canAct } from "@/lib/delegated-access.server";
import type { WorkspaceKind } from "@/lib/session-resolution";

const LIMIT = 100;

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

type Names = { funds: Map<string, string>; clients: Map<string, string> };

async function names(s: any): Promise<Names> {
  const [offerings, clients] = await Promise.all([
    safely(async () => rows(await s.from("offerings").select("id, name"))),
    safely(async () => rows(await s.from("clients").select("id, name"))),
  ]);
  return {
    funds: new Map((offerings as any[]).map((f) => [f.id, f.name as string])),
    clients: new Map((clients as any[]).map((c) => [c.id, c.name as string])),
  };
}

const done = (value: unknown) => value === "approved" || value === "settled" || value === "verified";

/* ------------------------------------------------------------------ investor */

async function investorItems(ctx: Ctx, n: Names): Promise<AttentionItem[]> {
  const s = ctx.supabase;
  const out: AttentionItem[] = [];

  const applications = await safely(async () =>
    rows(
      await s
        .from("investor_applications")
        .select(
          "id, offering_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, updated_at",
        )
        .eq("user_id", ctx.userId)
        .limit(LIMIT),
    ),
  );

  for (const a of applications as any[]) {
    const fundName = n.funds.get(a.offering_id) ?? null;
    const base = {
      workspace: "investor" as WorkspaceKind,
      sourceTable: "investor_applications",
      sourceId: a.id,
      href: "/dashboard",
      at: a.updated_at ?? null,
      fundName,
    };

    if (!done(a.kyc_status)) {
      out.push(
        buildAttentionItem({
          ...base,
          id: `investor-kyc:${a.id}`,
          source: "investor.identity",
          group: a.kyc_status === "pending" ? "harmonious_working" : "needs_you",
          severity: a.kyc_status === "pending" ? "info" : "action",
          title: "Identity verification",
          workflowState: String(a.kyc_status ?? "kyc_required"),
          status:
            a.kyc_status === "pending"
              ? plainStatus("kyc_pending")
              : plainStatus("kyc_required"),
          href: "/onboarding/kyc",
        }),
      );
    }

    if (!done(a.aml_status) && done(a.kyc_status)) {
      out.push(
        buildAttentionItem({
          ...base,
          id: `investor-aml:${a.id}`,
          source: "investor.screening",
          group: "harmonious_working",
          severity: "info",
          title: "Screening",
          workflowState: String(a.aml_status ?? "aml_pending"),
          status: plainStatus("aml_pending"),
        }),
      );
    }

    if (!done(a.accreditation_status)) {
      const pending = a.accreditation_status === "pending";
      out.push(
        buildAttentionItem({
          ...base,
          id: `investor-accreditation:${a.id}`,
          source: "investor.accreditation",
          group: pending ? "harmonious_working" : "needs_you",
          severity: pending ? "info" : "action",
          title: "Accreditation",
          workflowState: String(a.accreditation_status ?? "accreditation_required"),
          status: plainStatus(pending ? "accreditation_pending" : "accreditation_required"),
          href: "/onboarding/accreditation",
        }),
      );
    }

    if (a.funding_status && !done(a.funding_status)) {
      const working = a.funding_status === "processing";
      out.push(
        buildAttentionItem({
          ...base,
          id: `investor-funding:${a.id}`,
          source: "investor.funding",
          group: working ? "harmonious_working" : "needs_you",
          severity: working ? "info" : "action",
          title: fundName ? `Funding — ${fundName}` : "Funding",
          workflowState: String(a.funding_status),
          href: "/onboarding/funding",
        }),
      );
    }
  }

  const applicationIds = (applications as any[]).map((a) => a.id);

  if (applicationIds.length) {
    const verifications = await safely(async () =>
      rows(
        await s
          .from("kyc_verifications")
          .select(
            "id, application_id, status, harmonious_decision, document_expired, document_expiration_date, updated_at",
          )
          .in("application_id", applicationIds)
          .limit(LIMIT),
      ),
    );
    for (const v of verifications as any[]) {
      if (!v.document_expired && v.harmonious_decision !== "review_required") continue;
      out.push(
        buildAttentionItem({
          id: `investor-id-document:${v.id}`,
          source: "investor.identity.document",
          workspace: "investor",
          group: v.document_expired ? "needs_you" : "harmonious_working",
          severity: v.document_expired ? "critical" : "info",
          title: "Government ID",
          workflowState: v.document_expired ? "kyc_expired" : "review_required",
          sourceTable: "kyc_verifications",
          sourceId: v.id,
          href: "/onboarding/kyc",
          at: v.updated_at ?? null,
          ...(v.document_expiration_date
            ? {
                dueDate: String(v.document_expiration_date),
                dueDateSource: "kyc_verifications.document_expiration_date",
              }
            : {}),
        }),
      );
    }

    const accreditations = await safely(async () =>
      rows(
        await s
          .from("accreditation_records")
          .select("id, application_id, status, expires_at, updated_at")
          .in("application_id", applicationIds)
          .limit(LIMIT),
      ),
    );
    for (const r of accreditations as any[]) {
      if (r.status !== "verified" || !r.expires_at) continue;
      out.push(
        buildAttentionItem({
          id: `investor-accreditation-expiry:${r.id}`,
          source: "investor.accreditation.expiry",
          workspace: "investor",
          group: "waiting_third_party",
          severity: "info",
          title: "Accreditation expiry",
          workflowState: "verified",
          status: "Your accreditation is on file and has an expiry date",
          sourceTable: "accreditation_records",
          sourceId: r.id,
          href: "/onboarding/accreditation",
          at: r.updated_at ?? null,
          dueDate: String(r.expires_at),
          dueDateSource: "accreditation_records.expires_at",
        }),
      );
    }
  }

  const signers = await safely(async () =>
    rows(
      await s
        .from("document_signature_signers")
        .select("id, offering_id, status, required, signed_at, last_event_at, updated_at")
        .eq("signer_user_id", ctx.userId)
        .limit(LIMIT),
    ),
  );
  for (const sg of signers as any[]) {
    const state = String(sg.status ?? "pending");
    const outstanding = state === "pending" || state === "sent";
    if (!outstanding && state !== "signed") continue;
    out.push(
      buildAttentionItem({
        id: `investor-signature:${sg.id}`,
        source: "investor.signature",
        workspace: "investor",
        group: outstanding ? "needs_you" : "recently_completed",
        severity: outstanding ? "action" : "info",
        title: "Agreement signature",
        workflowState: state,
        status: outstanding ? plainStatus("out_for_signature") : plainStatus("signed"),
        sourceTable: "document_signature_signers",
        sourceId: sg.id,
        href: "/documents",
        at: sg.last_event_at ?? sg.signed_at ?? sg.updated_at ?? null,
        fundName: sg.offering_id ? (n.funds.get(sg.offering_id) ?? null) : null,
      }),
    );
  }

  const callLines = await safely(async () =>
    rows(
      await s
        .from("capital_call_lines")
        .select("id, offering_id, status, due_date, updated_at")
        .eq("investor_user_id", ctx.userId)
        .limit(LIMIT),
    ),
  );
  for (const line of callLines as any[]) {
    const state = String(line.status ?? "");
    if (state === "received" || state === "cancelled") continue;
    out.push(
      buildAttentionItem({
        id: `investor-call:${line.id}`,
        source: "investor.capital_call",
        workspace: "investor",
        group: "needs_you",
        severity: "action",
        title: "Capital call",
        workflowState: state || "published",
        status: plainStatus(state || "published"),
        sourceTable: "capital_call_lines",
        sourceId: line.id,
        href: "/capital",
        at: line.updated_at ?? null,
        fundName: line.offering_id ? (n.funds.get(line.offering_id) ?? null) : null,
        ...(line.due_date
          ? { dueDate: String(line.due_date), dueDateSource: "capital_call_lines.due_date" }
          : {}),
      }),
    );
  }

  const expected = await safely(async () =>
    rows(
      await s
        .from("expected_fundings")
        .select("id, offering_id, status, expected_by, updated_at")
        .eq("investor_user_id", ctx.userId)
        .limit(LIMIT),
    ),
  );
  for (const e of expected as any[]) {
    const state = String(e.status ?? "");
    if (state === "settled" || state === "cancelled") continue;
    const working = state === "processing" || state === "matched";
    out.push(
      buildAttentionItem({
        id: `investor-expected:${e.id}`,
        source: "investor.transfer",
        workspace: "investor",
        group: working ? "harmonious_working" : "needs_you",
        severity: working ? "info" : "action",
        title: "Transfer",
        workflowState: state || "awaiting_wire",
        status: plainStatus(working ? "processing" : "awaiting_wire"),
        sourceTable: "expected_fundings",
        sourceId: e.id,
        href: "/capital",
        at: e.updated_at ?? null,
        fundName: e.offering_id ? (n.funds.get(e.offering_id) ?? null) : null,
        ...(e.expected_by
          ? { dueDate: String(e.expected_by), dueDateSource: "expected_fundings.expected_by" }
          : {}),
      }),
    );
  }

  const statements = await safely(async () =>
    rows(
      await s
        .from("investor_statements")
        .select("id, offering_id, status, period_end, published_at, updated_at")
        .eq("investor_user_id", ctx.userId)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(5),
    ),
  );
  for (const st of statements as any[]) {
    out.push(
      buildAttentionItem({
        id: `investor-statement:${st.id}`,
        source: "investor.statement",
        workspace: "investor",
        group: "recently_completed",
        severity: "info",
        title: st.period_end ? `Statement to ${st.period_end}` : "Investor statement",
        workflowState: "published",
        status: "Your statement is available",
        sourceTable: "investor_statements",
        sourceId: st.id,
        href: "/investor-reporting",
        at: st.published_at ?? st.updated_at ?? null,
        fundName: st.offering_id ? (n.funds.get(st.offering_id) ?? null) : null,
      }),
    );
  }

  const taxDocs = await safely(async () =>
    rows(
      await s
        .from("fund_tax_documents")
        .select("id, offering_id, doc_type, tax_year, review_status, updated_at")
        .eq("investor_user_id", ctx.userId)
        .order("updated_at", { ascending: false })
        .limit(5),
    ),
  );
  for (const d of taxDocs as any[]) {
    out.push(
      buildAttentionItem({
        id: `investor-tax-doc:${d.id}`,
        source: "investor.tax_document",
        workspace: "investor",
        group: "recently_completed",
        severity: "info",
        title: `${d.doc_type ?? "Tax document"}${d.tax_year ? ` ${d.tax_year}` : ""}`,
        workflowState: String(d.review_status ?? "available"),
        status: "Your tax document is available",
        sourceTable: "fund_tax_documents",
        sourceId: d.id,
        href: "/documents",
        at: d.updated_at ?? null,
        fundName: d.offering_id ? (n.funds.get(d.offering_id) ?? null) : null,
      }),
    );
  }

  return out;
}

/* -------------------------------------------------------------- fund manager */

async function fundManagerItems(ctx: Ctx, n: Names): Promise<AttentionItem[]> {
  const s = ctx.supabase;
  const out: AttentionItem[] = [];

  const managed = await safely(async () =>
    rows(await s.from("fund_managers").select("offering_id").eq("user_id", ctx.userId)),
  );
  const fundIds = [...new Set((managed as any[]).map((m) => String(m.offering_id)))];
  if (!fundIds.length) return out;

  const fundName = (id: string | null) => (id ? (n.funds.get(id) ?? null) : null);

  const onboardings = await safely(async () =>
    rows(
      await s
        .from("investor_onboardings")
        .select("id, offering_id, stage, funding_status, last_activity_at, updated_at")
        .in("offering_id", fundIds)
        .is("closed_at", null)
        .limit(LIMIT),
    ),
  );
  for (const o of onboardings as any[]) {
    const stage = String(o.stage ?? "");
    const withHarmonious = stage === "harmonious_review";
    out.push(
      buildAttentionItem({
        id: `manager-onboarding:${o.id}`,
        source: "manager.onboarding",
        workspace: "fund_manager",
        group: withHarmonious ? "harmonious_working" : "waiting_third_party",
        severity: "info",
        title: "Investor onboarding in progress",
        workflowState: stage,
        status: withHarmonious
          ? "Harmonious is reviewing this investor"
          : `Waiting on the investor at the ${stage.replace(/_/g, " ")} step`,
        sourceTable: "investor_onboardings",
        sourceId: o.id,
        href: "/manager/investor-onboarding",
        at: o.last_activity_at ?? o.updated_at ?? null,
        fundName: fundName(o.offering_id),
      }),
    );
  }

  const calls = await safely(async () =>
    rows(
      await s
        .from("capital_calls")
        .select("id, offering_id, status, due_date, title, updated_at")
        .in("offering_id", fundIds)
        .not("status", "in", "(closed,cancelled,superseded)")
        .limit(LIMIT),
    ),
  );
  for (const c of calls as any[]) {
    const state = String(c.status ?? "");
    out.push(
      buildAttentionItem({
        id: `manager-call:${c.id}`,
        source: "manager.capital_call",
        workspace: "fund_manager",
        group: state === "published" ? "waiting_third_party" : "harmonious_working",
        severity: "info",
        title: c.title ? `Capital call — ${c.title}` : "Capital call",
        workflowState: state,
        status:
          state === "published"
            ? "Issued — waiting for investor transfers"
            : plainStatus(state),
        sourceTable: "capital_calls",
        sourceId: c.id,
        href: "/manager/capital",
        at: c.updated_at ?? null,
        fundName: fundName(c.offering_id),
        ...(c.due_date ? { dueDate: String(c.due_date), dueDateSource: "capital_calls.due_date" } : {}),
      }),
    );
  }

  const reconciliations = await safely(async () =>
    rows(
      await s
        .from("bank_reconciliations")
        .select("id, offering_id, status, updated_at")
        .in("offering_id", fundIds)
        .not("status", "in", "(reconciled,posted)")
        .limit(LIMIT),
    ),
  );
  for (const r of reconciliations as any[]) {
    out.push(
      buildAttentionItem({
        id: `manager-reconciliation:${r.id}`,
        source: "manager.reconciliation",
        workspace: "fund_manager",
        group: "harmonious_working",
        severity: "info",
        title: "Bank transfer being confirmed",
        workflowState: String(r.status ?? ""),
        sourceTable: "bank_reconciliations",
        sourceId: r.id,
        href: "/manager/capital",
        at: r.updated_at ?? null,
        fundName: fundName(r.offering_id),
      }),
    );
  }

  const navs = await safely(async () =>
    rows(
      await s
        .from("nav_versions")
        .select("id, offering_id, status, as_of_date, updated_at")
        .in("offering_id", fundIds)
        .order("updated_at", { ascending: false })
        .limit(20),
    ),
  );
  for (const v of navs as any[]) {
    const state = String(v.status ?? "");
    const finished = state === "approved" || state === "published";
    out.push(
      buildAttentionItem({
        id: `manager-nav:${v.id}`,
        source: "manager.nav",
        workspace: "fund_manager",
        group: finished ? "recently_completed" : "harmonious_working",
        severity: "info",
        title: v.as_of_date ? `NAV as at ${v.as_of_date}` : "NAV",
        workflowState: state,
        status: finished ? "Approved" : "Harmonious is preparing this valuation",
        sourceTable: "nav_versions",
        sourceId: v.id,
        href: "/manager/reporting",
        at: v.updated_at ?? null,
        fundName: fundName(v.offering_id),
      }),
    );
  }

  const reports = await safely(async () =>
    rows(
      await s
        .from("financial_reports")
        .select("id, offering_id, status, period_end, updated_at")
        .in("offering_id", fundIds)
        .order("updated_at", { ascending: false })
        .limit(20),
    ),
  );
  for (const r of reports as any[]) {
    const state = String(r.status ?? "");
    const published = state === "published";
    out.push(
      buildAttentionItem({
        id: `manager-report:${r.id}`,
        source: "manager.reporting",
        workspace: "fund_manager",
        group: published ? "recently_completed" : "harmonious_working",
        severity: "info",
        title: r.period_end ? `Reporting to ${r.period_end}` : "Financial reporting",
        workflowState: state,
        status: published ? "Published" : "Harmonious is preparing your reporting",
        sourceTable: "financial_reports",
        sourceId: r.id,
        href: "/manager/reporting",
        at: r.updated_at ?? null,
        fundName: fundName(r.offering_id),
        ...(r.period_end
          ? { dueDate: String(r.period_end), dueDateSource: "financial_reports.period_end" }
          : {}),
      }),
    );
  }

  const distributions = await safely(async () =>
    rows(
      await s
        .from("distribution_batches")
        .select("id, offering_id, status, payment_date, title, updated_at")
        .in("offering_id", fundIds)
        .order("updated_at", { ascending: false })
        .limit(20),
    ),
  );
  for (const d of distributions as any[]) {
    const state = String(d.status ?? "");
    const finished = state === "completed";
    out.push(
      buildAttentionItem({
        id: `manager-distribution:${d.id}`,
        source: "manager.distribution",
        workspace: "fund_manager",
        group: finished ? "recently_completed" : "harmonious_working",
        severity: state === "manager_approval" ? "action" : "info",
        title: d.title ? `Distribution — ${d.title}` : "Distribution",
        workflowState: state,
        status:
          state === "manager_approval"
            ? "Waiting for your approval"
            : finished
              ? "Paid and recorded"
              : "Harmonious is working on this distribution",
        sourceTable: "distribution_batches",
        sourceId: d.id,
        href: "/manager/distributions",
        at: d.updated_at ?? null,
        fundName: fundName(d.offering_id),
      }),
    );
  }

  return out;
}

/* ------------------------------------------------------------------- company */

async function companyItems(ctx: Ctx, n: Names): Promise<AttentionItem[]> {
  const s = ctx.supabase;
  const out: AttentionItem[] = [];

  const [memberships, capAccess] = await Promise.all([
    safely(async () => rows(await s.from("client_users").select("client_id").eq("user_id", ctx.userId))),
    safely(async () =>
      rows(
        await s
          .from("cap_holder_access")
          .select("client_id, revoked_at")
          .eq("user_id", ctx.userId),
      ),
    ),
  ]);
  const clientIds = [
    ...new Set([
      ...(memberships as any[]).map((m) => String(m.client_id)),
      ...(capAccess as any[]).filter((c) => !c.revoked_at).map((c) => String(c.client_id)),
    ]),
  ];
  if (!clientIds.length) return out;

  const clientName = (id: string | null) => (id ? (n.clients.get(id) ?? null) : null);

  const intakes = await safely(async () =>
    rows(
      await s
        .from("client_intake_requests")
        .select("id, client_id, status, summary, updated_at")
        .in("client_id", clientIds)
        .limit(LIMIT),
    ),
  );
  for (const r of intakes as any[]) {
    const state = String(r.status ?? "");
    if (state === "converted" || state === "declined") continue;
    out.push(
      buildAttentionItem({
        id: `company-intake:${r.id}`,
        source: "company.service_request",
        workspace: "company",
        group: state === "scoped" ? "needs_you" : "harmonious_working",
        severity: state === "scoped" ? "action" : "info",
        title: r.summary ? `Service request — ${r.summary}` : "Service request",
        workflowState: state,
        status:
          state === "scoped"
            ? "Harmonious has scoped this — your approval is needed"
            : "Harmonious is reviewing your request",
        sourceTable: "client_intake_requests",
        sourceId: r.id,
        href: "/client/services",
        at: r.updated_at ?? null,
        clientName: clientName(r.client_id),
      }),
    );
  }

  const invoices = await safely(async () =>
    rows(
      await s
        .from("invoices")
        .select("id, client_id, status, due_date, invoice_number, updated_at")
        .in("client_id", clientIds)
        .eq("status", "issued")
        .limit(LIMIT),
    ),
  );
  for (const i of invoices as any[]) {
    out.push(
      buildAttentionItem({
        id: `company-invoice:${i.id}`,
        source: "company.invoice",
        workspace: "company",
        group: "needs_you",
        severity: "action",
        title: "Invoice awaiting payment",
        workflowState: "issued",
        status: "An invoice is waiting for payment",
        sourceTable: "invoices",
        sourceId: i.id,
        href: "/client/invoices",
        at: i.updated_at ?? null,
        clientName: clientName(i.client_id),
        ...(i.due_date ? { dueDate: String(i.due_date), dueDateSource: "invoices.due_date" } : {}),
      }),
    );
  }

  const companies = await safely(async () =>
    rows(await s.from("ct_companies").select("id, client_id").in("client_id", clientIds)),
  );
  const companyIds = (companies as any[]).map((c) => String(c.id));
  if (companyIds.length) {
    const exceptions = await safely(async () =>
      rows(
        await s
          .from("ct_concierge_exceptions")
          .select("id, company_id, status, question, updated_at")
          .in("company_id", companyIds)
          .neq("status", "resolved")
          .limit(LIMIT),
      ),
    );
    for (const e of exceptions as any[]) {
      out.push(
        buildAttentionItem({
          id: `company-cap-exception:${e.id}`,
          source: "company.cap_table_question",
          workspace: "company",
          group: "needs_you",
          severity: "action",
          title: "Cap table question",
          workflowState: String(e.status ?? "open"),
          status: "Harmonious has a question about your cap table",
          sourceTable: "ct_concierge_exceptions",
          sourceId: e.id,
          href: "/client/cap-table",
          at: e.updated_at ?? null,
        }),
      );
    }

    const cases = await safely(async () =>
      rows(
        await s
          .from("ct_concierge_cases")
          .select("id, company_id, stage, review_status, target_date, updated_at")
          .in("company_id", companyIds)
          .limit(LIMIT),
      ),
    );
    for (const c of cases as any[]) {
      const review = String(c.review_status ?? "");
      const waitingOnFounder = review === "sent_for_review";
      out.push(
        buildAttentionItem({
          id: `company-cap-case:${c.id}`,
          source: "company.cap_table_migration",
          workspace: "company",
          group: waitingOnFounder ? "needs_you" : "harmonious_working",
          severity: waitingOnFounder ? "action" : "info",
          title: "Cap table preparation",
          workflowState: review || String(c.stage ?? ""),
          status: waitingOnFounder
            ? "Harmonious has prepared your cap table for your review"
            : "Harmonious is preparing your cap table",
          sourceTable: "ct_concierge_cases",
          sourceId: c.id,
          href: "/client/cap-table",
          at: c.updated_at ?? null,
          ...(c.target_date
            ? { dueDate: String(c.target_date), dueDateSource: "ct_concierge_cases.target_date" }
            : {}),
        }),
      );
    }
  }

  return out;
}

/* -------------------------------------------------------------- professional */

/**
 * A professional sees one section per delegation, never a blended list. Each
 * client's items are fetched only after `canAct` proves this delegation carries
 * the matching read permission, and the delegation id travels with every item
 * so nothing can be shown outside the context that authorised it.
 */
async function professionalItems(ctx: Ctx): Promise<AttentionItem[]> {
  const s = ctx.supabase;
  const out: AttentionItem[] = [];

  const delegations = await safely(async () =>
    rows(
      await s
        .from("delegations")
        .select("id, principal_user_id, status, acceptance_state, expires_at, updated_at")
        .eq("delegate_user_id", ctx.userId)
        .limit(50),
    ),
  );

  for (const d of delegations as any[]) {
    if (d.acceptance_state === "pending") {
      out.push(
        buildAttentionItem({
          id: `professional-acceptance:${d.id}`,
          source: "professional.acceptance",
          workspace: "professional",
          group: "needs_you",
          severity: "action",
          title: "Delegation awaiting your acceptance",
          workflowState: "pending",
          status: "A client has asked you to act for them",
          sourceTable: "delegations",
          sourceId: d.id,
          href: "/professional/acceptance",
          at: d.updated_at ?? null,
          delegationId: d.id,
        }),
      );
      continue;
    }
    if (d.status !== "active") continue;

    const decision = await canAct(ctx.userId, "view_compliance_status", {
      type: "person",
      id: String(d.principal_user_id),
    });
    if (!decision.allowed || decision.delegationId !== d.id) continue;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const person = await safely(async () =>
      rows(
        await (supabaseAdmin as any)
          .from("profiles")
          .select("user_id, legal_name")
          .eq("user_id", d.principal_user_id)
          .limit(1),
      ),
    );
    const onBehalfOf = ((person as any[])[0]?.legal_name as string | undefined) ?? "Your client";

    const applications = await safely(async () =>
      rows(
        await (supabaseAdmin as any)
          .from("investor_applications")
          .select("id, kyc_status, accreditation_status, updated_at")
          .eq("user_id", d.principal_user_id)
          .limit(20),
      ),
    );
    for (const a of applications as any[]) {
      if (done(a.kyc_status) && done(a.accreditation_status)) continue;
      out.push(
        buildAttentionItem({
          id: `professional-compliance:${d.id}:${a.id}`,
          source: "professional.compliance",
          workspace: "professional",
          group: "waiting_third_party",
          severity: "info",
          title: "Client verification outstanding",
          workflowState: done(a.kyc_status) ? "accreditation_required" : "kyc_required",
          status: done(a.kyc_status)
            ? "Accreditation evidence is still needed from your client"
            : "Identity verification is still needed from your client",
          sourceTable: "investor_applications",
          sourceId: a.id,
          href: "/professional/profiles",
          at: a.updated_at ?? null,
          delegationId: d.id,
          onBehalfOf,
        }),
      );
    }
  }

  return out;
}

/* -------------------------------------------------------------------- entry */

/**
 * Builds the Action Center for one workspace. The workspace itself is settled
 * by the caller from the reader's own relationship records.
 */
export async function attentionFor(ctx: Ctx, workspace: WorkspaceKind): Promise<AttentionResult> {
  const gaps: AttentionGap[] = [];
  let items: AttentionItem[] = [];

  if (workspace === "operations") {
    // Operations keeps its own precise work queue; the Action Center does not
    // duplicate it.
    return {
      workspace,
      groups: groupAttention([]),
      gaps: [
        {
          area: "Operations",
          message: "Operations work is shown in the Operations work queue.",
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  const n = await names(ctx.supabase);

  if (workspace === "investor") {
    items = await investorItems(ctx, n);
    gaps.push(ATTENTION_GAPS["tax_operations"]!);
  } else if (workspace === "fund_manager") {
    items = await fundManagerItems(ctx, n);
    gaps.push(ATTENTION_GAPS["tax_operations"]!, ATTENTION_GAPS["regulatory"]!);
  } else if (workspace === "company") {
    items = await companyItems(ctx, n);
  } else if (workspace === "professional") {
    items = await professionalItems(ctx);
  }

  return {
    workspace,
    groups: groupAttention(safeItems(items)),
    gaps,
    generatedAt: new Date().toISOString(),
  };
}
