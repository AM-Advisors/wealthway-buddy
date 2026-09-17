/**
 * Server-only portfolio valuation governance.
 *
 * Nothing here trusts an asset, fund or valuation id from the browser: every
 * record is re-read server-side and the caller is authorised against the fund
 * the record actually belongs to. Fund managers propose and acknowledge;
 * Harmonious approves and makes effective. Approved valuations only *prepare*
 * a journal — posting still runs through the existing accounting workflow.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewerScope, assertScopeAllows, type ReviewerScope } from "@/lib/reviewer-authz.server";
import { draftJournalEntry, ledgerBookForOffering } from "@/lib/accounting.server";
import { raiseException } from "@/lib/reconciliation.server";
import {
  DEFAULT_VALUATION_POLICY,
  canTransitionValuation,
  isImmutable,
  managerMay,
  portfolioAsOf,
  rankSources,
  realization,
  realizationJournal,
  unrealizedJournal,
  valuationAsOf,
  valuationChange,
  valuationExceptions,
  type PortfolioAssetClass,
  type ValuationAction,
  type ValuationMethod,
  type ValuationPolicy,
  type ValuationRecord,
  type ValuationSourceType,
  type ValuationStatus,
} from "@/lib/valuation-model";
import type { DraftLine } from "@/lib/accounting-model";

const db = () => supabaseAdmin as any;

function fail(message: string): never {
  throw new Error(message);
}

const today = () => new Date().toISOString().slice(0, 10);

async function assertHarmonious(userId: string) {
  const scope = await reviewerScope(userId);
  if (!scope.isAdmin) fail("Forbidden: Harmonious valuation authority required.");
  return scope;
}

async function recordEvent(entry: {
  valuationId?: string | null;
  assetId?: string | null;
  offeringId?: string | null;
  actorUserId: string;
  actorRole: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  previous?: unknown;
  next?: unknown;
}) {
  await db().from("valuation_events").insert({
    valuation_id: entry.valuationId ?? null,
    asset_id: entry.assetId ?? null,
    offering_id: entry.offeringId ?? null,
    actor_user_id: entry.actorUserId,
    actor_role: entry.actorRole,
    action: entry.action,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    reason: entry.reason ?? null,
    previous_value: entry.previous ?? null,
    new_value: entry.next ?? null,
  });
}

// ------------------------------------------------------------------ policy

export async function policyFor(
  offeringId: string | null,
  assetClass: PortfolioAssetClass | null,
): Promise<ValuationPolicy> {
  if (!offeringId) return DEFAULT_VALUATION_POLICY;
  const { data } = await db()
    .from("valuation_policies")
    .select("*")
    .eq("offering_id", offeringId)
    .eq("is_active", true);
  const rows = (data ?? []) as any[];
  // The most specific active policy wins: asset class beats fund-wide.
  const row =
    rows.find((r) => assetClass && r.asset_class === assetClass) ??
    rows.find((r) => !r.asset_class) ??
    null;
  if (!row) return DEFAULT_VALUATION_POLICY;
  return {
    sourcePriority: Array.isArray(row.source_priority)
      ? (row.source_priority as ValuationSourceType[])
      : DEFAULT_VALUATION_POLICY.sourcePriority,
    stalenessDays: Number(row.staleness_days),
    increaseThresholdPct: Number(row.increase_threshold_pct),
    decreaseThresholdPct: Number(row.decrease_threshold_pct),
    materialChangeCents: Number(row.material_change_cents),
    evidenceRequired: Boolean(row.evidence_required),
    managerMayApprove: Boolean(row.manager_may_approve),
    managerReviewRequired: Boolean(row.manager_review_required),
    unrealizedPolicyEnabled: Boolean(row.unrealized_policy_enabled),
    investmentAccountCode: row.investment_account_code,
    unrealizedAccountCode: row.unrealized_account_code,
    realizedAccountCode: row.realized_account_code,
    costAccountCode: row.cost_account_code,
    cashAccountCode: row.cash_account_code,
  };
}

export async function saveValuationPolicy(
  userId: string,
  input: {
    offeringId: string;
    assetClass?: PortfolioAssetClass | null;
    stalenessDays?: number;
    increaseThresholdPct?: number;
    decreaseThresholdPct?: number;
    materialChangeCents?: number;
    evidenceRequired?: boolean;
    managerMayApprove?: boolean;
    managerReviewRequired?: boolean;
    unrealizedPolicyEnabled?: boolean;
    sourcePriority?: ValuationSourceType[];
  },
) {
  await assertHarmonious(userId);
  const book = await ledgerBookForOffering(userId, input.offeringId);
  const { data: existing } = await db()
    .from("valuation_policies")
    .select("id, version")
    .eq("offering_id", input.offeringId)
    .eq("is_active", true)
    .is("asset_class", input.assetClass ?? null)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    book_id: (book as any).id,
    offering_id: input.offeringId,
    asset_class: input.assetClass ?? null,
    version: existing ? Number((existing as any).version) + 1 : 1,
    supersedes_id: existing ? (existing as any).id : null,
    created_by: userId,
    is_active: true,
  };
  const optional: Record<string, unknown> = {
    staleness_days: input.stalenessDays,
    increase_threshold_pct: input.increaseThresholdPct,
    decrease_threshold_pct: input.decreaseThresholdPct,
    material_change_cents: input.materialChangeCents,
    evidence_required: input.evidenceRequired,
    manager_may_approve: input.managerMayApprove,
    manager_review_required: input.managerReviewRequired,
    unrealized_policy_enabled: input.unrealizedPolicyEnabled,
    source_priority: input.sourcePriority,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) payload[key] = value;
  }

  if (existing) {
    await db().from("valuation_policies").update({ is_active: false }).eq("id", (existing as any).id);
  }
  const { data, error } = await db().from("valuation_policies").insert(payload).select().single();
  if (error) fail(error.message);
  return data;
}

// ------------------------------------------------------------------ assets

type AssetRow = {
  id: string;
  book_id: string;
  offering_id: string | null;
  asset_class: PortfolioAssetClass;
  quantity: number | null;
  cost_basis_cents: number;
  status: string;
  asset_name: string;
  issuer_name: string;
  realized_cost_basis_cents: number;
};

/** Resolve the asset from the database and authorise against its real fund. */
async function authorizeAsset(userId: string, assetId: string) {
  const scope = await reviewerScope(userId);
  const { data, error } = await db()
    .from("portfolio_assets")
    .select("*")
    .eq("id", assetId)
    .maybeSingle();
  if (error) fail(error.message);
  if (!data) fail("Asset not found.");
  const asset = data as AssetRow;
  assertScopeAllows(scope, asset.offering_id);
  return { scope, asset };
}

async function authorizeValuation(userId: string, valuationId: string) {
  const scope = await reviewerScope(userId);
  const { data, error } = await db()
    .from("portfolio_valuations")
    .select("*")
    .eq("id", valuationId)
    .maybeSingle();
  if (error) fail(error.message);
  if (!data) fail("Valuation not found.");
  const valuation = data as any;
  assertScopeAllows(scope, valuation.offering_id);
  const { data: asset } = await db()
    .from("portfolio_assets")
    .select("*")
    .eq("id", valuation.asset_id)
    .maybeSingle();
  if (!asset) fail("Asset not found.");
  // The valuation's own fund must still match the asset's fund.
  assertScopeAllows(scope, (asset as AssetRow).offering_id);
  return { scope, valuation, asset: asset as AssetRow };
}

export async function upsertPortfolioAsset(
  userId: string,
  input: {
    id?: string;
    offeringId: string;
    issuerName: string;
    assetName: string;
    assetClass: PortfolioAssetClass;
    instrument?: string | null;
    ctCompanyId?: string | null;
    ctSecurityId?: string | null;
    quantity?: number | null;
    ownershipPct?: number | null;
    acquisitionDate?: string | null;
    costBasisCents?: number;
    currency?: string;
    note?: string | null;
  },
) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, input.offeringId);
  if (!scope.isAdmin) fail("Only Harmonious can add or change portfolio assets.");
  const book = await ledgerBookForOffering(userId, input.offeringId);

  const payload = {
    book_id: (book as any).id,
    offering_id: input.offeringId,
    issuer_name: input.issuerName,
    asset_name: input.assetName,
    asset_class: input.assetClass,
    instrument: input.instrument ?? null,
    ct_company_id: input.ctCompanyId ?? null,
    ct_security_id: input.ctSecurityId ?? null,
    quantity: input.quantity ?? null,
    ownership_pct: input.ownershipPct ?? null,
    acquisition_date: input.acquisitionDate ?? null,
    cost_basis_cents: input.costBasisCents ?? 0,
    currency: input.currency ?? "USD",
    note: input.note ?? null,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { asset } = await authorizeAsset(userId, input.id);
    const { data, error } = await db()
      .from("portfolio_assets")
      .update(payload)
      .eq("id", asset.id)
      .select()
      .single();
    if (error) fail(error.message);
    await recordEvent({
      assetId: asset.id,
      offeringId: input.offeringId,
      actorUserId: userId,
      actorRole: "harmonious",
      action: "asset_updated",
      previous: asset,
      next: data,
    });
    return data;
  }

  const { data, error } = await db().from("portfolio_assets").insert(payload).select().single();
  if (error) fail(error.message);
  await recordEvent({
    assetId: (data as any).id,
    offeringId: input.offeringId,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "asset_created",
    next: data,
  });
  return data;
}

export async function listPortfolioAssets(userId: string, offeringId?: string) {
  const scope = await reviewerScope(userId);
  let query = db().from("portfolio_assets").select("*").order("issuer_name");
  if (offeringId) {
    assertScopeAllows(scope, offeringId);
    query = query.eq("offering_id", offeringId);
  } else if (!scope.isAdmin) {
    query = query.in("offering_id", scope.offeringIds);
  }
  const { data, error } = await query;
  if (error) fail(error.message);
  return (data ?? []) as any[];
}

// -------------------------------------------------------------- valuations

/** The last valuation whose movement has already been recognised in the GL. */
async function lastRecognizedValue(assetId: string): Promise<number | null> {
  const { data } = await db()
    .from("portfolio_valuations")
    .select("value_cents, effective_date, version")
    .eq("asset_id", assetId)
    .in("status", ["effective", "superseded"])
    .not("journal_entry_id", "is", null)
    .order("effective_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as any[])[0];
  return row ? Number(row.value_cents) : null;
}

async function currentEffective(assetId: string) {
  const { data } = await db()
    .from("portfolio_valuations")
    .select("*")
    .eq("asset_id", assetId)
    .eq("status", "effective")
    .order("effective_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(1);
  return ((data ?? []) as any[])[0] ?? null;
}

async function nextVersion(assetId: string) {
  const { data } = await db()
    .from("portfolio_valuations")
    .select("version")
    .eq("asset_id", assetId)
    .order("version", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as any[])[0];
  return row ? Number(row.version) + 1 : 1;
}

/**
 * Propose a new valuation version. Harmonious and the fund's own managers may
 * both prepare one; neither act makes it effective.
 */
export async function proposeValuation(
  userId: string,
  input: {
    assetId: string;
    valuationDate: string;
    effectiveDate: string;
    valueCents: number;
    pricePerUnitCents?: number | null;
    quantity?: number | null;
    methodology: ValuationMethod;
    methodologyNote?: string | null;
    sourceType: ValuationSourceType;
    source?: string | null;
    sourceDate?: string | null;
    inputs?: Record<string, unknown>;
    assumptions?: string | null;
    note?: string | null;
    otherSources?: { sourceType: ValuationSourceType; valueCents: number; sourceDate?: string }[];
  },
) {
  const { scope, asset } = await authorizeAsset(userId, input.assetId);
  if (asset.status === "realized") fail("This position is fully realised and cannot be re-marked.");
  const policy = await policyFor(asset.offering_id, asset.asset_class);
  const prior = await currentEffective(asset.id);
  const priorValue = prior ? Number(prior.value_cents) : null;
  const { changeCents, changePct } = valuationChange(priorValue, input.valueCents);

  const candidates = [
    { sourceType: input.sourceType, valueCents: input.valueCents, sourceDate: input.sourceDate ?? null },
    ...(input.otherSources ?? []),
  ];
  const ranked = rankSources(candidates, policy.sourcePriority);

  const version = await nextVersion(asset.id);
  const { data, error } = await db()
    .from("portfolio_valuations")
    .insert({
      asset_id: asset.id,
      book_id: asset.book_id,
      offering_id: asset.offering_id,
      version,
      status: "draft",
      valuation_date: input.valuationDate,
      effective_date: input.effectiveDate,
      value_cents: input.valueCents,
      price_per_unit_cents: input.pricePerUnitCents ?? null,
      quantity: input.quantity ?? asset.quantity,
      cost_basis_cents: asset.cost_basis_cents,
      methodology: input.methodology,
      methodology_note: input.methodologyNote ?? null,
      source_type: input.sourceType,
      source: input.source ?? null,
      source_date: input.sourceDate ?? null,
      inputs: input.inputs ?? {},
      assumptions: input.assumptions ?? null,
      conflicts: ranked.conflicts,
      prior_valuation_id: prior?.id ?? null,
      change_cents: changeCents,
      change_pct: changePct,
      prepared_by: userId,
      prepared_by_role: scope.isAdmin ? "harmonious" : "fund_manager",
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) fail(error.message);

  await recordEvent({
    valuationId: (data as any).id,
    assetId: asset.id,
    offeringId: asset.offering_id,
    actorUserId: userId,
    actorRole: scope.isAdmin ? "harmonious" : "fund_manager",
    action: "valuation_proposed",
    toStatus: "draft",
    next: data,
  });
  return data;
}

export async function addValuationEvidence(
  userId: string,
  input: {
    valuationId: string;
    kind: string;
    title: string;
    storagePath?: string | null;
    contentHash?: string | null;
    structured?: Record<string, unknown>;
  },
) {
  const { valuation, asset } = await authorizeValuation(userId, input.valuationId);
  if (isImmutable(valuation.status as ValuationStatus)) {
    fail("That valuation is complete; record a new version to attach new evidence.");
  }
  const { data, error } = await db()
    .from("valuation_evidence")
    .insert({
      valuation_id: valuation.id,
      asset_id: asset.id,
      offering_id: asset.offering_id,
      kind: input.kind,
      title: input.title,
      storage_path: input.storagePath ?? null,
      content_hash: input.contentHash ?? null,
      structured: input.structured ?? {},
      uploaded_by: userId,
    })
    .select()
    .single();
  if (error) fail(error.message);
  await recordEvent({
    valuationId: valuation.id,
    assetId: asset.id,
    offeringId: asset.offering_id,
    actorUserId: userId,
    actorRole: "actor",
    action: "evidence_added",
    next: { id: (data as any).id, kind: input.kind, title: input.title },
  });
  return data;
}

/** A short-lived authorised link. The bucket itself is unreadable by sessions. */
export async function evidenceLink(userId: string, evidenceId: string) {
  const scope = await reviewerScope(userId);
  const { data } = await db()
    .from("valuation_evidence")
    .select("*")
    .eq("id", evidenceId)
    .maybeSingle();
  if (!data) fail("Evidence not found.");
  assertScopeAllows(scope, (data as any).offering_id);
  if (!(data as any).storage_path) fail("That evidence has no file attached.");
  const { data: signed, error } = await supabaseAdmin.storage
    .from((data as any).storage_bucket)
    .createSignedUrl((data as any).storage_path, 60);
  if (error) fail(error.message);
  await recordEvent({
    valuationId: (data as any).valuation_id,
    assetId: (data as any).asset_id,
    offeringId: (data as any).offering_id,
    actorUserId: userId,
    actorRole: scope.isAdmin ? "harmonious" : "fund_manager",
    action: "evidence_viewed",
  });
  return { url: signed?.signedUrl ?? null };
}

async function evidenceCount(valuationId: string) {
  const { count } = await db()
    .from("valuation_evidence")
    .select("id", { count: "exact", head: true })
    .eq("valuation_id", valuationId);
  return count ?? 0;
}

/** Run every configured check and open exceptions for what is wrong. */
export async function checkValuation(userId: string, valuationId: string) {
  const { valuation, asset } = await authorizeValuation(userId, valuationId);
  const policy = await policyFor(asset.offering_id, asset.asset_class);
  const prior = await currentEffective(asset.id);
  const kinds = valuationExceptions(
    {
      valueCents: Number(valuation.value_cents),
      priorValueCents: prior ? Number(prior.value_cents) : null,
      quantity: valuation.quantity,
      costBasisCents: valuation.cost_basis_cents,
      methodology: valuation.methodology,
      sourceType: valuation.source_type,
      source: valuation.source,
      sourceDate: valuation.source_date,
      valuationDate: valuation.valuation_date,
      inputs: valuation.inputs,
      evidenceCount: await evidenceCount(valuation.id),
      conflicts: Array.isArray(valuation.conflicts) ? valuation.conflicts : [],
      assetClass: asset.asset_class,
    },
    policy,
    today(),
  );
  for (const kind of kinds) {
    await raiseException({
      kind: kind as any,
      offeringId: asset.offering_id,
      bookId: asset.book_id,
      detail: `${asset.issuer_name} — ${asset.asset_name}`,
      context: { valuation_id: valuation.id, asset_id: asset.id },
      openedBy: userId,
    });
  }
  return { exceptions: kinds };
}

export async function submitValuation(userId: string, valuationId: string) {
  const { scope, valuation, asset } = await authorizeValuation(userId, valuationId);
  if (!canTransitionValuation(valuation.status as ValuationStatus, "review")) {
    fail("That valuation cannot be sent for review from its current state.");
  }
  await db()
    .from("portfolio_valuations")
    .update({ status: "review", updated_at: new Date().toISOString() })
    .eq("id", valuation.id);
  await recordEvent({
    valuationId: valuation.id,
    assetId: asset.id,
    offeringId: asset.offering_id,
    actorUserId: userId,
    actorRole: scope.isAdmin ? "harmonious" : "fund_manager",
    action: "valuation_submitted",
    fromStatus: valuation.status,
    toStatus: "review",
  });
  await checkValuation(userId, valuation.id);
  return { ok: true };
}

/**
 * Harmonious decides. A fund manager only reaches `approve` when the fund's
 * own workflow explicitly grants it, and can never return, reject, make
 * effective or supersede.
 */
export async function decideValuation(
  userId: string,
  input: {
    valuationId: string;
    action: Extract<ValuationAction, "approve" | "return" | "reject" | "make_effective">;
    reason?: string;
  },
) {
  const { scope, valuation, asset } = await authorizeValuation(userId, input.valuationId);
  const policy = await policyFor(asset.offering_id, asset.asset_class);
  if (!scope.isAdmin && !managerMay(input.action, policy)) {
    fail("Forbidden: only Harmonious can take that valuation decision.");
  }

  const from = valuation.status as ValuationStatus;
  const to: ValuationStatus =
    input.action === "approve"
      ? "approved"
      : input.action === "return"
        ? "returned"
        : input.action === "reject"
          ? "rejected"
          : "effective";
  if (!canTransitionValuation(from, to)) {
    fail(`A ${from} valuation cannot become ${to}.`);
  }
  if ((input.action === "return" || input.action === "reject") && (input.reason ?? "").trim().length < 4) {
    fail("Say why this valuation is being returned or rejected.");
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "approved") {
    patch["approved_by"] = userId;
    patch["approved_at"] = now;
    patch["reviewed_by"] = userId;
    patch["reviewed_at"] = now;
  }
  if (to === "effective") {
    patch["effective_at"] = now;
    // Superseding the previous effective mark is part of becoming effective:
    // the old values and evidence are preserved, never rewritten.
    const prior = await currentEffective(asset.id);
    if (prior && prior.id !== valuation.id) {
      const { error: supersedeError } = await db()
        .from("portfolio_valuations")
        .update({ status: "superseded", superseded_by_id: valuation.id })
        .eq("id", prior.id);
      if (supersedeError) fail(supersedeError.message);
      patch["supersedes_id"] = prior.id;
      await recordEvent({
        valuationId: prior.id,
        assetId: asset.id,
        offeringId: asset.offering_id,
        actorUserId: userId,
        actorRole: "harmonious",
        action: "valuation_superseded",
        fromStatus: "effective",
        toStatus: "superseded",
      });
    }
  }
  if (input.reason) patch["decision_reason"] = input.reason;

  const { error } = await db().from("portfolio_valuations").update(patch).eq("id", valuation.id);
  if (error) fail(error.message);

  await recordEvent({
    valuationId: valuation.id,
    assetId: asset.id,
    offeringId: asset.offering_id,
    actorUserId: userId,
    actorRole: scope.isAdmin ? "harmonious" : "fund_manager",
    action: `valuation_${input.action}`,
    fromStatus: from,
    toStatus: to,
    reason: input.reason ?? null,
    previous: { value_cents: valuation.value_cents },
  });
  return { ok: true, status: to };
}

/** A fund manager's acknowledgement or challenge. Neither changes the number. */
export async function respondToValuation(
  userId: string,
  input: { valuationId: string; response: "acknowledge" | "challenge"; note?: string },
) {
  const { scope, valuation, asset } = await authorizeValuation(userId, input.valuationId);
  if (input.response === "challenge" && (input.note ?? "").trim().length < 4) {
    fail("Say what is wrong with this valuation.");
  }
  const patch: Record<string, unknown> = {
    manager_acknowledged_by: userId,
    manager_acknowledged_at: new Date().toISOString(),
  };
  if (input.response === "challenge") patch["manager_challenge_note"] = input.note ?? null;
  const { error } = await db().from("portfolio_valuations").update(patch).eq("id", valuation.id);
  if (error) fail(error.message);
  await recordEvent({
    valuationId: valuation.id,
    assetId: asset.id,
    offeringId: asset.offering_id,
    actorUserId: userId,
    actorRole: scope.isAdmin ? "harmonious" : "fund_manager",
    action: `valuation_${input.response}`,
    reason: input.note ?? null,
  });
  return { ok: true };
}

// ------------------------------------------------------------- GL handoff

async function accountIds(bookId: string, codes: string[]) {
  const { data } = await db()
    .from("chart_of_accounts")
    .select("id, code")
    .eq("book_id", bookId)
    .in("code", codes);
  return new Map(((data ?? []) as any[]).map((a) => [a.code as string, a.id as string]));
}

/**
 * Prepare — never post — the unrealised movement behind an effective
 * valuation. The movement is measured against the last value already
 * recognised in the ledger, so recomputing or superseding a valuation cannot
 * recognise the same gain twice.
 */
export async function prepareValuationJournal(userId: string, valuationId: string) {
  await assertHarmonious(userId);
  const { valuation, asset } = await authorizeValuation(userId, valuationId);
  if (valuation.status !== "effective") {
    fail("Only an effective valuation can be taken to the ledger.");
  }
  if (valuation.journal_entry_id) {
    return { journalEntryId: valuation.journal_entry_id as string, created: false };
  }
  const policy = await policyFor(asset.offering_id, asset.asset_class);
  const recognized = await lastRecognizedValue(asset.id);
  const journal = unrealizedJournal(
    recognized,
    Number(valuation.value_cents),
    policy,
    `Unrealised movement — ${asset.issuer_name} ${asset.asset_name}`,
  );
  if (!journal) return { journalEntryId: null, created: false, reason: "no_movement" as const };

  const codes = await accountIds(
    asset.book_id,
    journal.lines.map((l) => l.accountCode),
  );
  const lines: DraftLine[] = journal.lines.map((line) => {
    const accountId = codes.get(line.accountCode);
    if (!accountId) fail(`Account ${line.accountCode} is not in this fund's chart of accounts.`);
    const draft: DraftLine = { accountId, offeringId: asset.offering_id };
    if (line.debitCents) draft.debitCents = line.debitCents;
    if (line.creditCents) draft.creditCents = line.creditCents;
    return draft;
  });

  const entry = await draftJournalEntry(userId, {
    bookId: asset.book_id,
    entryDate: valuation.effective_date,
    memo: journal.memo,
    source: "valuation",
    sourceTable: "portfolio_valuations",
    sourceId: valuation.id,
    lines,
  });

  const { error } = await db()
    .from("portfolio_valuations")
    .update({ journal_entry_id: (entry as any).id })
    .eq("id", valuation.id);
  if (error) fail(error.message);

  await recordEvent({
    valuationId: valuation.id,
    assetId: asset.id,
    offeringId: asset.offering_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "valuation_journal_prepared",
    next: { journal_entry_id: (entry as any).id, movement_cents: journal.lines[0]?.debitCents ?? null },
  });
  return { journalEntryId: (entry as any).id as string, created: true };
}

// ------------------------------------------------------------ realizations

/** Record a sale or disposition. Separate from unrealised marking. */
export async function recordRealization(
  userId: string,
  input: {
    assetId: string;
    dispositionDate: string;
    quantitySold?: number | null;
    proceedsCents: number;
    counterparty?: string | null;
    bankTransactionId?: string | null;
    note?: string | null;
  },
) {
  await assertHarmonious(userId);
  const { asset } = await authorizeAsset(userId, input.assetId);
  if (asset.status === "realized") fail("This position is already fully realised.");
  const remainingCost = asset.cost_basis_cents - (asset.realized_cost_basis_cents ?? 0);
  const result = realization({
    quantityHeld: asset.quantity,
    quantitySold: input.quantitySold ?? null,
    costBasisCents: remainingCost,
    proceedsCents: input.proceedsCents,
  });

  const { data, error } = await db()
    .from("portfolio_realizations")
    .insert({
      asset_id: asset.id,
      book_id: asset.book_id,
      offering_id: asset.offering_id,
      disposition_date: input.dispositionDate,
      quantity_sold: input.quantitySold ?? null,
      proceeds_cents: input.proceedsCents,
      cost_basis_relieved_cents: result.costBasisRelievedCents,
      realized_gain_cents: result.realizedGainCents,
      remaining_quantity: result.remainingQuantity,
      remaining_cost_basis_cents: result.remainingCostBasisCents,
      is_full_disposition: result.isFullDisposition,
      counterparty: input.counterparty ?? null,
      bank_transaction_id: input.bankTransactionId ?? null,
      note: input.note ?? null,
      recorded_by: userId,
    })
    .select()
    .single();
  if (error) fail(error.message);

  await db()
    .from("portfolio_assets")
    .update({
      status: result.isFullDisposition ? "realized" : "partially_realized",
      quantity: result.remainingQuantity,
      realized_quantity: Number(asset.quantity ?? 0) - Number(result.remainingQuantity ?? 0),
      realized_cost_basis_cents:
        (asset.realized_cost_basis_cents ?? 0) + result.costBasisRelievedCents,
      realized_proceeds_cents: input.proceedsCents,
      realized_gain_cents: result.realizedGainCents,
      disposition_date: result.isFullDisposition ? input.dispositionDate : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", asset.id);

  await recordEvent({
    assetId: asset.id,
    offeringId: asset.offering_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "realization_recorded",
    next: data,
  });
  return data;
}

export async function prepareRealizationJournal(userId: string, realizationId: string) {
  await assertHarmonious(userId);
  const scope = await reviewerScope(userId);
  const { data } = await db()
    .from("portfolio_realizations")
    .select("*")
    .eq("id", realizationId)
    .maybeSingle();
  if (!data) fail("Disposition not found.");
  const row = data as any;
  assertScopeAllows(scope, row.offering_id);
  if (row.journal_entry_id) return { journalEntryId: row.journal_entry_id as string, created: false };

  const { asset } = await authorizeAsset(userId, row.asset_id);
  const policy = await policyFor(asset.offering_id, asset.asset_class);
  const journal = realizationJournal(
    {
      costBasisRelievedCents: Number(row.cost_basis_relieved_cents),
      realizedGainCents: Number(row.realized_gain_cents),
      remainingQuantity: row.remaining_quantity,
      remainingCostBasisCents: Number(row.remaining_cost_basis_cents),
      isFullDisposition: Boolean(row.is_full_disposition),
    },
    Number(row.proceeds_cents),
    policy,
    `Disposition — ${asset.issuer_name} ${asset.asset_name}`,
  );
  if (!journal) fail("Nothing to post for this disposition.");

  const codes = await accountIds(asset.book_id, journal.lines.map((l) => l.accountCode));
  const lines: DraftLine[] = journal.lines.map((line) => {
    const accountId = codes.get(line.accountCode);
    if (!accountId) fail(`Account ${line.accountCode} is not in this fund's chart of accounts.`);
    const draft: DraftLine = { accountId, offeringId: asset.offering_id };
    if (line.debitCents) draft.debitCents = line.debitCents;
    if (line.creditCents) draft.creditCents = line.creditCents;
    return draft;
  });

  const entry = await draftJournalEntry(userId, {
    bookId: asset.book_id,
    entryDate: row.disposition_date,
    memo: journal.memo,
    source: "valuation",
    sourceTable: "portfolio_realizations",
    sourceId: row.id,
    lines,
  });
  await db()
    .from("portfolio_realizations")
    .update({ journal_entry_id: (entry as any).id })
    .eq("id", row.id);
  await recordEvent({
    assetId: asset.id,
    offeringId: asset.offering_id,
    actorUserId: userId,
    actorRole: "harmonious",
    action: "realization_journal_prepared",
    next: { journal_entry_id: (entry as any).id },
  });
  return { journalEntryId: (entry as any).id as string, created: true };
}

// ----------------------------------------------------------------- as-of

function toRecords(rows: any[]): ValuationRecord[] {
  return rows.map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    effectiveDate: r.effective_date,
    version: Number(r.version),
    status: r.status as ValuationStatus,
    valueCents: Number(r.value_cents),
  }));
}

/** The value that was effective on a date — never simply today's latest. */
export async function valuationAsOfDate(userId: string, assetId: string, date: string) {
  const { asset } = await authorizeAsset(userId, assetId);
  const { data } = await db()
    .from("portfolio_valuations")
    .select("id, asset_id, effective_date, version, status, value_cents")
    .eq("asset_id", asset.id);
  return valuationAsOf(toRecords((data ?? []) as any[]), date);
}

export async function portfolioAsOfDate(userId: string, offeringId: string, date: string) {
  const scope = await reviewerScope(userId);
  assertScopeAllows(scope, offeringId);
  const { data: assets } = await db()
    .from("portfolio_assets")
    .select("id, issuer_name, asset_name, asset_class, cost_basis_cents")
    .eq("offering_id", offeringId);
  const assetRows = (assets ?? []) as any[];
  const ids = assetRows.map((a) => a.id as string);
  if (ids.length === 0) return { asOf: date, lines: [], totalValueCents: 0, totalCostCents: 0 };
  const { data: valuations } = await db()
    .from("portfolio_valuations")
    .select("id, asset_id, effective_date, version, status, value_cents")
    .in("asset_id", ids);
  const result = portfolioAsOf(ids, toRecords((valuations ?? []) as any[]), date);
  const byId = new Map(assetRows.map((a) => [a.id as string, a]));
  return {
    asOf: date,
    totalValueCents: result.totalValueCents,
    totalCostCents: assetRows.reduce((sum, a) => sum + Number(a.cost_basis_cents ?? 0), 0),
    lines: result.lines.map((line) => ({
      ...line,
      issuerName: byId.get(line.assetId)?.issuer_name ?? "",
      assetName: byId.get(line.assetId)?.asset_name ?? "",
      costBasisCents: Number(byId.get(line.assetId)?.cost_basis_cents ?? 0),
    })),
  };
}

// ------------------------------------------------------------- read models

function scopedQuery(scope: ReviewerScope, table: string, select = "*") {
  const query = db().from(table).select(select);
  return scope.isAdmin ? query : query.in("offering_id", scope.offeringIds);
}

/** The Harmonious valuation review queue, with everything a reviewer needs. */
export async function valuationQueue(
  userId: string,
  filter?: { offeringId?: string; status?: ValuationStatus },
) {
  const scope = await reviewerScope(userId);
  let query = scopedQuery(scope, "portfolio_valuations")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter?.offeringId) {
    assertScopeAllows(scope, filter.offeringId);
    query = query.eq("offering_id", filter.offeringId);
  }
  if (filter?.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) fail(error.message);
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const assetIds = [...new Set(rows.map((r) => r.asset_id as string))];
  const [{ data: assets }, { data: offerings }, { data: evidence }] = await Promise.all([
    db().from("portfolio_assets").select("*").in("id", assetIds),
    db().from("offerings").select("id, name"),
    db().from("valuation_evidence").select("id, valuation_id, kind, title"),
  ]);
  const assetById = new Map(((assets ?? []) as any[]).map((a) => [a.id as string, a]));
  const fundName = new Map(((offerings ?? []) as any[]).map((o) => [o.id as string, o.name as string]));
  const evidenceByValuation = new Map<string, any[]>();
  for (const e of (evidence ?? []) as any[]) {
    const list = evidenceByValuation.get(e.valuation_id) ?? [];
    list.push(e);
    evidenceByValuation.set(e.valuation_id, list);
  }

  const now = today();
  return rows.map((r) => {
    const asset = assetById.get(r.asset_id);
    return {
      id: r.id as string,
      assetId: r.asset_id as string,
      offeringId: r.offering_id as string | null,
      fundName: r.offering_id ? (fundName.get(r.offering_id) ?? "—") : "—",
      issuerName: asset?.issuer_name ?? "",
      assetName: asset?.asset_name ?? "",
      assetClass: asset?.asset_class ?? "other",
      status: r.status as ValuationStatus,
      version: Number(r.version),
      valuationDate: r.valuation_date as string,
      effectiveDate: r.effective_date as string,
      valueCents: Number(r.value_cents),
      priorValueCents: Number(r.value_cents) - Number(r.change_cents ?? 0),
      changeCents: Number(r.change_cents ?? 0),
      changePct: r.change_pct === null ? null : Number(r.change_pct),
      methodology: r.methodology as ValuationMethod,
      sourceType: r.source_type as ValuationSourceType,
      source: (r.source as string | null) ?? null,
      conflicts: Array.isArray(r.conflicts) ? (r.conflicts as string[]) : [],
      preparedByRole: (r.prepared_by_role as string | null) ?? null,
      ageDays: Math.max(0, Math.round(
        (Date.parse(`${now}T00:00:00Z`) - Date.parse(`${r.valuation_date}T00:00:00Z`)) / 86_400_000,
      )),
      evidence: (evidenceByValuation.get(r.id) ?? []).map((e) => ({
        id: e.id as string,
        kind: e.kind as string,
        title: e.title as string,
      })),
      managerAcknowledged: Boolean(r.manager_acknowledged_at),
      managerChallenge: (r.manager_challenge_note as string | null) ?? null,
      journalEntryId: (r.journal_entry_id as string | null) ?? null,
    };
  });
}

export async function valuationHistory(userId: string, valuationId: string) {
  const { valuation, asset } = await authorizeValuation(userId, valuationId);
  const [{ data: events }, { data: versions }] = await Promise.all([
    db()
      .from("valuation_events")
      .select("*")
      .eq("valuation_id", valuation.id)
      .order("created_at", { ascending: false }),
    db()
      .from("portfolio_valuations")
      .select("id, version, status, effective_date, value_cents, methodology, source_type")
      .eq("asset_id", asset.id)
      .order("version", { ascending: false }),
  ]);
  return { events: (events ?? []) as any[], versions: (versions ?? []) as any[] };
}

/** Assets whose last effective mark is older than the fund's threshold. */
export async function stalePositions(userId: string) {
  const scope = await reviewerScope(userId);
  const { data: assets } = await scopedQuery(scope, "portfolio_assets").eq("status", "active");
  const rows = (assets ?? []) as any[];
  const out: { assetId: string; issuerName: string; assetName: string; offeringId: string | null; lastValuationDate: string | null; ageDays: number | null }[] = [];
  for (const asset of rows) {
    const policy = await policyFor(asset.offering_id, asset.asset_class);
    const current = await currentEffective(asset.id);
    const lastDate = current ? (current.valuation_date as string) : null;
    const ageDays = lastDate
      ? Math.round((Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000)
      : null;
    if (!lastDate || (ageDays ?? 0) > policy.stalenessDays) {
      out.push({
        assetId: asset.id,
        issuerName: asset.issuer_name,
        assetName: asset.asset_name,
        offeringId: asset.offering_id,
        lastValuationDate: lastDate,
        ageDays,
      });
    }
  }
  return out;
}
