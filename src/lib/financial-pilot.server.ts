/**
 * Financial Pilot Readiness — server. Staff-only, read-mostly.
 *
 * PARALLEL MODE: nothing here migrates a fund, posts journals, sends money or
 * changes official books. Facts are read from the existing engines; pilot
 * records (scores, opening data, variances, sign-offs, decisions) live in the
 * append-only financial_pilot_* tables reachable only via the service role.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope } from "@/lib/reviewer-authz.server";
import {
  evaluateReadiness,
  isStructural,
  openingReconciliation,
  parallelPassBlockers,
  pilotTransitionError,
  recommendCandidate,
  scoreCandidate,
  signoffError,
  varianceResolutionError,
  decisionTarget,
  CONTROL_ROLES,
  LEAD_ROLES,
  type CandidateFactors,
  type PilotStaffRole,
  type PilotStatus,
  type ReadinessFacts,
  type SignoffRole,
} from "@/lib/financial-pilot-model";

const db = () => supabaseAdmin as any;
const fail = (m: string): never => {
  throw new Error(m);
};

async function rolesOf(userId: string): Promise<string[]> {
  const { data } = await db().from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

async function staff(userId: string) {
  const scope = await reviewerScope(userId).catch(() => null);
  if (!scope?.isAdmin) fail("Forbidden: Harmonious finance and operations staff only.");
  return rolesOf(userId);
}

async function pilotRow(pilotId: string) {
  const { data } = await db().from("financial_pilots").select("*").eq("id", pilotId).maybeSingle();
  if (!data) fail("Pilot not found.");
  return data;
}

async function event(p: { pilotId: string | null; offeringId: string; event: string; from?: string | null | undefined; to?: string | null | undefined; detail?: Record<string, unknown>; actor: string }) {
  await db().from("financial_pilot_events").insert({
    pilot_id: p.pilotId,
    offering_id: p.offeringId,
    event: p.event,
    from_status: p.from ?? null,
    to_status: p.to ?? null,
    detail: p.detail ?? {},
    actor_user_id: p.actor,
  });
}

/* ---------------- Candidates ---------------- */

/** Read-only suggestion of complexity factors from existing records. Staff confirm or correct them. */
async function suggestedFactors(offeringId: string): Promise<Partial<CandidateFactors>> {
  const [pos, banks, assets, sl, wf, tax, book] = await Promise.all([
    db().from("investor_positions").select("id", { count: "exact", head: true }).eq("offering_id", offeringId).neq("status", "withdrawn"),
    db().from("bank_accounts").select("id", { count: "exact", head: true }).eq("offering_id", offeringId),
    db().from("portfolio_assets").select("id", { count: "exact", head: true }).eq("offering_id", offeringId),
    db().from("side_letters").select("id", { count: "exact", head: true }).eq("offering_id", offeringId),
    db().from("waterfall_terms").select("tiers").eq("offering_id", offeringId).order("version", { ascending: false }).limit(1).maybeSingle(),
    db().from("investor_positions").select("investor_user_id").eq("offering_id", offeringId),
    db().from("ledger_books").select("functional_currency").eq("offering_id", offeringId).maybeSingle(),
  ]);
  const users = ((tax.data ?? []) as any[]).map((r) => r.investor_user_id).filter(Boolean);
  let international = 0;
  if (users.length) {
    const { data } = await db().from("investor_tax_profiles").select("investor_user_id, tax_residency_country").in("investor_user_id", users);
    international = new Set(((data ?? []) as any[]).filter((r) => r.tax_residency_country && r.tax_residency_country !== "US").map((r) => r.investor_user_id)).size;
  }
  const tiers = Array.isArray(wf.data?.tiers) ? wf.data.tiers.length : wf.data ? 1 : 0;
  return {
    investorCount: pos.count ?? 0,
    bankAccountCount: banks.count ?? 0,
    investmentCount: assets.count ?? 0,
    sideLetters: sl.count ?? 0,
    waterfallTiers: tiers,
    internationalInvestors: international,
    multiCurrency: Boolean(book.data?.functional_currency && book.data.functional_currency !== "USD"),
  };
}

export async function listPilotCandidates(userId: string) {
  await staff(userId);
  const [{ data: funds }, { data: scores }, { data: pilots }] = await Promise.all([
    db().from("offerings").select("id, name, fund_type, entity_type").is("consolidated_into", null).order("name"),
    db().from("financial_pilot_candidate_scores").select("*").order("created_at", { ascending: false }),
    db().from("financial_pilots").select("id, offering_id, status").neq("status", "withdrawn"),
  ]);
  const latest = new Map<string, any>();
  for (const s of (scores ?? []) as any[]) if (!latest.has(s.offering_id)) latest.set(s.offering_id, s);
  const pilotBy = new Map(((pilots ?? []) as any[]).map((p) => [p.offering_id, p]));
  const rows = ((funds ?? []) as any[]).map((f) => {
    const s = latest.get(f.id);
    return {
      offeringId: f.id as string,
      name: f.name as string,
      fundType: f.fund_type ?? null,
      entityType: f.entity_type ?? null,
      scored: Boolean(s),
      total: s ? Number(s.total_score) : Number.POSITIVE_INFINITY,
      disqualifiers: (s?.disqualifiers ?? []) as string[],
      scoredAt: s?.created_at ?? null,
      pilot: pilotBy.get(f.id) ?? null,
    };
  });
  const recommended = recommendCandidate(rows.filter((r) => r.scored));
  return { rows, recommendedOfferingId: recommended?.offeringId ?? null };
}

export async function candidateFactorSuggestion(userId: string, offeringId: string) {
  await staff(userId);
  return suggestedFactors(offeringId);
}

export async function recordCandidateScore(userId: string, input: { offeringId: string; factors: CandidateFactors; note?: string | null | undefined }) {
  await staff(userId);
  const r = scoreCandidate(input.factors);
  await db().from("financial_pilot_candidate_scores").insert({
    offering_id: input.offeringId,
    factors: input.factors,
    total_score: r.total,
    disqualifiers: r.disqualifiers,
    note: input.note ?? null,
    scored_by: userId,
  });
  await event({ pilotId: null, offeringId: input.offeringId, event: "candidate_scored", detail: { total: r.total, disqualifiers: r.disqualifiers }, actor: userId });
  return r;
}

/* ---------------- Pilot lifecycle ---------------- */

export async function startPilotEvaluation(userId: string, offeringId: string) {
  await staff(userId);
  const { data: existing } = await db().from("financial_pilots").select("id").eq("offering_id", offeringId).neq("status", "withdrawn").maybeSingle();
  if (existing) return { pilotId: existing.id as string };
  const { data, error } = await db().from("financial_pilots").insert({ offering_id: offeringId, created_by: userId }).select("id").single();
  if (error) fail(error.message);
  await event({ pilotId: data.id, offeringId, event: "pilot_evaluation_started", to: "evaluating", actor: userId });
  return { pilotId: data.id as string };
}

async function currentStaff(pilotId: string): Promise<Partial<Record<PilotStaffRole, string>>> {
  const { data } = await db().from("financial_pilot_staff").select("role_key, user_id, created_at").eq("pilot_id", pilotId).order("created_at", { ascending: true });
  const out: Partial<Record<PilotStaffRole, string>> = {};
  for (const r of (data ?? []) as any[]) out[r.role_key as PilotStaffRole] = String(r.user_id);
  return out;
}

export async function assignPilotStaff(userId: string, input: { pilotId: string; role: PilotStaffRole; assigneeId: string }) {
  await staff(userId);
  const p = await pilotRow(input.pilotId);
  if (!(CONTROL_ROLES as readonly string[]).includes(input.role) && !(LEAD_ROLES as readonly string[]).includes(input.role)) fail("Unknown pilot role.");
  const assigneeRoles = await rolesOf(input.assigneeId);
  if (!assigneeRoles.some((r) => ["admin", "super_admin", "finance", "operations", "fund_administration"].includes(r))) fail("Pilot roles can only go to Harmonious staff.");
  if (input.role === "finance_payout" && !assigneeRoles.includes("finance")) fail("The finance/payout role needs someone with the Finance role.");
  await db().from("financial_pilot_staff").insert({ pilot_id: p.id, role_key: input.role, user_id: input.assigneeId, assigned_by: userId });
  await event({ pilotId: p.id, offeringId: p.offering_id, event: "pilot_staff_assigned", detail: { role: input.role }, actor: userId });
  return { ok: true };
}

/* ---------------- Facts & readiness ---------------- */

async function ledgerFacts(offeringId: string) {
  const { data: book } = await db().from("ledger_books").select("id, basis, fiscal_year_end_month").eq("offering_id", offeringId).maybeSingle();
  if (!book) return { book: null, accounts: 0, tbDebits: 0, tbCredits: 0, cash: 0, equity: 0 };
  const { data: accts } = await db().from("chart_of_accounts").select("id, account_type, subtype, normal_balance").eq("book_id", book.id);
  const byId = new Map(((accts ?? []) as any[]).map((a) => [a.id, a]));
  const { data: lines } = await db()
    .from("journal_lines")
    .select("account_id, debit_cents, credit_cents, journal_entries!inner(book_id, status)")
    .eq("journal_entries.book_id", book.id)
    .eq("journal_entries.status", "posted");
  let d = 0, c = 0, cash = 0, equity = 0;
  for (const l of (lines ?? []) as any[]) {
    const dc = Number(l.debit_cents) || 0, cc = Number(l.credit_cents) || 0;
    d += dc; c += cc;
    const a = byId.get(l.account_id);
    if (a?.subtype === "cash") cash += dc - cc;
    if (a?.account_type === "equity") equity += cc - dc;
  }
  return { book, accounts: (accts ?? []).length, tbDebits: d, tbCredits: c, cash, equity };
}

async function openingFor(pilotId: string) {
  const { data } = await db().from("financial_pilot_opening_balances").select("*").eq("pilot_id", pilotId).order("created_at", { ascending: true });
  const latest: Record<string, number> = {};
  // Fund-level categories: the latest entry per category wins (history retained).
  for (const r of (data ?? []) as any[]) if (!r.position_id) latest[r.category] = Number(r.official_cents);
  return { rows: (data ?? []) as any[], latest };
}

async function readinessFacts(offeringId: string, pilotId: string | null): Promise<{ facts: ReadinessFacts; opening: ReturnType<typeof openingReconciliation> | null; harmonious: any }> {
  const [ledger, engagement, positions, banks, snaps, assets, rules, commit] = await Promise.all([
    ledgerFacts(offeringId),
    db().from("service_engagements").select("id, primary_administrator_user_id, relationship_lead_user_id, accounting_lead_user_id").eq("fund_id", offeringId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("investor_positions").select("id, investor_user_id, person_id, capacity").eq("offering_id", offeringId).neq("status", "withdrawn"),
    db().from("bank_accounts").select("id, item_id, status").eq("offering_id", offeringId),
    db().from("bank_balance_snapshots").select("id").eq("offering_id", offeringId).not("reviewed_by", "is", null).limit(1),
    db().from("portfolio_assets").select("id, cost_basis_cents, status").eq("offering_id", offeringId),
    db().from("tax_withholding_rules").select("id, policy_source, approved_by, status, offering_id").eq("status", "approved").or(`offering_id.is.null,offering_id.eq.${offeringId}`),
    db().from("commitment_events").select("position_id, event_type, amount_cents").eq("offering_id", offeringId),
  ]);
  const pos = (positions.data ?? []) as any[];
  const users = pos.map((p) => p.investor_user_id).filter(Boolean);
  // Same person resolution the distribution identity gate uses: the position's person, else the investor's onboarding person.
  const { data: onb } = users.length ? await db().from("investor_onboardings").select("investor_user_id, person_id").eq("offering_id", offeringId).in("investor_user_id", users) : { data: [] };
  const onbPerson = new Map(((onb ?? []) as any[]).filter((o) => o.person_id).map((o) => [o.investor_user_id, o.person_id]));
  for (const p of pos) if (!p.person_id && p.investor_user_id) p.person_id = onbPerson.get(p.investor_user_id) ?? null;
  const persons = pos.map((p) => p.person_id).filter(Boolean);
  const [taxP, idc, instr] = await Promise.all([
    users.length ? db().from("investor_tax_profiles").select("investor_user_id, documentation_form, documentation_status").in("investor_user_id", users) : { data: [] },
    persons.length ? db().from("identity_check_results").select("person_id, check_kind, harmonious_status").in("person_id", persons) : { data: [] },
    users.length ? db().from("investor_payment_instructions").select("investor_user_id, status").in("investor_user_id", users).eq("status", "approved") : { data: [] },
  ]);
  const okIdentity = new Set(((idc.data ?? []) as any[]).filter((r) => r.check_kind === "identity" && r.harmonious_status === "approved").map((r) => r.person_id));
  const okAml = new Set(((idc.data ?? []) as any[]).filter((r) => r.check_kind === "aml" && r.harmonious_status === "approved").map((r) => r.person_id));
  const tp = (taxP.data ?? []) as any[];
  const commitments = new Set(((commit.data ?? []) as any[]).filter((e) => e.event_type === "original_commitment").map((e) => e.position_id));
  const sum = (t: string) => ((commit.data ?? []) as any[]).filter((e) => e.event_type === t).reduce((a, e) => a + Number(e.amount_cents || 0), 0);
  const entities = pos.filter((p) => p.capacity && !/individual/i.test(String(p.capacity)));
  const staffMap = pilotId ? await currentStaff(pilotId) : {};
  const eng = engagement.data;
  const staffAll: Partial<Record<PilotStaffRole, string | null>> = {
    primary_administrator: staffMap.primary_administrator ?? eng?.primary_administrator_user_id ?? null,
    accounting_lead: staffMap.accounting_lead ?? eng?.accounting_lead_user_id ?? null,
    relationship_lead: staffMap.relationship_lead ?? eng?.relationship_lead_user_id ?? null,
    ...Object.fromEntries(CONTROL_ROLES.map((r) => [r, staffMap[r] ?? null])),
  };
  const opening = pilotId ? await openingFor(pilotId) : { rows: [], latest: {} as Record<string, number> };
  const { data: exc } = pilotId
    ? await db().from("financial_pilot_variances").select("id").eq("pilot_id", pilotId).eq("kind", "migration_exception").eq("status", "open")
    : { data: [] };
  const investmentsCost = ((assets.data ?? []) as any[]).filter((a) => a.status !== "realized").reduce((t, a) => t + Number(a.cost_basis_cents || 0), 0);
  const harmonious = { tbDebits: ledger.tbDebits, tbCredits: ledger.tbCredits, cash: ledger.cash, investmentsCost, investorCapital: ledger.equity, commitments: sum("original_commitment"), called: sum("capital_call") };
  const openingRec = pilotId && Object.keys(opening.latest).length ? openingReconciliation(opening.latest, harmonious) : null;
  const rulesList = (rules.data ?? []) as any[];
  const facts: ReadinessFacts = {
    fundClassification: null,
    fiscalYearEndMonth: ledger.book?.fiscal_year_end_month ?? null,
    accountingBasis: ledger.book?.basis ?? null,
    chartOfAccounts: ledger.accounts,
    serviceEngagement: Boolean(eng),
    staff: staffAll,
    investors: pos.length,
    kycComplete: pos.filter((p) => p.person_id && okIdentity.has(p.person_id) && okAml.has(p.person_id)).length,
    kybRequired: entities.length,
    kybComplete: entities.filter((p) => p.person_id && okAml.has(p.person_id)).length,
    taxDocsComplete: users.filter((u) => tp.some((t) => t.investor_user_id === u && t.documentation_status === "approved")).length,
    w9: tp.filter((t) => /w9|w-9/i.test(String(t.documentation_form)) && t.documentation_status === "approved").length,
    w8: tp.filter((t) => /w8|w-8/i.test(String(t.documentation_form)) && t.documentation_status === "approved").length,
    taxReviewExceptions: tp.filter((t) => t.documentation_status && t.documentation_status !== "approved").length,
    commitmentsRecorded: pos.filter((p) => commitments.has(p.id)).length,
    ownershipBasisVerified: Boolean(openingRec && openingRec.checks.find((c) => c.metric === "Commitments")?.ok),
    payoutDestinationsRequired: 0,
    payoutDestinationsVerified: new Set(((instr.data ?? []) as any[]).map((i) => i.investor_user_id)).size,
    openingBalanceCategories: Object.keys(opening.latest),
    openingReconciled: Boolean(openingRec?.ties),
    openMigrationExceptions: (exc ?? []).length,
    bankAccounts: (banks.data ?? []).length,
    bankStatementAvailable: (snaps.data ?? []).length > 0,
    reconciliationConfigured: Boolean(ledger.book) && (banks.data ?? []).length > 0,
    paymentExecutionMethod: "Manual bank transfer outside Harmonious (official process remains authoritative)",
    bankDataSource: ((banks.data ?? []) as any[]).some((b) => b.item_id) ? "Bank feed" : (banks.data ?? []).length ? "Manual statements" : null,
    investmentPositions: (assets.data ?? []).length,
    investmentsCostLoaded: (assets.data ?? []).length > 0 && ((assets.data ?? []) as any[]).every((a) => a.cost_basis_cents != null),
    approvedWithholdingRules: rulesList.filter((r) => r.approved_by).length,
    withholdingRulesWithAdviserSource: rulesList.filter((r) => r.approved_by && r.policy_source && String(r.policy_source).trim().length > 0).length,
  };
  const { data: off } = await db().from("offerings").select("fund_type, entity_type").eq("id", offeringId).maybeSingle();
  facts.fundClassification = [off?.fund_type, off?.entity_type].filter(Boolean).join(" · ") || null;
  return { facts, opening: openingRec, harmonious };
}

export async function pilotReadiness(userId: string, offeringId: string) {
  await staff(userId);
  const { data: pilot } = await db().from("financial_pilots").select("*").eq("offering_id", offeringId).neq("status", "withdrawn").maybeSingle();
  const { facts, opening, harmonious } = await readinessFacts(offeringId, pilot?.id ?? null);
  const readiness = evaluateReadiness(facts);
  const [variances, signoffs, decisions, events, openingRows, materiality] = pilot
    ? await Promise.all([
        db().from("financial_pilot_variances").select("*").eq("pilot_id", pilot.id).order("created_at", { ascending: false }),
        db().from("financial_pilot_signoffs").select("role_key, user_id, created_at, note").eq("pilot_id", pilot.id),
        db().from("financial_pilot_decisions").select("*").eq("pilot_id", pilot.id).order("created_at", { ascending: false }),
        db().from("financial_pilot_events").select("event, from_status, to_status, created_at, actor_user_id").eq("pilot_id", pilot.id).order("created_at", { ascending: false }).limit(50),
        db().from("financial_pilot_opening_balances").select("category, label, official_cents, source_document, created_at, position_id").eq("pilot_id", pilot.id).order("created_at", { ascending: false }),
        db().from("financial_pilot_materiality").select("metric, tolerance_cents, created_at").eq("pilot_id", pilot.id).order("created_at", { ascending: false }),
      ]).then((r) => r.map((x: any) => x.data ?? []))
    : [[], [], [], [], [], []];
  return { pilot: pilot ?? null, readiness, facts, opening, harmonious, variances, signoffs, decisions, events, openingRows, materiality };
}

export async function transitionPilot(userId: string, input: { pilotId: string; to: PilotStatus; reason: string; periodLabel?: string | null | undefined; periodStart?: string | null | undefined; periodEnd?: string | null | undefined }) {
  await staff(userId);
  const p = await pilotRow(input.pilotId);
  if (input.to === "cutover_approved") fail("Cutover is recorded only through the cutover decision.");
  const err = pilotTransitionError(p.status as PilotStatus, input.to);
  if (err) fail(err);
  if (!input.reason || input.reason.trim().length < 5) fail("Give a reason for this step.");
  const patch: Record<string, unknown> = { status: input.to, updated_at: new Date().toISOString() };
  if (input.to === "selected") {
    const { data: other } = await db().from("financial_pilots").select("id").neq("id", p.id).not("status", "in", "(evaluating,withdrawn)").limit(1);
    if ((other ?? []).length) fail("Only one fund can be in the real-fund pilot at a time.");
  }
  if (input.to === "parallel_active") {
    const { facts } = await readinessFacts(p.offering_id, p.id);
    const r = evaluateReadiness(facts);
    if (r.level === "NOT_READY") fail(`NOT READY: ${r.items.filter((i) => i.critical && !i.ok).map((i) => i.label).join("; ")}`);
    if (!input.periodStart || !input.periodEnd) fail("Choose the parallel accounting period.");
    Object.assign(patch, { period_label: input.periodLabel ?? String(input.periodStart).slice(0, 7), period_start: input.periodStart, period_end: input.periodEnd });
  }
  if (input.to === "parallel_closed") {
    const key = String(p.period_label ?? "");
    const { data: sheet } = await db().from("close_sheets").select("id").eq("offering_id", p.offering_id).eq("kind", "month_end").eq("sheet_key", key).maybeSingle();
    const { data: dec } = sheet ? await db().from("close_sheet_decisions").select("decision").eq("sheet_id", sheet.id).eq("decision", "approved").limit(1) : { data: [] };
    if (!(dec ?? []).length) fail("The Harmonious month-end close sheet for the parallel period must be approved first.");
  }
  if (input.to === "parallel_passed") {
    const [{ data: s }, { data: v }] = await Promise.all([
      db().from("financial_pilot_signoffs").select("role_key").eq("pilot_id", p.id),
      db().from("financial_pilot_variances").select("structural").eq("pilot_id", p.id).eq("status", "open"),
    ]);
    const blockers = parallelPassBlockers({ signoffRoles: ((s ?? []) as any[]).map((x) => x.role_key), openVariances: (v ?? []).length, openStructural: ((v ?? []) as any[]).filter((x) => x.structural).length, closeApproved: true });
    if (blockers.length) fail(`Not passed: ${blockers.join("; ")}`);
  }
  await db().from("financial_pilots").update(patch).eq("id", p.id);
  await event({ pilotId: p.id, offeringId: p.offering_id, event: "pilot_status_changed", from: p.status, to: input.to, detail: { reason: input.reason }, actor: userId });
  return { ok: true };
}

/* ---------------- Opening data, variances, materiality ---------------- */

export async function addOpeningBalance(userId: string, input: { pilotId: string; category: string; label?: string | null | undefined; positionId?: string | null | undefined; officialCents: number; sourceDocument: string }) {
  await staff(userId);
  const p = await pilotRow(input.pilotId);
  if (!["selected", "opening_data"].includes(p.status)) fail("Opening balances are entered after the fund is selected and before the parallel period starts.");
  if (!input.sourceDocument || input.sourceDocument.trim().length < 3) fail("Reference the source document for this balance.");
  if (!Number.isInteger(input.officialCents)) fail("Enter the amount in whole cents.");
  await db().from("financial_pilot_opening_balances").insert({ pilot_id: p.id, category: input.category, label: input.label ?? null, position_id: input.positionId ?? null, official_cents: input.officialCents, source_document: input.sourceDocument.trim(), entered_by: userId });
  await event({ pilotId: p.id, offeringId: p.offering_id, event: "opening_balance_recorded", detail: { category: input.category }, actor: userId });
  return { ok: true };
}

export async function raiseVariance(userId: string, input: { pilotId: string; kind: "variance" | "migration_exception"; periodLabel: string; metric: string; positionId?: string | null | undefined; component?: string | null | undefined; officialCents: number; harmoniousCents: number; source: string; cause?: string | null | undefined; ownerUserId?: string | null | undefined }) {
  await staff(userId);
  const p = await pilotRow(input.pilotId);
  const { data: tol } = await db().from("financial_pilot_materiality").select("tolerance_cents").eq("pilot_id", p.id).eq("metric", input.metric).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db().from("financial_pilot_variances").insert({
    pilot_id: p.id,
    kind: input.kind,
    period_label: input.periodLabel,
    metric: input.metric,
    position_id: input.positionId ?? null,
    component: input.component ?? null,
    official_cents: input.officialCents,
    harmonious_cents: input.harmoniousCents,
    materiality_cents: isStructural(input.metric) ? 0 : Number(tol?.tolerance_cents ?? 0),
    structural: isStructural(input.metric),
    source: input.source,
    cause: input.cause ?? null,
    owner_user_id: input.ownerUserId ?? userId,
    raised_by: userId,
  }).select("id").single();
  if (error) fail(error.message);
  await event({ pilotId: p.id, offeringId: p.offering_id, event: `${input.kind}_raised`, detail: { metric: input.metric }, actor: userId });
  return { id: data.id as string };
}

export async function resolveVariance(userId: string, input: { varianceId: string; status: "resolved" | "accepted"; classification: string; resolution: string }) {
  await staff(userId);
  const { data: v } = await db().from("financial_pilot_variances").select("*").eq("id", input.varianceId).maybeSingle();
  if (!v) fail("Variance not found.");
  const err = varianceResolutionError(v, { reviewerId: userId, ...input });
  if (err) fail(err);
  await db().from("financial_pilot_variances").update({ status: input.status, classification: input.classification, resolution: input.resolution.trim(), reviewer_user_id: userId, resolved_at: new Date().toISOString() }).eq("id", v.id);
  const p = await pilotRow(v.pilot_id);
  await event({ pilotId: p.id, offeringId: p.offering_id, event: "variance_closed", detail: { status: input.status, classification: input.classification }, actor: userId });
  return { ok: true };
}

export async function setMateriality(userId: string, input: { pilotId: string; metric: string; toleranceCents: number }) {
  const roles = await staff(userId);
  if (!roles.some((r) => ["finance", "admin", "super_admin"].includes(r))) fail("Only Admin or Finance can set pilot tolerances.");
  if (isStructural(input.metric)) fail("Structural reconciliations must tie exactly; no tolerance can be set.");
  const p = await pilotRow(input.pilotId);
  await db().from("financial_pilot_materiality").insert({ pilot_id: p.id, metric: input.metric, tolerance_cents: Math.max(0, Math.round(input.toleranceCents)), set_by: userId });
  await event({ pilotId: p.id, offeringId: p.offering_id, event: "materiality_set", detail: { metric: input.metric, toleranceCents: input.toleranceCents }, actor: userId });
  return { ok: true };
}

/* ---------------- Sign-off & decision ---------------- */

export async function signOffPilot(userId: string, input: { pilotId: string; role: SignoffRole; confirmations: Record<string, boolean>; note?: string | null | undefined }) {
  const roles = await staff(userId);
  const p = await pilotRow(input.pilotId);
  if (p.status !== "parallel_closed") fail("Sign-off happens after the parallel close is complete.");
  const staffMap = await currentStaff(p.id);
  if (input.role === "accounting_lead" && staffMap.accounting_lead !== userId) fail("Only the pilot's assigned accounting lead can sign as accounting lead.");
  if (input.role === "finance_controller" && !roles.includes("finance")) fail("The finance/controller sign-off needs the Finance role.");
  if (input.role === "operations_admin" && !roles.some((r) => ["operations", "fund_administration", "admin"].includes(r))) fail("The operations/administrator sign-off needs an Operations role.");
  if (input.role === "leadership" && !roles.some((r) => ["super_admin", "executive"].includes(r))) fail("Leadership sign-off needs an executive or Super Admin.");
  const { data: existing } = await db().from("financial_pilot_signoffs").select("role_key, user_id").eq("pilot_id", p.id);
  const err = signoffError((existing ?? []) as any[], { role: input.role, userId, confirmations: input.confirmations });
  if (err) fail(err);
  await db().from("financial_pilot_signoffs").insert({ pilot_id: p.id, role_key: input.role, user_id: userId, confirmations: input.confirmations, note: input.note ?? null });
  await event({ pilotId: p.id, offeringId: p.offering_id, event: "pilot_signed_off", detail: { role: input.role }, actor: userId });
  return { ok: true };
}

export async function decidePilot(userId: string, input: { pilotId: string; decision: "continue_parallel" | "approve_production_cutover" | "requires_remediation"; reason: string }) {
  const roles = await staff(userId);
  const p = await pilotRow(input.pilotId);
  if (p.status !== "parallel_passed" && input.decision !== "requires_remediation") fail("A cutover decision is made only after the parallel pilot has passed.");
  if (input.decision === "approve_production_cutover" && !roles.some((r) => ["super_admin", "executive"].includes(r))) fail("Only leadership can approve a production cutover.");
  if (!input.reason || input.reason.trim().length < 10) fail("Give a reason for the decision.");
  const to = decisionTarget(input.decision);
  const err = pilotTransitionError(p.status as PilotStatus, to);
  if (err) fail(err);
  await db().from("financial_pilot_decisions").insert({ pilot_id: p.id, decision: input.decision, reason: input.reason.trim(), decided_by: userId });
  await db().from("financial_pilots").update({ status: to, updated_at: new Date().toISOString() }).eq("id", p.id);
  await event({ pilotId: p.id, offeringId: p.offering_id, event: "pilot_decision", from: p.status, to, detail: { decision: input.decision, note: "Recorded only; no automatic cutover." }, actor: userId });
  return { ok: true, status: to };
}
