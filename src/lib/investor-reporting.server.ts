/**
 * Server-only investor reporting centre.
 *
 * This layer distributes work that other engines already authorised:
 *   approved NAV → published financial statements → finalized capital accounts
 *   → published investor statements → published performance → published documents.
 *
 * Controls preserved here:
 *  - nothing is recalculated; a package only references records that are
 *    already eligible for investor publication;
 *  - publishing freezes the exact component versions in a manifest;
 *  - a published package is never rewritten — corrections supersede it;
 *  - the generator of a package cannot approve or publish it;
 *  - investors see only their own positions, one investment profile at a time;
 *  - a delegated professional needs the explicit capability for each section;
 *  - internal trial balance, journal detail, reconciliation exceptions and
 *    workpapers can never enter an investor package.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canAct } from "@/lib/delegated-access.server";
import { reviewerScope, assertScopeAllows, type ReviewerScope } from "@/lib/reviewer-authz.server";
import {
  SECTION_CAPABILITY,
  blockingExceptions,
  brandingFor,
  canTransitionPackage,
  deliveryState,
  documentGroupFor,
  isImmutablePackage,
  packageExceptions,
  portfolioForInvestor,
  presetForFund,
  publicationBlockers,
  sanitizeSections,
  segregationError,
  TEMPLATE_PRESETS,
  type ComponentRef,
  type PackageManifest,
  type PackageSection,
  type PackageStatus,
  type PortfolioVisibility,
} from "@/lib/investor-reporting-model";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();
const num = (v: unknown) => Number(v ?? 0);

function fail(message: string): never {
  throw new Error(message);
}

// --------------------------------------------------------------- authority

async function assertHarmonious(userId: string): Promise<ReviewerScope> {
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious investor reporting authority required.");
  return scope;
}

async function authorizeFund(userId: string, offeringId: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  return scope;
}

/** Re-read the package and authorise against the fund it truly belongs to. */
async function authorizePackage(userId: string, packageId: string) {
  const { data: pkg } = await db()
    .from("investor_packages")
    .select("*")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg) fail("Reporting package not found.");
  const scope = await authorizeFund(userId, pkg.offering_id);
  return { pkg, scope };
}

async function recordDeliveryEvent(input: {
  packageId?: string | null;
  noticeId?: string | null;
  offeringId?: string | null;
  investorUserId?: string | null;
  actorUserId?: string | null;
  event: string;
  channel?: string;
  onBehalfOf?: boolean;
  delegationId?: string | null;
  detail?: Record<string, unknown>;
}) {
  await db()
    .from("reporting_delivery_events")
    .insert({
      package_id: input.packageId ?? null,
      notice_id: input.noticeId ?? null,
      offering_id: input.offeringId ?? null,
      investor_user_id: input.investorUserId ?? null,
      actor_user_id: input.actorUserId ?? null,
      on_behalf_of: input.onBehalfOf ?? false,
      delegation_id: input.delegationId ?? null,
      event: input.event,
      channel: input.channel ?? "portal",
      detail: input.detail ?? {},
    });
}

// ------------------------------------------------------------ fund policy

export async function fundReportingPolicy(offeringId: string) {
  const { data } = await db()
    .from("fund_reporting_policies")
    .select("*")
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await db()
    .from("fund_reporting_policies")
    .insert({ offering_id: offeringId })
    .select("*")
    .single();
  if (error) fail(error.message);
  return created;
}

export async function saveFundReportingPolicy(
  userId: string,
  input: {
    offeringId: string;
    portfolioVisibility?: PortfolioVisibility;
    portfolioColumns?: string[];
    branding?: Record<string, unknown>;
    administratorAttribution?: string;
    contact?: Record<string, unknown>;
    managerReviewEnabled?: boolean;
  },
) {
  await assertHarmonious(userId);
  await authorizeFund(userId, input.offeringId);
  await fundReportingPolicy(input.offeringId);
  const patch: Record<string, unknown> = { updated_by: userId, updated_at: nowIso() };
  if (input.portfolioVisibility) patch["portfolio_visibility"] = input.portfolioVisibility;
  if (input.portfolioColumns) patch["portfolio_columns"] = input.portfolioColumns;
  if (input.branding) patch["branding"] = input.branding;
  if (input.administratorAttribution !== undefined) {
    patch["administrator_attribution"] = input.administratorAttribution;
  }
  if (input.contact) patch["contact"] = input.contact;
  if (input.managerReviewEnabled !== undefined) {
    patch["manager_review_enabled"] = input.managerReviewEnabled;
  }
  const { data, error } = await db()
    .from("fund_reporting_policies")
    .update(patch)
    .eq("offering_id", input.offeringId)
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

// -------------------------------------------------------------- templates

export async function listPackageTemplates(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  if (offeringId) assertScopeAllows(scope, offeringId);
  let query = db().from("reporting_package_templates").select("*").eq("is_active", true);
  if (offeringId) query = query.eq("offering_id", offeringId);
  const { data } = await query;
  return { templates: (data ?? []) as any[], presets: TEMPLATE_PRESETS };
}

export async function savePackageTemplate(
  userId: string,
  input: {
    code: string;
    name: string;
    offeringId?: string | null;
    fundType?: string | null;
    investorClassId?: string | null;
    frequency: string;
    sections: string[];
    requiredComponents?: string[];
    portfolioDetail?: "policy" | "none" | "summary" | "detail";
    branding?: Record<string, unknown>;
  },
) {
  await assertHarmonious(userId);
  if (input.offeringId) await authorizeFund(userId, input.offeringId);

  const sections = sanitizeSections(input.sections);
  if (sections.length === 0) fail("A template needs at least one investor section.");

  const { data: prior } = await db()
    .from("reporting_package_templates")
    .select("id, version")
    .eq("code", input.code)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prior) {
    await db()
      .from("reporting_package_templates")
      .update({ is_active: false, updated_at: nowIso() })
      .eq("id", prior.id);
  }

  const { data, error } = await db()
    .from("reporting_package_templates")
    .insert({
      code: input.code,
      name: input.name,
      offering_id: input.offeringId ?? null,
      fund_type: input.fundType ?? null,
      investor_class_id: input.investorClassId ?? null,
      frequency: input.frequency,
      sections,
      required_components: sanitizeSections(input.requiredComponents ?? []),
      portfolio_detail: input.portfolioDetail ?? "policy",
      branding: input.branding ?? {},
      version: prior ? Number(prior.version) + 1 : 1,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

/** The template that applies to a fund, class and frequency — preset as fallback. */
async function templateFor(
  offeringId: string,
  frequency: string,
  fundType: string | null,
  classId: string | null,
  templateId?: string | null,
) {
  if (templateId) {
    const { data } = await db()
      .from("reporting_package_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();
    if (data) return data;
  }
  const { data: rows } = await db()
    .from("reporting_package_templates")
    .select("*")
    .eq("is_active", true);
  const candidates = ((rows ?? []) as any[]).filter((t) => t.frequency === frequency);
  const pick =
    candidates.find((t) => t.offering_id === offeringId && t.investor_class_id === classId) ??
    candidates.find((t) => t.offering_id === offeringId && !t.investor_class_id) ??
    candidates.find((t) => t.fund_type && t.fund_type === fundType) ??
    null;
  if (pick) return pick;

  const preset = presetForFund(fundType, frequency);
  return {
    id: null,
    code: preset.code,
    name: preset.name,
    offering_id: null,
    fund_type: fundType,
    investor_class_id: null,
    frequency: preset.frequency,
    sections: preset.sections,
    required_components: preset.requiredComponents,
    portfolio_detail: preset.portfolioDetail,
    branding: {},
    version: 0,
  };
}

// -------------------------------------------------- authoritative sources

interface PeriodRef {
  offeringId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  periodKind: string;
}

async function approvedNav(offeringId: string, periodEnd: string) {
  const { data } = await db()
    .from("nav_versions")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("as_of_date", periodEnd)
    .in("status", ["approved", "published"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function publishedStatement(positionId: string, periodEnd: string) {
  const { data } = await db()
    .from("investor_statements")
    .select("*")
    .eq("position_id", positionId)
    .eq("period_end", periodEnd)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function publishedPerformance(offeringId: string, periodEnd: string) {
  const { data } = await db()
    .from("performance_runs")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("period_end", periodEnd)
    .eq("status", "published")
    .eq("investor_visible", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function publishedFinancials(offeringId: string, periodEnd: string) {
  const { data } = await db()
    .from("financial_reports")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("period_end", periodEnd)
    .eq("status", "published")
    .eq("investor_visible", true);
  return (data ?? []) as any[];
}

async function capitalActivity(positionId: string, offeringId: string, period: PeriodRef) {
  const [{ data: events }, { data: distributions }] = await Promise.all([
    db()
      .from("commitment_events")
      .select("id, event_type, amount_cents, effective_date, source, source_ref, payment_id")
      .eq("position_id", positionId),
    db()
      .from("fund_distributions")
      .select("id, amount_cents, kind, paid_on")
      .eq("offering_id", offeringId),
  ]);
  const inPeriod = ((events ?? []) as any[]).filter(
    (e) => String(e.effective_date ?? "") <= period.periodEnd,
  );
  return {
    events: inPeriod
      .map((e) => ({
        date: e.effective_date,
        kind: e.event_type,
        amountCents: num(e.amount_cents),
        source: { table: "commitment_events", id: e.id, ref: e.source_ref ?? e.payment_id ?? null },
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    fundDistributions: ((distributions ?? []) as any[])
      .filter((d) => String(d.paid_on ?? "") <= period.periodEnd)
      .map((d) => ({
        date: d.paid_on,
        kind: d.kind,
        amountCents: num(d.amount_cents),
        source: { table: "fund_distributions", id: d.id },
      })),
  };
}

async function investorNoticesFor(
  investorUserId: string,
  offeringId: string,
  periodEnd: string,
  kinds?: string[],
) {
  const { data: targets } = await db()
    .from("investor_notice_targets")
    .select("notice_id")
    .eq("investor_user_id", investorUserId)
    .eq("offering_id", offeringId);
  const ids = [...new Set(((targets ?? []) as any[]).map((t) => String(t.notice_id)))];
  if (ids.length === 0) return [];
  let query = db()
    .from("investor_notices")
    .select("*")
    .in("id", ids)
    .in("status", ["published", "superseded"]);
  if (kinds && kinds.length > 0) query = query.in("kind", kinds);
  const { data } = await query;
  return ((data ?? []) as any[]).filter(
    (n) => !n.effective_date || String(n.effective_date) <= periodEnd,
  );
}

async function investorDocumentsFor(investorUserId: string, offeringId: string) {
  const { data } = await db()
    .from("investor_documents")
    .select("id, doc_kind, file_name, storage_path, uploaded_at, offering_id")
    .eq("user_id", investorUserId)
    .eq("offering_id", offeringId);
  return (data ?? []) as any[];
}

async function portfolioSummary(
  userId: string,
  offeringId: string,
  periodEnd: string,
  netAssetsCents: number | null,
  policy: any,
  templateDetail: string,
) {
  const visibility: PortfolioVisibility =
    templateDetail === "policy"
      ? ((policy?.portfolio_visibility ?? "none") as PortfolioVisibility)
      : (templateDetail as PortfolioVisibility);
  if (visibility === "none") return { visibility, rows: [], asOf: periodEnd };

  const { scheduleOfInvestmentsAsOf } = await import("@/lib/financial-reporting.server");
  const schedule = await scheduleOfInvestmentsAsOf(userId, offeringId, periodEnd, netAssetsCents);
  const holdings = ((schedule as any)?.holdings ?? (schedule as any)?.lines ?? []) as any[];
  const rows = holdings.map((h) => ({
    asset: String(h.issuer ?? h.assetName ?? h.asset ?? "Investment"),
    security: (h.instrument ?? h.security ?? null) as string | null,
    costCents: h.costCents ?? h.cost_basis_cents ?? null,
    valueCents: h.valueCents ?? h.fairValueCents ?? null,
    changeCents:
      h.unrealizedCents ??
      (h.valueCents !== undefined && h.costCents !== undefined
        ? num(h.valueCents) - num(h.costCents)
        : null),
    pctOfNav: h.pctOfNetAssets ?? h.pctOfNav ?? null,
    status: (h.status ?? null) as string | null,
  }));
  return {
    visibility,
    asOf: periodEnd,
    rows: portfolioForInvestor(rows, visibility, policy?.portfolio_columns ?? undefined),
  };
}

// ------------------------------------------------------------ generation

function periodBoundsFor(periodKind: string, periodEnd: string) {
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const start = new Date(end);
  if (periodKind === "month") start.setUTCMonth(start.getUTCMonth() - 1);
  else if (periodKind === "year") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else start.setUTCMonth(start.getUTCMonth() - 3);
  start.setUTCDate(start.getUTCDate() + 1);
  const periodStart = start.toISOString().slice(0, 10);
  const label =
    periodKind === "year"
      ? `FY ${periodEnd.slice(0, 4)}`
      : periodKind === "month"
        ? `${periodEnd.slice(0, 7)}`
        : `Q${Math.ceil(Number(periodEnd.slice(5, 7)) / 3)} ${periodEnd.slice(0, 4)}`;
  return { periodStart, periodLabel: label };
}

/**
 * Build one investor's package for a period. Every section is assembled from an
 * already-published record; anything missing becomes a blocking exception
 * rather than an invented figure.
 */
async function buildPackageFor(
  userId: string,
  position: any,
  period: PeriodRef,
  template: any,
  policy: any,
  fundName: string,
) {
  const sections = sanitizeSections(template.sections);
  const components: Array<{
    section_key: string;
    title: string;
    source_table: string | null;
    source_id: string | null;
    source_version: number | null;
    source_status: string | null;
    snapshot: Record<string, unknown>;
    sort_order: number;
  }> = [];

  const nav = sections.includes("nav_summary")
    ? await approvedNav(period.offeringId, period.periodEnd)
    : null;
  const statement = sections.includes("capital_account")
    ? await publishedStatement(position.id, period.periodEnd)
    : null;
  const performance = sections.includes("investor_performance")
    ? await publishedPerformance(period.offeringId, period.periodEnd)
    : null;
  const financials = sections.includes("financial_statements")
    ? await publishedFinancials(period.offeringId, period.periodEnd)
    : [];

  let performanceLine: any = null;
  if (performance) {
    const { data } = await db()
      .from("performance_lines")
      .select("*")
      .eq("run_id", performance.id)
      .eq("position_id", position.id)
      .maybeSingle();
    performanceLine = data ?? null;
  }

  let order = 0;
  const push = (
    section: PackageSection,
    title: string,
    snapshot: Record<string, unknown>,
    source?: { table: string; id: string; version?: number | null; status?: string | null },
  ) => {
    components.push({
      section_key: section,
      title,
      source_table: source?.table ?? null,
      source_id: source?.id ?? null,
      source_version: source?.version ?? null,
      source_status: source?.status ?? null,
      snapshot,
      sort_order: order++,
    });
  };

  const branding = brandingFor(fundName, period.periodLabel, policy);

  if (sections.includes("cover")) {
    push("cover", `${fundName} — ${period.periodLabel}`, {
      branding,
      investorName: position.display_name,
      capacity: position.capacity,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });
  }

  if (nav) {
    push(
      "nav_summary",
      "Fund net asset value",
      {
        scope: "fund",
        asOf: nav.as_of_date,
        netAssetsCents: num(nav.net_asset_value_cents ?? nav.partner_capital_cents),
        navPerUnitCents: nav.nav_per_unit_cents ?? null,
        navVersion: nav.version,
      },
      { table: "nav_versions", id: nav.id, version: nav.version, status: nav.status },
    );
  }

  if (statement) {
    push(
      "capital_account",
      "Your capital account statement",
      { scope: "investor", ...(statement.snapshot ?? {}) },
      {
        table: "investor_statements",
        id: statement.id,
        version: statement.version,
        status: statement.status,
      },
    );
  }

  if (performance && performanceLine) {
    push(
      "investor_performance",
      "Your performance",
      {
        yourInvestment: {
          scope: "investor",
          contributedCents: num(performanceLine.paid_in_capital_cents),
          currentValueCents: num(performanceLine.ending_capital_cents),
          distributionsCents: num(performanceLine.realized_value_cents),
          totalValueCents: num(performanceLine.total_value_cents),
          irrBps: performanceLine.irr_bps,
          irrStatus: performanceLine.irr_status,
          moic: performanceLine.moic,
          netReturnBps: performanceLine.net_return_bps,
        },
        fundLevel: {
          scope: "fund",
          netReturnBps: performance.net_return_bps,
          irrBps: performance.irr_bps,
          irrStatus: performance.irr_status,
          moic: performance.moic,
          tvpi: performance.tvpi,
        },
        methodologyVersion: performance.methodology_version,
      },
      {
        table: "performance_runs",
        id: performance.id,
        version: performance.version,
        status: performance.status,
      },
    );
  }

  for (const report of financials) {
    push(
      "financial_statements",
      String(report.report_type ?? "Financial statements"),
      { scope: "fund", reportType: report.report_type, basis: report.basis, payload: report.payload },
      {
        table: "financial_reports",
        id: report.id,
        version: report.version,
        status: report.status,
      },
    );
  }

  if (sections.includes("portfolio_summary")) {
    const summary = await portfolioSummary(
      userId,
      period.offeringId,
      period.periodEnd,
      nav ? num(nav.net_asset_value_cents ?? nav.partner_capital_cents) : null,
      policy,
      String(template.portfolio_detail ?? "policy"),
    );
    if (summary.rows.length > 0) {
      push("portfolio_summary", "Portfolio summary", { scope: "fund", ...summary });
    }
  }

  if (sections.includes("capital_activity")) {
    const activity = await capitalActivity(position.id, period.offeringId, period);
    push("capital_activity", "Capital activity", { scope: "investor", ...activity });
  }

  if (sections.includes("capital_calls")) {
    const calls = await investorNoticesFor(
      position.investor_user_id,
      period.offeringId,
      period.periodEnd,
      ["capital_call"],
    );
    push("capital_calls", "Capital calls", {
      scope: "investor",
      outstandingCents: num((statement?.snapshot ?? {})["unfundedCommitmentCents"]),
      calls: calls.map((c) => ({
        id: c.id,
        title: c.title,
        amountCents: c.amount_cents,
        dueDate: c.due_date,
        version: c.version,
      })),
    });
  }

  if (sections.includes("notices")) {
    const notices = await investorNoticesFor(
      position.investor_user_id,
      period.offeringId,
      period.periodEnd,
    );
    push("notices", "Notices", {
      scope: "investor",
      notices: notices.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        version: n.version,
        effectiveDate: n.effective_date,
      })),
    });
  }

  if (sections.includes("documents")) {
    const documents = await investorDocumentsFor(position.investor_user_id, period.offeringId);
    push("documents", "Documents", {
      scope: "investor",
      documents: documents.map((d) => ({
        id: d.id,
        group: documentGroupFor(d.doc_kind),
        name: d.file_name,
        kind: d.doc_kind,
        uploadedAt: d.uploaded_at,
      })),
    });
  }

  const refs: ComponentRef[] = components.map((c) => ({
    sectionKey: c.section_key,
    sourceTable: c.source_table,
    sourceId: c.source_id,
    sourceVersion: c.source_version,
    sourceStatus: c.source_status,
  }));
  const required = sanitizeSections(template.required_components ?? []);
  const exceptions = packageExceptions(required, refs);

  const manifest: Partial<PackageManifest> = {
    investorUserId: position.investor_user_id,
    investmentProfileId: position.investment_profile_id ?? null,
    positionId: position.id,
    offeringId: period.offeringId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    periodLabel: period.periodLabel,
    templateCode: template.code,
    templateVersion: Number(template.version ?? 0),
    navVersionId: nav?.id ?? null,
    navVersion: nav?.version ?? null,
    capitalStatementId: statement?.id ?? null,
    capitalStatementVersion: statement?.version ?? null,
    performanceRunId: performance?.id ?? null,
    performanceVersion: performance?.version ?? null,
    financialReportIds: financials.map((r) => String(r.id)),
    noticeIds: [],
    documentIds: [],
    generatedBy: userId,
    generatedAt: nowIso(),
  };

  return { components, exceptions, manifest, branding, sections };
}

export async function generatePackages(
  userId: string,
  input: {
    offeringId: string;
    periodKind: string;
    periodEnd: string;
    periodStart?: string;
    templateId?: string | null;
    /** Set when amending: rebuild even though an open package exists. */
    regenerate?: boolean;
    /** Limit the run to one investor position (used when amending). */
    positionId?: string | null;
  },
) {
  await assertHarmonious(userId);
  await authorizeFund(userId, input.offeringId);

  const bounds = periodBoundsFor(input.periodKind, input.periodEnd);
  const period: PeriodRef = {
    offeringId: input.offeringId,
    periodKind: input.periodKind,
    periodEnd: input.periodEnd,
    periodStart: input.periodStart ?? bounds.periodStart,
    periodLabel: bounds.periodLabel,
  };

  const [{ data: offering }, { data: positions }] = await Promise.all([
    db()
      .from("offerings")
      .select("id, name, fund_type")
      .eq("id", input.offeringId)
      .maybeSingle(),
    db()
      .from("investor_positions")
      .select("*")
      .eq("offering_id", input.offeringId)
      .eq("status", "active"),
  ]);

  const policy = await fundReportingPolicy(input.offeringId);
  const fundName = String(offering?.name ?? "Fund");

  const created: any[] = [];
  const targets = ((positions ?? []) as any[]).filter(
    (p) => !input.positionId || String(p.id) === String(input.positionId),
  );
  for (const position of targets) {
    const template = await templateFor(
      input.offeringId,
      input.periodKind,
      offering?.fund_type ?? null,
      position.class_id ?? null,
      input.templateId ?? null,
    );
    const built = await buildPackageFor(userId, position, period, template, policy, fundName);

    const { data: prior } = await db()
      .from("investor_packages")
      .select("id, version, status")
      .eq("position_id", position.id)
      .eq("period_end", period.periodEnd)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior && !isImmutablePackage(String(prior.status)) && !input.regenerate) {
      // an unpublished package for this period already exists; leave it alone
      continue;
    }


    const { data: pkg, error } = await db()
      .from("investor_packages")
      .insert({
        offering_id: input.offeringId,
        investor_user_id: position.investor_user_id,
        investment_profile_id: position.investment_profile_id ?? null,
        position_id: position.id,
        template_id: template.id ?? null,
        template_code: template.code,
        template_version: Number(template.version ?? 0),
        period_kind: period.periodKind,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        period_label: period.periodLabel,
        status: "draft",
        version: prior ? Number(prior.version) + 1 : 1,
        supersedes_id: prior?.id ?? null,
        sections: built.sections,
        manifest: built.manifest,
        branding: built.branding,
        exceptions: built.exceptions,
        generated_by: userId,
        generated_at: nowIso(),
      })
      .select("*")
      .single();
    if (error) fail(error.message);

    if (built.components.length > 0) {
      const { error: componentError } = await db()
        .from("investor_package_components")
        .insert(
          built.components.map((c) => ({
            ...c,
            package_id: pkg.id,
            offering_id: input.offeringId,
          })),
        );
      if (componentError) fail(componentError.message);
    }
    created.push(pkg);
  }

  return { created: created.length, packages: created, periodLabel: period.periodLabel };
}

// -------------------------------------------------------------- lifecycle

export async function advancePackage(
  userId: string,
  packageId: string,
  to: PackageStatus,
  reason?: string,
) {
  await assertHarmonious(userId);
  const { pkg } = await authorizePackage(userId, packageId);
  const from = pkg.status as PackageStatus;
  if (!canTransitionPackage(from, to)) fail(`A package cannot move from ${from} to ${to}.`);

  const conflict = segregationError(userId, pkg, to);
  if (conflict) fail(conflict);

  const manifest = { ...(pkg.manifest ?? {}) } as Partial<PackageManifest>;
  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };

  if (to === "review") {
    patch["reviewed_by"] = userId;
    patch["reviewed_at"] = nowIso();
    manifest.reviewedBy = userId;
    manifest.reviewedAt = nowIso();
  }
  if (to === "approved") {
    patch["approved_by"] = userId;
    patch["approved_at"] = nowIso();
    manifest.approvedBy = userId;
    manifest.approvedAt = nowIso();
  }
  if (to === "published") {
    manifest.publishedBy = userId;
    manifest.publishedAt = nowIso();
    const blockers = publicationBlockers((pkg.exceptions ?? []) as any[], manifest);
    if (blockers.length > 0) fail(`This package cannot be published yet: ${blockers.join(" ")}`);
    patch["published_by"] = userId;
    patch["published_at"] = manifest.publishedAt;
  }
  if (reason) patch["revision_reason"] = reason;
  patch["manifest"] = manifest;

  const { data, error } = await db()
    .from("investor_packages")
    .update(patch)
    .eq("id", packageId)
    .select("*")
    .single();
  if (error) fail(error.message);

  if (to === "published") {
    await recordDeliveryEvent({
      packageId,
      offeringId: pkg.offering_id,
      investorUserId: pkg.investor_user_id,
      actorUserId: userId,
      event: "published",
      detail: { periodLabel: pkg.period_label },
    });
  }
  return data;
}

/** Corrections never touch a published package: they create the next version. */
export async function revisePackage(userId: string, packageId: string, reason: string) {
  await assertHarmonious(userId);
  if (!reason || reason.trim().length < 10) {
    fail("Please record why the published package is being amended.");
  }
  const { pkg } = await authorizePackage(userId, packageId);
  if (pkg.status !== "published") fail("Only a published package can be amended.");

  const generated = await generatePackages(userId, {
    offeringId: pkg.offering_id,
    periodKind: pkg.period_kind,
    periodEnd: pkg.period_end,
    periodStart: pkg.period_start,
    positionId: pkg.position_id,
    regenerate: true,
  });
  const replacement = generated.packages.find((p: any) => p.position_id === pkg.position_id);
  if (!replacement) fail("Could not rebuild this investor's package.");

  await db()
    .from("investor_packages")
    .update({ supersedes_id: packageId, revision_reason: reason, updated_at: nowIso() })
    .eq("id", replacement.id);
  await db()
    .from("investor_packages")
    .update({ status: "superseded", superseded_by_id: replacement.id, updated_at: nowIso() })
    .eq("id", packageId);

  return { packageId: replacement.id, supersedes: packageId };
}

export async function managerRespondToPackage(
  userId: string,
  packageId: string,
  response: "acknowledged" | "challenged",
  note?: string,
) {
  const { pkg } = await authorizePackage(userId, packageId);
  if (!["published", "superseded"].includes(String(pkg.status))) {
    fail("A package can only be reviewed once it is published.");
  }
  const policy = await fundReportingPolicy(pkg.offering_id);
  if (!policy.manager_review_enabled) fail("Manager review is not enabled for this fund.");
  if (response === "challenged" && (!note || note.trim().length < 10)) {
    fail("Please describe what looks wrong so it can be investigated.");
  }
  const { data, error } = await db()
    .from("investor_packages")
    .update({
      manager_response: response,
      manager_note: note ?? null,
      manager_responded_by: userId,
      manager_responded_at: nowIso(),
    })
    .eq("id", packageId)
    .select("id, manager_response, manager_note")
    .single();
  if (error) fail(error.message);
  return data;
}

// --------------------------------------------------------- investor reads

interface ViewerOptions {
  /** Viewing as a delegated professional for this principal. */
  onBehalfOfUserId?: string | null;
  delegationId?: string | null;
  organizationId?: string | null;
}

async function resolveViewer(userId: string, options: ViewerOptions = {}) {
  if (!options.onBehalfOfUserId || options.onBehalfOfUserId === userId) {
    return { subjectUserId: userId, delegated: false, delegationId: null as string | null };
  }
  const decision = await canAct(userId, "view_investments", {
    type: "person",
    id: options.onBehalfOfUserId,
  }, {
    ...(options.delegationId ? { delegationId: options.delegationId } : {}),
    ...(options.organizationId ? { organizationId: options.organizationId } : {}),
  });
  if (!decision.allowed) fail(`Forbidden: ${decision.reason}`);
  return {
    subjectUserId: options.onBehalfOfUserId,
    delegated: true,
    delegationId: decision.delegationId ?? null,
  };
}

/** Which sections a delegated professional may actually see. */
async function allowedSections(
  actorUserId: string,
  subjectUserId: string,
  delegated: boolean,
  sections: PackageSection[],
  delegationId: string | null,
): Promise<PackageSection[]> {
  if (!delegated) return sections;
  const allowed: PackageSection[] = [];
  for (const section of sections) {
    const decision = await canAct(actorUserId, SECTION_CAPABILITY[section], {
      type: "person",
      id: subjectUserId,
    }, delegationId ? { delegationId } : {});
    if (decision.allowed) allowed.push(section);
  }
  return allowed;
}

/**
 * The investor reporting centre: investment profile → fund → period.
 * Profiles are never merged, even when one person controls all of them.
 */
export async function investorReportingCenter(userId: string, options: ViewerOptions = {}) {
  const viewer = await resolveViewer(userId, options);

  const { data: packages } = await db()
    .from("investor_packages")
    .select("*")
    .eq("investor_user_id", viewer.subjectUserId)
    .in("status", ["published", "superseded"])
    .order("period_end", { ascending: false })
    .limit(400);
  const rows = (packages ?? []) as any[];

  const offeringIds = [...new Set(rows.map((r) => String(r.offering_id)))];
  const profileIds = [
    ...new Set(rows.map((r) => r.investment_profile_id).filter(Boolean).map(String)),
  ];

  const [{ data: offerings }, { data: profiles }] = await Promise.all([
    offeringIds.length
      ? db().from("offerings").select("id, name").in("id", offeringIds)
      : Promise.resolve({ data: [] }),
    profileIds.length
      ? db()
          .from("investment_profiles")
          .select("id, display_label, profile_type, legal_name")
          .in("id", profileIds)
      : Promise.resolve({ data: [] }),
  ]);
  const fundName = new Map(((offerings ?? []) as any[]).map((o) => [String(o.id), o.name]));
  const profileById = new Map(((profiles ?? []) as any[]).map((p) => [String(p.id), p]));

  const grouped = new Map<string, any>();
  for (const pkg of rows) {
    const profileKey = String(pkg.investment_profile_id ?? "unassigned");
    const profile = profileById.get(profileKey);
    const entry =
      grouped.get(profileKey) ??
      {
        investmentProfileId: pkg.investment_profile_id ?? null,
        profileLabel: profile?.display_label ?? profile?.legal_name ?? "Personal",
        profileType: profile?.profile_type ?? "individual",
        funds: new Map<string, any>(),
      };
    const fundKey = String(pkg.offering_id);
    const fund =
      entry.funds.get(fundKey) ??
      {
        offeringId: pkg.offering_id,
        fundName: fundName.get(fundKey) ?? "Fund",
        periods: [] as any[],
      };
    fund.periods.push({
      packageId: pkg.id,
      periodLabel: pkg.period_label,
      periodStart: pkg.period_start,
      periodEnd: pkg.period_end,
      status: pkg.status,
      version: pkg.version,
      publishedAt: pkg.published_at,
      templateCode: pkg.template_code,
      requiresAcknowledgement: pkg.requires_acknowledgement,
    });
    entry.funds.set(fundKey, fund);
    grouped.set(profileKey, entry);
  }

  return {
    delegated: viewer.delegated,
    profiles: [...grouped.values()].map((entry) => ({
      investmentProfileId: entry.investmentProfileId,
      profileLabel: entry.profileLabel,
      profileType: entry.profileType,
      funds: [...entry.funds.values()],
    })),
  };
}

/** One published package, filtered to the sections this viewer may see. */
export async function investorPackageDetail(
  userId: string,
  packageId: string,
  options: ViewerOptions = {},
) {
  const { data: pkg } = await db()
    .from("investor_packages")
    .select("*")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg) fail("Reporting package not found.");

  let delegated = false;
  let delegationId: string | null = null;
  let isStaffOrManager = false;

  if (pkg.investor_user_id === userId) {
    // the investor's own package
  } else if (options.onBehalfOfUserId) {
    const viewer = await resolveViewer(userId, options);
    if (viewer.subjectUserId !== pkg.investor_user_id) fail("Forbidden: not your package.");
    delegated = true;
    delegationId = viewer.delegationId;
  } else {
    await authorizeFund(userId, pkg.offering_id);
    isStaffOrManager = true;
  }

  if (!isStaffOrManager && !["published", "superseded"].includes(String(pkg.status))) {
    fail("This package has not been published.");
  }

  const { data: componentRows } = await db()
    .from("investor_package_components")
    .select("*")
    .eq("package_id", packageId)
    .order("sort_order", { ascending: true });
  let components = (componentRows ?? []) as any[];

  if (delegated) {
    const sections = await allowedSections(
      userId,
      pkg.investor_user_id,
      true,
      sanitizeSections(components.map((c) => c.section_key)),
      delegationId,
    );
    const allowed = new Set(sections);
    components = components.filter((c) => allowed.has(c.section_key));
  }

  if (!isStaffOrManager) {
    await recordDeliveryEvent({
      packageId,
      offeringId: pkg.offering_id,
      investorUserId: pkg.investor_user_id,
      actorUserId: userId,
      event: "opened",
      onBehalfOf: delegated,
      delegationId,
    });
  }

  const { data: events } = await db()
    .from("reporting_delivery_events")
    .select("event, channel, created_at")
    .eq("package_id", packageId);

  return {
    package: pkg,
    components,
    delegated,
    delivery: deliveryState((events ?? []) as any[]),
  };
}

/** Recording that the investor actually did something in the portal. */
export async function recordPackageInteraction(
  userId: string,
  packageId: string,
  event: "downloaded" | "acknowledged" | "exported",
  options: ViewerOptions = {},
) {
  const { data: pkg } = await db()
    .from("investor_packages")
    .select("id, offering_id, investor_user_id, status")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg) fail("Reporting package not found.");
  if (!["published", "superseded"].includes(String(pkg.status))) {
    fail("This package has not been published.");
  }

  let delegated = false;
  let delegationId: string | null = null;
  if (pkg.investor_user_id !== userId) {
    const viewer = await resolveViewer(userId, {
      ...options,
      onBehalfOfUserId: options.onBehalfOfUserId ?? pkg.investor_user_id,
    });
    if (viewer.subjectUserId !== pkg.investor_user_id) fail("Forbidden: not your package.");
    if (event === "acknowledged") fail("Only the investor can acknowledge a package.");
    delegated = true;
    delegationId = viewer.delegationId;
  }

  await recordDeliveryEvent({
    packageId,
    offeringId: pkg.offering_id,
    investorUserId: pkg.investor_user_id,
    actorUserId: userId,
    event,
    onBehalfOf: delegated,
    delegationId,
  });
  return { recorded: event };
}

/** The dashboard row for each investment, from approved records only. */
export async function investorDashboardSummary(userId: string, options: ViewerOptions = {}) {
  const viewer = await resolveViewer(userId, options);
  const subject = viewer.subjectUserId;

  const { data: positions } = await db()
    .from("investor_positions")
    .select("*")
    .eq("investor_user_id", subject);
  const rows = (positions ?? []) as any[];
  if (rows.length === 0) return { investments: [] };

  const offeringIds = [...new Set(rows.map((r) => String(r.offering_id)))];
  const [{ data: offerings }, { data: statements }, { data: packages }, { data: lines }] =
    await Promise.all([
      db().from("offerings").select("id, name").in("id", offeringIds),
      db()
        .from("investor_statements")
        .select("*")
        .eq("investor_user_id", subject)
        .eq("status", "published")
        .order("period_end", { ascending: false }),
      db()
        .from("investor_packages")
        .select("id, offering_id, position_id, period_label, period_end, status, published_at")
        .eq("investor_user_id", subject)
        .in("status", ["published", "superseded"])
        .order("period_end", { ascending: false }),
      db()
        .from("performance_lines")
        .select("*")
        .eq("investor_user_id", subject)
        .order("created_at", { ascending: false }),
    ]);

  const fundName = new Map(((offerings ?? []) as any[]).map((o) => [String(o.id), o.name]));
  const latestBy = <T extends { position_id?: string | null }>(list: T[], positionId: string) =>
    list.find((row) => String(row.position_id ?? "") === positionId) ?? null;

  const publishedRuns = new Set<string>();
  const { data: runs } = await db()
    .from("performance_runs")
    .select("id, status, investor_visible")
    .in("status", ["published", "superseded"]);
  for (const run of (runs ?? []) as any[]) {
    if (run.investor_visible) publishedRuns.add(String(run.id));
  }

  const investments = [];
  for (const position of rows) {
    const statement = latestBy((statements ?? []) as any[], String(position.id));
    const snapshot = (statement?.snapshot ?? {}) as Record<string, unknown>;
    const performanceLine =
      ((lines ?? []) as any[]).find(
        (l) => String(l.position_id) === String(position.id) && publishedRuns.has(String(l.run_id)),
      ) ?? null;
    const notices = await investorNoticesFor(
      subject,
      String(position.offering_id),
      "9999-12-31",
    );
    const packageRow = ((packages ?? []) as any[]).find(
      (p) => String(p.position_id) === String(position.id),
    );

    investments.push({
      positionId: position.id,
      offeringId: position.offering_id,
      fundName: fundName.get(String(position.offering_id)) ?? "Fund",
      investmentProfileId: position.investment_profile_id,
      profileLabel: position.display_name,
      capacity: position.capacity,
      commitmentCents: num(snapshot["commitmentCents"]),
      contributedCents: num(snapshot["contributedToDateCents"] ?? snapshot["contributionsCents"]),
      unfundedCommitmentCents: num(snapshot["unfundedCommitmentCents"]),
      currentValueCents: num(snapshot["endingCapitalCents"]),
      distributionsCents: num(snapshot["distributionsToDateCents"] ?? snapshot["distributionsCents"]),
      totalValueCents:
        num(snapshot["endingCapitalCents"]) +
        num(snapshot["distributionsToDateCents"] ?? snapshot["distributionsCents"]),
      latestCapitalStatement: statement
        ? { id: statement.id, periodEnd: statement.period_end, version: statement.version }
        : null,
      latestPerformance: performanceLine
        ? {
            runId: performanceLine.run_id,
            irrBps: performanceLine.irr_bps,
            irrStatus: performanceLine.irr_status,
            moic: performanceLine.moic,
            totalValueCents: performanceLine.total_value_cents,
          }
        : null,
      latestPeriod: packageRow
        ? { packageId: packageRow.id, periodLabel: packageRow.period_label }
        : null,
      outstandingCapitalCalls: notices
        .filter((n) => n.kind === "capital_call")
        .map((n) => ({ id: n.id, title: n.title, amountCents: n.amount_cents, dueDate: n.due_date })),
      recentDistributionNotices: notices
        .filter((n) => n.kind === "distribution")
        .slice(0, 5)
        .map((n) => ({ id: n.id, title: n.title, effectiveDate: n.effective_date })),
    });
  }

  return { investments, delegated: viewer.delegated };
}

/** The investor's document library, grouped, scoped to their own records. */
export async function investorDocumentLibrary(userId: string, options: ViewerOptions = {}) {
  const viewer = await resolveViewer(userId, options);
  const subject = viewer.subjectUserId;

  const [{ data: documents }, { data: packages }, { data: statements }] = await Promise.all([
    db()
      .from("investor_documents")
      .select("id, doc_kind, file_name, uploaded_at, offering_id")
      .eq("user_id", subject),
    db()
      .from("investor_packages")
      .select("id, offering_id, period_label, period_end, status, published_at")
      .eq("investor_user_id", subject)
      .in("status", ["published", "superseded"]),
    db()
      .from("investor_statements")
      .select("id, offering_id, period_end, version, status")
      .eq("investor_user_id", subject)
      .eq("status", "published"),
  ]);

  const items = [
    ...((documents ?? []) as any[]).map((d) => ({
      id: d.id,
      group: documentGroupFor(d.doc_kind),
      title: d.file_name,
      date: d.uploaded_at,
      offeringId: d.offering_id,
      kind: "document",
    })),
    ...((packages ?? []) as any[]).map((p) => ({
      id: p.id,
      group: "Reporting" as const,
      title: `Investor package — ${p.period_label}`,
      date: p.published_at,
      offeringId: p.offering_id,
      kind: "package",
    })),
    ...((statements ?? []) as any[]).map((s) => ({
      id: s.id,
      group: "Capital statements" as const,
      title: `Capital account statement — ${s.period_end}`,
      date: s.period_end,
      offeringId: s.offering_id,
      kind: "statement",
    })),
  ];

  const groups = new Map<string, any[]>();
  for (const item of items) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  return {
    groups: [...groups.entries()].map(([group, entries]) => ({
      group,
      items: entries.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))),
    })),
  };
}

// ----------------------------------------------------------------- notices

export async function saveNotice(
  userId: string,
  input: {
    offeringId: string;
    kind: string;
    title: string;
    body?: string;
    periodLabel?: string;
    effectiveDate?: string;
    amountCents?: number | null;
    dueDate?: string | null;
    requiresAcknowledgement?: boolean;
    investorUserIds?: string[];
  },
) {
  await assertHarmonious(userId);
  await authorizeFund(userId, input.offeringId);
  const { data, error } = await db()
    .from("investor_notices")
    .insert({
      offering_id: input.offeringId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? "",
      period_label: input.periodLabel ?? null,
      effective_date: input.effectiveDate ?? null,
      amount_cents: input.amountCents ?? null,
      due_date: input.dueDate ?? null,
      requires_acknowledgement: input.requiresAcknowledgement ?? false,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  const { data: positions } = await db()
    .from("investor_positions")
    .select("id, investor_user_id, investment_profile_id")
    .eq("offering_id", input.offeringId);
  const targets = ((positions ?? []) as any[]).filter(
    (p) => !input.investorUserIds || input.investorUserIds.includes(String(p.investor_user_id)),
  );
  if (targets.length > 0) {
    await db()
      .from("investor_notice_targets")
      .insert(
        targets.map((p) => ({
          notice_id: data.id,
          offering_id: input.offeringId,
          investor_user_id: p.investor_user_id,
          investment_profile_id: p.investment_profile_id ?? null,
          position_id: p.id,
        })),
      );
  }
  return data;
}

export async function publishNotice(userId: string, noticeId: string) {
  await assertHarmonious(userId);
  const { data: notice } = await db()
    .from("investor_notices")
    .select("*")
    .eq("id", noticeId)
    .maybeSingle();
  if (!notice) fail("Notice not found.");
  await authorizeFund(userId, notice.offering_id);
  if (notice.status !== "draft") fail("Only a draft notice can be published.");

  const { data, error } = await db()
    .from("investor_notices")
    .update({ status: "published", published_by: userId, published_at: nowIso() })
    .eq("id", noticeId)
    .select("*")
    .single();
  if (error) fail(error.message);

  const { data: targets } = await db()
    .from("investor_notice_targets")
    .select("investor_user_id")
    .eq("notice_id", noticeId);
  for (const target of (targets ?? []) as any[]) {
    await recordDeliveryEvent({
      noticeId,
      offeringId: notice.offering_id,
      investorUserId: target.investor_user_id,
      actorUserId: userId,
      event: "published",
    });
  }
  return data;
}

export async function investorNotices(userId: string, options: ViewerOptions = {}) {
  const viewer = await resolveViewer(userId, options);
  const { data: targets } = await db()
    .from("investor_notice_targets")
    .select("notice_id, offering_id, position_id")
    .eq("investor_user_id", viewer.subjectUserId);
  const ids = [...new Set(((targets ?? []) as any[]).map((t) => String(t.notice_id)))];
  if (ids.length === 0) return { notices: [] };
  const { data } = await db()
    .from("investor_notices")
    .select("*")
    .in("id", ids)
    .in("status", ["published", "superseded"]);
  return { notices: (data ?? []) as any[] };
}

// -------------------------------------------------------------- operations

export async function reportingOperations(userId: string, offeringId?: string) {
  const scope = await assertHarmonious(userId);
  if (offeringId) assertScopeAllows(scope, offeringId);

  let query = db()
    .from("investor_packages")
    .select("*")
    .order("period_end", { ascending: false })
    .limit(500);
  if (offeringId) query = query.eq("offering_id", offeringId);
  const { data } = await query;
  const packages = (data ?? []) as any[];

  const { data: offerings } = await db().from("offerings").select("id, name");
  const nameById = new Map(((offerings ?? []) as any[]).map((o) => [String(o.id), o.name]));
  const decorated = packages.map((p) => ({
    ...p,
    fundName: nameById.get(String(p.offering_id)) ?? "Fund",
    blocking: blockingExceptions((p.exceptions ?? []) as any[]).length,
  }));

  const { data: events } = await db()
    .from("reporting_delivery_events")
    .select("package_id, event, channel, created_at")
    .limit(2000);
  const byPackage = new Map<string, any[]>();
  for (const event of (events ?? []) as any[]) {
    const key = String(event.package_id ?? "");
    byPackage.set(key, [...(byPackage.get(key) ?? []), event]);
  }

  return {
    funds: ((offerings ?? []) as any[]).map((o) => ({ id: o.id, name: o.name })),
    awaitingGeneration: decorated.filter((p) => p.status === "draft" && p.blocking > 0),
    awaitingReview: decorated.filter((p) => p.status === "draft" && p.blocking === 0),
    inReview: decorated.filter((p) => p.status === "review"),
    readyToPublish: decorated.filter((p) => p.status === "approved"),
    published: decorated.filter((p) => p.status === "published"),
    superseded: decorated.filter((p) => p.status === "superseded"),
    challenges: decorated.filter((p) => p.manager_response === "challenged"),
    exceptions: decorated.filter((p) => p.blocking > 0),
    delivery: decorated
      .filter((p) => p.status === "published")
      .map((p) => ({
        packageId: p.id,
        fundName: p.fundName,
        periodLabel: p.period_label,
        investorUserId: p.investor_user_id,
        ...deliveryState(byPackage.get(String(p.id)) ?? []),
      })),
  };
}

export async function managerPackages(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  const ids = offeringId ? [offeringId] : scope.offeringIds;
  if (offeringId) assertScopeAllows(scope, offeringId);
  if (!scope.isAdmin && ids.length === 0) return { funds: [], packages: [] };

  let query = db()
    .from("investor_packages")
    .select("*")
    .in("status", ["published", "superseded"])
    .order("period_end", { ascending: false })
    .limit(300);
  if (!scope.isAdmin || offeringId) query = query.in("offering_id", ids);
  const { data } = await query;
  const packages = (data ?? []) as any[];

  const { data: offerings } = await db()
    .from("offerings")
    .select("id, name")
    .in(
      "id",
      packages.length > 0
        ? [...new Set(packages.map((p) => String(p.offering_id)))]
        : ["00000000-0000-0000-0000-000000000000"],
    );
  const nameById = new Map(((offerings ?? []) as any[]).map((o) => [String(o.id), o.name]));
  return {
    funds: ((offerings ?? []) as any[]).map((o) => ({ id: o.id, name: o.name })),
    packages: packages.map((p) => ({ ...p, fundName: nameById.get(String(p.offering_id)) ?? "Fund" })),
  };
}

/** Full internal detail for staff: package, components, manifest and delivery. */
export async function packageDetail(userId: string, packageId: string) {
  const { pkg, scope } = await authorizePackage(userId, packageId);
  if (!scope.isAdmin && !["published", "superseded"].includes(String(pkg.status))) {
    fail("This package has not been published.");
  }
  const [{ data: components }, { data: events }] = await Promise.all([
    db()
      .from("investor_package_components")
      .select("*")
      .eq("package_id", packageId)
      .order("sort_order", { ascending: true }),
    db()
      .from("reporting_delivery_events")
      .select("*")
      .eq("package_id", packageId)
      .order("created_at", { ascending: false }),
  ]);
  return {
    package: pkg,
    components: (components ?? []) as any[],
    manifest: pkg.manifest ?? {},
    delivery: deliveryState(((events ?? []) as any[]) ?? []),
    events: scope.isAdmin ? ((events ?? []) as any[]) : [],
  };
}
