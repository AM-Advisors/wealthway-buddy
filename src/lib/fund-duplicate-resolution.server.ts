/**
 * Fund Duplicate Review (server-only).
 *
 * Read paths never change state. Decisions and consolidation are Harmonious
 * administrator actions, re-checked here on every call. Consolidation runs in
 * one database transaction (consolidate_duplicate_fund); if any move fails the
 * whole call rolls back and the review is left in an explicit "failed" state.
 */
import {
  buildImpactReport, consolidationBlockers, detectConflicts, factualSummary, keepSeparateComplete, pairKey, resolveAlias,
  type ConflictKind, type Decision, type FundSnapshot, type PairFacts, type ReviewState,
} from "@/lib/fund-duplicate-resolution";
import { normalizeFundName } from "@/lib/fund-integrity";
import { requireStaff } from "@/lib/fund-integrity.server";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

async function requireAdmin(context: any): Promise<string> {
  await requireStaff(context);
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!(data ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin")) throw new Error("Forbidden: Harmonious administrators only.");
  return context.userId as string;
}

async function event(reviewId: string, name: string, actorId: string, detail: Record<string, unknown> = {}) {
  const db = await admin();
  await db.from("fund_duplicate_review_events").insert({ review_id: reviewId, event: name, actor_id: actorId, detail });
}

const count = async (q: any): Promise<number> => {
  try { const { count: n, error } = await q; return error ? 0 : n ?? 0; } catch { return 0; }
};

/* ------------------------------------------------------------ listing */

export async function listDuplicatePairs(context: any) {
  await requireStaff(context);
  const db = await admin();
  const { data: funds } = await db.from("offerings").select("id,name,legal_entity_name,created_at,consolidated_into").limit(5000);
  const groups = new Map<string, any[]>();
  for (const f of (funds ?? []) as any[]) {
    if (f.consolidated_into) continue;
    const k = normalizeFundName(f.name);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const { data: reviews } = await db.from("fund_duplicate_reviews").select("*").order("created_at", { ascending: false });
  const byKey = new Map(((reviews ?? []) as any[]).map((r) => [r.pair_key, r]));
  const pairs = [...groups.values()].filter((l) => l.length > 1).map((list) => {
    const ids = list.map((f) => f.id);
    const r = byKey.get(pairKey(ids));
    return { key: pairKey(ids), name: list[0].name, funds: list.map((f) => ({ id: f.id, name: f.name, createdAt: f.created_at })), review: r ? publicReview(r) : null };
  });
  const liveKeys = new Set(pairs.map((p) => p.key));
  const closed = ((reviews ?? []) as any[]).filter((r) => !liveKeys.has(r.pair_key)).map(publicReview);
  return { pairs, resolved: closed };
}

function publicReview(r: any) {
  return {
    id: r.id, pairKey: r.pair_key, fundIds: r.fund_ids, status: r.status, decision: r.decision, canonicalId: r.canonical_id,
    duplicateId: r.duplicate_id, acknowledged: r.acknowledged_conflicts ?? [], note: r.note, failureMessage: r.failure_message,
    decidedAt: r.decided_at, consolidatedAt: r.consolidated_at, version: r.version,
  };
}

/* ----------------------------------------------------------- snapshots */

async function snapshot(id: string): Promise<{ snap: FundSnapshot; secret: { ein: string | null; bankFingerprint: string | null } }> {
  const db = await admin();
  const { data: o } = await db.from("offerings").select("*").eq("id", id).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  const { data: setup } = await db.from("fund_setups").select("id,created_by").eq("offering_id", id).order("created_at").limit(1).maybeSingle();
  const [client, formation, banking, instr, reg, econ, mgrs, invs, deps] = await Promise.all([
    o.client_id ? db.from("clients").select("name,legal_name").eq("id", o.client_id).maybeSingle() : { data: null },
    setup ? db.from("fund_entity_formation").select("jurisdiction,step,ein_received_at,ein_letter_document_id,entity_identifiers").eq("setup_id", setup.id).maybeSingle() : { data: null },
    setup ? db.from("fund_banking_setups").select("status").eq("setup_id", setup.id).maybeSingle() : { data: null },
    db.from("funding_instruction_versions").select("version,release_status,fingerprint,superseded_at,revoked_at").eq("offering_id", id).order("version", { ascending: false }).limit(5),
    setup ? db.from("fund_regulatory_configs").select("id", { count: "exact", head: true }).eq("setup_id", setup.id) : { count: 0 },
    setup ? db.from("fund_economics_versions").select("id", { count: "exact", head: true }).eq("setup_id", setup.id) : { count: 0 },
    db.from("fund_managers").select("user_id").eq("offering_id", id),
    db.from("investor_onboardings").select("id,person_id,investment_profile_id,stage,funding_status,removed_at,commitment_amount_cents,accepted_amount_cents,requested_amount_cents,funded_amount_cents,signature_id,executed_snapshot").eq("offering_id", id).limit(5000),
    db.rpc("fund_dependency_counts", { _offering: id }),
  ]);
  const investments = ((invs.data ?? []) as any[]);
  const current = ((instr.data ?? []) as any[]).find((v) => !v.superseded_at && !v.revoked_at) ?? null;
  const dependencies = ((deps.data ?? []) as any[]).map((d) => ({ table: d.table_name, column: d.column_name, count: Number(d.row_count), preserved: !!d.preserved }));
  const sumDeps = (re: RegExp) => dependencies.filter((d) => re.test(d.table)).reduce((n, d) => n + d.count, 0);
  const ein = (formation.data?.entity_identifiers as any)?.ein ?? null;
  const live = investments.filter((i) => !i.removed_at);
  const [offeringDocuments, versions, historical, readinessRecords, workItems, driveFolders] = await Promise.all([
    count(db.from("offering_documents").select("id", { count: "exact", head: true }).eq("offering_id", id)),
    count(db.from("offering_document_versions").select("id", { count: "exact", head: true }).eq("offering_id", id)),
    count(db.from("drive_imported_documents").select("id", { count: "exact", head: true }).eq("offering_id", id)),
    count(db.from("investment_readiness_events").select("id", { count: "exact", head: true }).eq("offering_id", id)),
    count(db.from("investment_readiness_tasks").select("id", { count: "exact", head: true }).eq("offering_id", id).is("resolved_at", null)),
    count(db.from("drive_folder_mappings").select("id", { count: "exact", head: true }).eq("offering_id", id)),
  ]);
  const snap: FundSnapshot = {
    id, name: o.name, legalName: o.legal_entity_name, clientId: o.client_id,
    clientName: client.data?.name ?? client.data?.legal_name ?? null, fundType: o.fund_type, createdAt: o.created_at,
    createdBy: setup?.created_by ?? null, status: o.consolidated_into ? "consolidated" : o.is_open ? "open" : "closed",
    entity: {
      entityType: o.entity_type, jurisdiction: formation.data?.jurisdiction ?? o.state_formed, dateFormed: o.date_formed,
      einOnFile: !!ein || !!formation.data?.ein_received_at, einLetterOnFile: !!formation.data?.ein_letter_document_id, formationStep: formation.data?.step ?? null,
    },
    investors: {
      persons: new Set(investments.map((i) => i.person_id).filter(Boolean)).size,
      investments: investments.length, active: live.length, removed: investments.length - live.length,
      funded: investments.filter((i) => i.funding_status === "funded").length,
      closed: investments.filter((i) => i.stage === "closed").length,
    },
    capital: {
      subscribedCents: live.reduce((n, i) => n + Number(i.accepted_amount_cents ?? i.commitment_amount_cents ?? i.requested_amount_cents ?? 0), 0),
      // Reconciled only — an investor-reported or "sent" wire never counts.
      reconciledFundedCents: investments.filter((i) => i.funding_status === "funded").reduce((n, i) => n + Number(i.funded_amount_cents ?? 0), 0),
    },
    documents: { offeringDocuments, versions, executed: investments.filter((i) => i.signature_id || i.executed_snapshot).length, historical },
    banking: { exists: !!current || (!!banking.data && banking.data.status && banking.data.status !== "not_started"), currentVersion: current?.version ?? null, verification: current?.release_status ?? banking.data?.status ?? null },
    operations: {
      readinessRecords, workItems, regulatoryConfig: (reg.count ?? 0) > 0,
      formD: o.form_d_responsibility, blueSky: o.blue_sky_responsibility, taxClassification: o.tax_classification,
    },
    external: {
      driveFolders,
      eSignReferences: sumDeps(/signature/),
      providerReferences: sumDeps(/provider|webhook|didit|box|bank_transactions/),
      integrationEvents: sumDeps(/_events$/),
    },
    managers: ((mgrs.data ?? []) as any[]).map((m) => m.user_id),
    economicsVersions: econ.count ?? 0,
    investments: investments.map((i) => ({ onboardingId: i.id, personId: i.person_id, profileId: i.investment_profile_id, stage: i.stage, removed: !!i.removed_at })),
    dependencies,
  };
  return { snap, secret: { ein: ein ? String(ein).replace(/\D/g, "") : null, bankFingerprint: current?.fingerprint ?? null } };
}

async function compare(ids: [string, string]) {
  const [a, b] = await Promise.all(ids.map(snapshot));
  const facts: PairFacts = {
    einDiffers: !!a!.secret.ein && !!b!.secret.ein && a!.secret.ein !== b!.secret.ein,
    bankingDiffers: !!a!.secret.bankFingerprint && !!b!.secret.bankFingerprint && a!.secret.bankFingerprint !== b!.secret.bankFingerprint,
  };
  return { a: a!.snap, b: b!.snap, facts };
}

export async function getComparison(context: any, fundIds: string[]) {
  await requireStaff(context);
  if (fundIds.length !== 2) throw new Error("Choose exactly two Funds.");
  const { a, b, facts } = await compare([fundIds[0]!, fundIds[1]!]);
  if (normalizeFundName(a.name) !== normalizeFundName(b.name) && !(await reviewFor(fundIds))) throw new Error("These Funds are not a duplicate pair.");
  return {
    funds: [a, b], conflicts: detectConflicts(a, b, facts),
    facts: [factualSummary(a, "Record A"), factualSummary(b, "Record B")],
    review: (await reviewFor(fundIds)) ?? null,
  };
}

async function reviewFor(fundIds: string[]) {
  const db = await admin();
  const { data } = await db.from("fund_duplicate_reviews").select("*").eq("pair_key", pairKey(fundIds)).maybeSingle();
  return data ? publicReview(data) : null;
}

/* ----------------------------------------------------------- decisions */

export async function decidePair(context: any, input: { fundIds: string[]; decision: Decision; canonicalId?: string | null; note?: string | null; acknowledged?: ConflictKind[] }) {
  const actor = await requireAdmin(context);
  const db = await admin();
  if (input.fundIds.length !== 2) throw new Error("Choose exactly two Funds.");
  const existing = await reviewFor(input.fundIds);
  if (existing?.status === "consolidated") throw new Error("This pair has already been consolidated.");
  if (input.decision === "same_fund" && (!input.canonicalId || !input.fundIds.includes(input.canonicalId))) throw new Error("Select the Canonical Fund explicitly.");
  const { data: funds } = await db.from("offerings").select("id,name").in("id", input.fundIds);
  const [fa, fb] = (funds ?? []) as any[];
  const status = input.decision === "same_fund" ? "consolidation_pending"
    : input.decision === "needs_review" ? "needs_review"
    : fa && fb && keepSeparateComplete(fa, fb) ? "resolved_separate" : "keep_separate_pending_rename";
  const row = {
    pair_key: pairKey(input.fundIds), fund_ids: [...input.fundIds].sort(), decision: input.decision, status,
    canonical_id: input.decision === "same_fund" ? input.canonicalId : null,
    duplicate_id: input.decision === "same_fund" ? input.fundIds.find((i) => i !== input.canonicalId) : null,
    acknowledged_conflicts: input.acknowledged ?? [], note: input.note ?? null, decided_by: actor, decided_at: new Date().toISOString(),
    failure_message: null, updated_at: new Date().toISOString(),
  };
  let id = existing?.id as string | undefined;
  if (id) {
    const { error } = await db.from("fund_duplicate_reviews").update({ ...row, version: (existing!.version ?? 1) + 1 }).eq("id", id).eq("version", existing!.version);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db.from("fund_duplicate_reviews").insert(row).select("id").single();
    if (error) throw new Error(error.message.includes("duplicate") ? "Another reviewer just recorded a decision. Reload and try again." : error.message);
    id = data.id;
  }
  await event(id!, `decision_${input.decision}`, actor, { canonical: row.canonical_id, acknowledged: row.acknowledged_conflicts });
  return reviewFor(input.fundIds);
}

/** Different Funds — completes once a rename (via the audited rename flow) makes the names unique. */
export async function completeKeepSeparate(context: any, reviewId: string) {
  const actor = await requireAdmin(context);
  const db = await admin();
  const { data: r } = await db.from("fund_duplicate_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!r || r.decision !== "different_funds") throw new Error("This review is not marked Different Funds.");
  const { data: funds } = await db.from("offerings").select("id,name").in("id", r.fund_ids);
  const [a, b] = (funds ?? []) as any[];
  if (!a || !b || !keepSeparateComplete(a, b)) throw new Error("Rename one of the Funds to a genuinely unique name first. Its Legal Name stays unchanged.");
  await db.from("fund_duplicate_reviews").update({ status: "resolved_separate", version: r.version + 1, updated_at: new Date().toISOString() }).eq("id", reviewId).eq("version", r.version);
  await event(reviewId, "resolved_separate", actor);
  return { ok: true };
}

export async function previewConsolidation(context: any, reviewId: string) {
  await requireAdmin(context);
  const db = await admin();
  const { data: r } = await db.from("fund_duplicate_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!r || r.decision !== "same_fund" || !r.canonical_id || !r.duplicate_id) throw new Error("Record a Same Fund decision with a Canonical Fund first.");
  const [c, d] = await Promise.all([snapshot(r.canonical_id), snapshot(r.duplicate_id)]);
  const facts: PairFacts = {
    einDiffers: !!c.secret.ein && !!d.secret.ein && c.secret.ein !== d.secret.ein,
    bankingDiffers: !!c.secret.bankFingerprint && !!d.secret.bankFingerprint && c.secret.bankFingerprint !== d.secret.bankFingerprint,
  };
  const report = buildImpactReport(c.snap, d.snap, facts);
  const state: ReviewState = { status: r.status, decision: r.decision, canonicalId: r.canonical_id, duplicateId: r.duplicate_id, acknowledged: r.acknowledged_conflicts ?? [], fundIds: r.fund_ids };
  const blockers = consolidationBlockers(state, report, { canonicalId: r.canonical_id, duplicateId: r.duplicate_id, confirmed: true, reason: "preview" });
  return { report, blockers, review: publicReview(r) };
}

export async function confirmConsolidation(context: any, input: { reviewId: string; canonicalId: string; duplicateId: string; reason: string; confirmed: boolean; version: number }) {
  const actor = await requireAdmin(context);
  const db = await admin();
  const { data: r } = await db.from("fund_duplicate_reviews").select("*").eq("id", input.reviewId).maybeSingle();
  if (!r) throw new Error("Review not found.");
  const { report } = await previewConsolidation(context, input.reviewId);
  const state: ReviewState = { status: r.status, decision: r.decision, canonicalId: r.canonical_id, duplicateId: r.duplicate_id, acknowledged: r.acknowledged_conflicts ?? [], fundIds: r.fund_ids };
  const blockers = consolidationBlockers(state, report, input);
  if (blockers.length) throw new Error(blockers[0]);
  const { data, error } = await db.rpc("consolidate_duplicate_fund", {
    _review: input.reviewId, _canonical: input.canonicalId, _duplicate: input.duplicateId, _actor: actor, _reason: input.reason.trim(), _expected_version: input.version,
  });
  if (error) {
    // The transaction rolled back; nothing moved. Record a recoverable failure.
    const msg = /stale_review|already_consolidated/.test(error.message) ? "Another reviewer changed this pair. Reload and review again." : "Consolidation could not complete and was fully rolled back. No records moved.";
    await db.from("fund_duplicate_reviews").update({ status: "failed", failure_message: msg, updated_at: new Date().toISOString() }).eq("id", input.reviewId).neq("status", "consolidated");
    await event(input.reviewId, "consolidation_failed", actor, { code: String(error.code ?? ""), category: /stale|already/.test(error.message) ? "concurrency" : "move_failed" });
    throw new Error(msg);
  }
  return { ok: true, moved: (data as any)?.moved ?? 0 };
}

/* --------------------------------------------------------------- alias */

/** Resolve a retired Fund ID to its canonical Fund. Authorization is still checked on the canonical Fund by the caller. */
export async function resolveFundAlias(id: string): Promise<string> {
  const db = await admin();
  const { data } = await db.from("fund_aliases").select("old_offering_id,canonical_offering_id").limit(5000);
  const map = new Map<string, string>(((data ?? []) as any[]).map((a) => [a.old_offering_id, a.canonical_offering_id]));
  return resolveAlias(id, map);
}
