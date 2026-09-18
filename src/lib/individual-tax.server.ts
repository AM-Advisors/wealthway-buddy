/**
 * Server-only individual (Form 1040) tax engine.
 *
 * This is deliberately a separate world from fund operations. A fund manager
 * has no path into it: household access is the primary taxpayer, an explicitly
 * authorized household member for that year, Harmonious tax staff, or a
 * delegated professional holding the individual-return capability.
 *
 *   document_collection → organizer → data_import → calculation
 *     → missing_information → preparer_review → taxpayer_review
 *     → approved → ready_to_file
 *
 * transmitted / accepted / rejected / amended are filing RESULTS, recorded
 * from a filing-status response. Nothing here files or pays anything.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertHouseholdAccess,
  assertTaxStaff,
  forbid,
  recordTaxAccess,
  recordTaxEvent,
  taxActor,
  type ViewerContext,
} from "@/lib/tax-authz.server";
import {
  CALCULATION_VERSION,
  buildReturnLines,
  canTransition1040,
  missingInformation,
  segregationError,
  statusFromProvider,
  type ProviderOperation,
  type SourceDocument,
} from "@/lib/tax-model";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();
const num = (v: unknown) => Number(v ?? 0);

function fail(message: string): never {
  throw new Error(message);
}

async function rowOrFail(table: string, id: string, label: string) {
  const { data } = await db().from(table).select("*").eq("id", id).maybeSingle();
  if (!data) fail(`${label} not found.`);
  return data;
}

// ============================================================== households

export async function ensureHousehold(
  userId: string,
  input: { primaryUserId?: string | undefined; name?: string | undefined; personId?: string | null } = {},
) {
  const actor = await taxActor(userId);
  const primary = input.primaryUserId ?? userId;
  if (primary !== userId && !actor.isStaff) {
    forbid("only Harmonious tax operations can open a household for another taxpayer.");
  }
  const { data: existing } = await db()
    .from("taxpayer_households")
    .select("*")
    .eq("primary_user_id", primary)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await db()
    .from("taxpayer_households")
    .insert({
      name: input.name ?? "Personal tax",
      primary_user_id: primary,
      primary_person_id: input.personId ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

/** Spouse or joint access is an explicit, recorded authorization per tax year. */
export async function authorizeHouseholdMember(
  userId: string,
  input: {
    householdId: string;
    memberUserId: string;
    taxYear: number;
    relationship: "spouse" | "dependent" | "other";
    filingStatus?: string | null;
    authorized: boolean;
  },
) {
  const household = await rowOrFail("taxpayer_households", input.householdId, "Household");
  const actor = await taxActor(userId);
  if (!actor.isStaff && household.primary_user_id !== userId) {
    forbid("only the primary taxpayer or Harmonious can authorize household access.");
  }
  const { data: rows } = await db()
    .from("taxpayer_household_members")
    .select("*")
    .eq("household_id", input.householdId)
    .eq("member_user_id", input.memberUserId);
  const existing = ((rows ?? []) as any[]).find((m) => m.tax_year === input.taxYear);

  const payload = {
    household_id: input.householdId,
    member_user_id: input.memberUserId,
    tax_year: input.taxYear,
    relationship: input.relationship,
    filing_status: input.filingStatus ?? null,
    access_authorized: input.authorized,
    access_authorized_at: input.authorized ? nowIso() : null,
    access_authorized_by: input.authorized ? userId : null,
    updated_at: nowIso(),
  };
  const result = existing
    ? await db()
        .from("taxpayer_household_members")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await db().from("taxpayer_household_members").insert(payload).select("*").single();
  if (result.error) fail(result.error.message);
  await recordTaxEvent({
    subjectTable: "taxpayer_household_members",
    subjectId: result.data?.id ?? input.householdId,
    householdId: input.householdId,
    taxYear: input.taxYear,
    event: input.authorized ? "household_access_granted" : "household_access_revoked",
    actorUserId: userId,
  });
  return result.data;
}

// ============================================================ 1040 returns

export async function openIndividualReturn(
  userId: string,
  input: { householdId: string; taxYear: number; filingStatus?: string | undefined },
) {
  const { actor } = await assertHouseholdAccess(userId, input.householdId, input.taxYear);
  if (!actor.isStaff) forbid("Harmonious tax operations opens the individual return.");
  const household = await rowOrFail("taxpayer_households", input.householdId, "Household");
  const { data: rows } = await db()
    .from("individual_tax_returns")
    .select("*")
    .eq("household_id", input.householdId)
    .eq("tax_year", input.taxYear);
  const existing = ((rows ?? []) as any[]).find((r) => !["superseded"].includes(r.status));
  if (existing) return existing;

  const { data, error } = await db()
    .from("individual_tax_returns")
    .insert({
      household_id: input.householdId,
      tax_year: input.taxYear,
      primary_user_id: household.primary_user_id,
      filing_status: input.filingStatus ?? "single",
      status: "document_collection",
      calculation_version: CALCULATION_VERSION,
      prepared_by: userId,
      prepared_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordTaxEvent({
    subjectTable: "individual_tax_returns",
    subjectId: data.id,
    householdId: input.householdId,
    taxYear: input.taxYear,
    event: "return_1040_opened",
    toStatus: "document_collection",
    actorUserId: userId,
  });
  return data;
}

// ============================================================== documents

export async function requestTaxDocument(
  userId: string,
  input: { householdId: string; taxYear: number; documentType: string; note?: string | undefined },
) {
  const { actor } = await assertHouseholdAccess(userId, input.householdId, input.taxYear, {
    resource: "tax_information_request",
  });
  if (!actor.isStaff) {
    // A delegated preparer with request_tax_information also reaches here.
    void 0;
  }
  const { data, error } = await db()
    .from("individual_tax_documents")
    .insert({
      household_id: input.householdId,
      tax_year: input.taxYear,
      document_type: input.documentType,
      origin: "external",
      status: "requested",
      structured_data: input.note ? { note: input.note } : {},
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

export async function recordIndividualDocument(
  userId: string,
  input: {
    householdId: string;
    taxYear: number;
    documentType: string;
    structuredData?: Record<string, unknown>;
    storagePath?: string | null;
    issuer?: string | null;
    ownerUserId?: string | null;
    documentId?: string | null;
  },
) {
  const { subjectUserId } = await assertHouseholdAccess(userId, input.householdId, input.taxYear);
  if (input.documentId) {
    const existing = await rowOrFail("individual_tax_documents", input.documentId, "Document");
    if (existing.household_id !== input.householdId) forbid("that document belongs elsewhere.");
    const { data } = await db()
      .from("individual_tax_documents")
      .update({
        document_type: input.documentType,
        structured_data: input.structuredData ?? existing.structured_data,
        storage_path: input.storagePath ?? existing.storage_path,
        issuer: input.issuer ?? existing.issuer,
        status: "received",
        updated_at: nowIso(),
      })
      .eq("id", input.documentId)
      .select("*")
      .single();
    return data;
  }
  const { data, error } = await db()
    .from("individual_tax_documents")
    .insert({
      household_id: input.householdId,
      tax_year: input.taxYear,
      owner_user_id: input.ownerUserId ?? subjectUserId,
      document_type: input.documentType,
      origin: "taxpayer",
      issuer: input.issuer ?? null,
      structured_data: input.structuredData ?? {},
      storage_path: input.storagePath ?? null,
      status: "received",
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

/**
 * Import the taxpayer's own Harmonious K-1s, 1042-S and 1099s.
 * A form is imported only when its stored recipient IS this taxpayer.
 */
export async function importHarmoniousDocuments(
  userId: string,
  input: { householdId: string; taxYear: number },
) {
  const { subjectUserId } = await assertHouseholdAccess(userId, input.householdId, input.taxYear);

  const [k1s, s1042, s1099] = await Promise.all([
    db().from("k1_forms").select("*").eq("investor_user_id", subjectUserId).eq("tax_year", input.taxYear),
    db()
      .from("form_1042s_records")
      .select("*")
      .eq("recipient_user_id", subjectUserId)
      .eq("tax_year", input.taxYear),
    db()
      .from("form_1099_records")
      .select("*")
      .eq("recipient_user_id", subjectUserId)
      .eq("tax_year", input.taxYear),
  ]);
  const rows = (r: any) => (r?.data ?? []) as any[];

  const { data: existingRows } = await db()
    .from("individual_tax_documents")
    .select("*")
    .eq("household_id", input.householdId);
  const existingKeys = new Set(((existingRows ?? []) as any[]).map((d) => d.dedupe_key));

  const imported: any[] = [];
  const add = async (
    documentType: string,
    sourceTable: string,
    row: any,
    structured: Record<string, unknown>,
  ) => {
    if (row.investor_user_id && row.investor_user_id !== subjectUserId) return;
    if (row.recipient_user_id && row.recipient_user_id !== subjectUserId) return;
    const key = `${sourceTable}:${row.id}:v${row.version ?? 1}`;
    if (existingKeys.has(key)) return;
    const { data } = await db()
      .from("individual_tax_documents")
      .insert({
        household_id: input.householdId,
        owner_user_id: subjectUserId,
        tax_year: input.taxYear,
        document_type: documentType,
        origin: "harmonious",
        source_table: sourceTable,
        source_id: row.id,
        source_version: row.version ?? 1,
        issuer: row.payer_name ?? null,
        structured_data: structured,
        status: "imported",
        dedupe_key: key,
        created_by: userId,
      })
      .select("*")
      .single();
    if (data) imported.push(data);
  };

  for (const k of rows(k1s)) {
    if (!["delivered", "final", "approved", "amended"].includes(k.status)) continue;
    await add("k1_1065", "k1_forms", k, k.boxes ?? {});
  }
  for (const f of rows(s1042)) {
    if (!["delivered", "final", "approved", "amended"].includes(f.status)) continue;
    await add("1042-S", "form_1042s_records", f, {
      withheld_cents: num(f.withheld_cents),
      gross_cents: num(f.gross_income_cents),
    });
  }
  for (const f of rows(s1099)) {
    if (!["recipient_delivered", "filed", "approved", "corrected"].includes(f.status)) continue;
    await add(f.form_type, "form_1099_records", f, f.boxes ?? {});
  }

  await recordTaxAccess({
    actorUserId: userId,
    onBehalfOf: subjectUserId === userId ? null : subjectUserId,
    resourceTable: "individual_tax_documents",
    resourceId: input.householdId,
    action: "import_harmonious_forms",
  });
  return { imported, count: imported.length };
}

// ============================================================ calculation

export async function recalculateReturn(userId: string, returnId: string) {
  const ret = await rowOrFail("individual_tax_returns", returnId, "Return");
  const { actor } = await assertHouseholdAccess(userId, ret.household_id, ret.tax_year, {
    resource: "individual_return_prepare",
  });
  if (["approved", "transmitted", "accepted", "delivered"].includes(ret.status)) {
    fail("An approved or filed return cannot be recalculated; amend it instead.");
  }
  void actor;

  const { data: docRows } = await db()
    .from("individual_tax_documents")
    .select("*")
    .eq("household_id", ret.household_id)
    .eq("tax_year", ret.tax_year);
  const documents: SourceDocument[] = ((docRows ?? []) as any[]).map((d) => ({
    id: d.id,
    documentType: d.document_type,
    structuredData: (d.structured_data ?? {}) as Record<string, unknown>,
    sourceTable: d.source_table,
    sourceId: d.source_id,
    sourceVersion: d.source_version,
    status: d.status,
  }));

  const lines = buildReturnLines(documents);
  const missing = missingInformation(documents);

  await db().from("tax_return_lines").delete().eq("return_id", returnId);
  if (lines.length > 0) {
    await db()
      .from("tax_return_lines")
      .insert(
        lines.map((line) => ({
          return_id: returnId,
          schedule_code: line.scheduleCode,
          line_code: line.lineCode,
          line_label: line.lineLabel,
          amount_cents: line.amountCents,
          provenance: line.provenance,
        })),
      );
  }

  const totals = lines.reduce((acc: Record<string, number>, line) => {
    acc[line.scheduleCode] = (acc[line.scheduleCode] ?? 0) + line.amountCents;
    return acc;
  }, {});

  const { data } = await db()
    .from("individual_tax_returns")
    .update({
      schedules: [...new Set(lines.map((l) => l.scheduleCode))],
      totals,
      missing_information: missing,
      calculation_version: CALCULATION_VERSION,
      source_manifest: {
        taxYear: ret.tax_year,
        householdId: ret.household_id,
        inputFormIds: documents.map((d) => d.id),
        calculationVersion: CALCULATION_VERSION,
        preparedBy: userId,
        generatedAt: nowIso(),
      },
      status: missing.some((m) => m.severity === "blocking") ? "missing_information" : "calculation",
      updated_at: nowIso(),
    })
    .eq("id", returnId)
    .select("*")
    .single();

  await recordTaxEvent({
    subjectTable: "individual_tax_returns",
    subjectId: returnId,
    householdId: ret.household_id,
    taxYear: ret.tax_year,
    event: "return_1040_calculated",
    actorUserId: userId,
  });
  return { return: data, lines, missing };
}

export async function transitionIndividualReturn(
  userId: string,
  returnId: string,
  to: string,
  note?: string,
) {
  const ret = await rowOrFail("individual_tax_returns", returnId, "Return");
  const access = await assertHouseholdAccess(userId, ret.household_id, ret.tax_year, {
    resource: to === "taxpayer_review" || to === "approved" ? "individual_return_view" : "individual_return_review",
  });
  if (!canTransition1040(ret.status, to)) {
    fail(`A 1040 cannot move from ${ret.status} to ${to}.`);
  }
  if (["transmitted", "accepted", "rejected"].includes(to)) {
    fail("Filing results are recorded from a filing-status response, not set by hand.");
  }
  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };
  if (to === "preparer_review") {
    if (!access.actor.isStaff && !access.onBehalf) {
      fail("A preparer review is recorded by the preparer, not the taxpayer.");
    }
    patch["reviewed_by"] = userId;
    patch["reviewed_at"] = nowIso();
  }
  if (to === "approved") {
    // Approval is a Harmonious control. A taxpayer signs off at taxpayer_review.
    if (!access.actor.isStaff) fail("Harmonious gives the final approval on a return.");
    const segregation = segregationError(ret.prepared_by, userId);
    if (segregation) fail(segregation);
    patch["approved_by"] = userId;
    patch["approved_at"] = nowIso();
  }
  if (to === "taxpayer_review") {
    patch["taxpayer_approved_by"] = null;
  }
  if (to === "ready_to_file") patch["filing_status_code"] = "ready_to_file";
  const { data } = await db()
    .from("individual_tax_returns")
    .update(patch)
    .eq("id", returnId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "individual_tax_returns",
    subjectId: returnId,
    householdId: ret.household_id,
    taxYear: ret.tax_year,
    event: "return_1040_status",
    fromStatus: ret.status,
    toStatus: to,
    detail: note ? { note } : {},
    actorUserId: userId,
  });
  return data;
}

/** The taxpayer's own sign-off during taxpayer_review. */
export async function taxpayerApproveReturn(userId: string, returnId: string) {
  const ret = await rowOrFail("individual_tax_returns", returnId, "Return");
  const access = await assertHouseholdAccess(userId, ret.household_id, ret.tax_year);
  if (access.onBehalf) fail("A delegated professional cannot sign off for the taxpayer.");
  if (ret.status !== "taxpayer_review") fail("This return is not awaiting taxpayer review.");
  const { data } = await db()
    .from("individual_tax_returns")
    .update({
      taxpayer_approved_by: userId,
      taxpayer_approved_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", returnId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "individual_tax_returns",
    subjectId: returnId,
    householdId: ret.household_id,
    taxYear: ret.tax_year,
    event: "return_1040_taxpayer_signoff",
    actorUserId: userId,
  });
  return data;
}

export async function generateIndividualReturnDocument(userId: string, returnId: string) {
  const ret = await rowOrFail("individual_tax_returns", returnId, "Return");
  await assertTaxStaff(userId);
  const { data } = await db()
    .from("individual_tax_returns")
    .update({ document_generated_at: nowIso(), updated_at: nowIso() })
    .eq("id", returnId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "individual_tax_returns",
    subjectId: returnId,
    householdId: ret.household_id,
    event: "return_1040_document_generated",
    detail: { note: "A generated document is not a filed return." },
    actorUserId: userId,
  });
  return data;
}

export async function amendIndividualReturn(userId: string, returnId: string, reason: string) {
  await assertTaxStaff(userId);
  if (!reason?.trim()) fail("An amended return needs a stated reason.");
  const original = await rowOrFail("individual_tax_returns", returnId, "Return");
  const { data, error } = await db()
    .from("individual_tax_returns")
    .insert({
      household_id: original.household_id,
      tax_year: original.tax_year,
      primary_user_id: original.primary_user_id,
      filing_status: original.filing_status,
      schedules: original.schedules,
      totals: original.totals,
      calculation_version: original.calculation_version,
      source_manifest: { ...(original.source_manifest ?? {}), amends: original.id },
      status: "data_import",
      version: num(original.version) + 1,
      supersedes_id: original.id,
      amendment_reason: reason,
      prepared_by: userId,
      prepared_at: nowIso(),
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await db().from("individual_tax_returns").update({ status: "amended" }).eq("id", returnId);
  await recordTaxEvent({
    subjectTable: "individual_tax_returns",
    subjectId: returnId,
    householdId: original.household_id,
    event: "return_1040_amended",
    fromStatus: original.status,
    toStatus: "amended",
    detail: { reason, replacementId: data.id },
    actorUserId: userId,
  });
  return data;
}

/** Filing results only ever arrive from a provider status response. */
export async function recordIndividualFilingStatus(
  userId: string,
  input: { returnId: string; operation: ProviderOperation; providerStatus: string | null; providerReference?: string | null },
) {
  await assertTaxStaff(userId);
  const ret = await rowOrFail("individual_tax_returns", input.returnId, "Return");
  const resulting = statusFromProvider(input.operation, input.providerStatus ?? null);
  await db().from("tax_provider_exchanges").insert({
    provider: "none",
    direction: "inbound",
    operation: input.operation,
    subject_table: "individual_tax_returns",
    subject_id: input.returnId,
    payload: {},
    provider_reference: input.providerReference ?? null,
    provider_status: input.providerStatus ?? null,
    created_by: userId,
  });
  if (!resulting) return { return: ret, applied: false };
  const patch: Record<string, unknown> = { status: resulting, updated_at: nowIso() };
  if (resulting === "accepted" || resulting === "rejected") patch["filing_status_code"] = resulting;
  const { data } = await db()
    .from("individual_tax_returns")
    .update(patch)
    .eq("id", input.returnId)
    .select("*")
    .single();
  await recordTaxEvent({
    subjectTable: "individual_tax_returns",
    subjectId: input.returnId,
    event: "return_1040_filing_status",
    fromStatus: ret.status,
    toStatus: resulting,
    actorUserId: userId,
  });
  return { return: data, applied: true };
}

// =========================================================== state returns

export async function saveStateReturn(
  userId: string,
  input: {
    id?: string;
    federalReturnId?: string | null;
    partnershipReturnId?: string | null;
    householdId?: string | null;
    offeringId?: string | null;
    taxYear: number;
    jurisdiction: string;
    residency?: "resident" | "part_year" | "nonresident";
    stateWithholdingCents?: number;
    status?: string;
  },
) {
  await assertTaxStaff(userId);
  const payload = {
    federal_return_id: input.federalReturnId ?? null,
    partnership_return_id: input.partnershipReturnId ?? null,
    household_id: input.householdId ?? null,
    offering_id: input.offeringId ?? null,
    tax_year: input.taxYear,
    jurisdiction: input.jurisdiction,
    residency: input.residency ?? null,
    state_withholding_cents: input.stateWithholdingCents ?? 0,
    status: input.status ?? "not_started",
    updated_at: nowIso(),
  };
  if (input.id) {
    const { data } = await db()
      .from("state_tax_returns")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    return data;
  }
  const { data, error } = await db()
    .from("state_tax_returns")
    .insert(payload)
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

// ======================================================== personal portal

export async function personalTaxCenter(
  userId: string,
  input: { householdId?: string; taxYear?: number; viewer?: ViewerContext } = {},
) {
  const taxYear = input.taxYear ?? new Date().getUTCFullYear() - 1;
  let householdId = input.householdId;
  if (!householdId) {
    const { data } = await db()
      .from("taxpayer_households")
      .select("*")
      .eq("primary_user_id", input.viewer?.onBehalfOfUserId ?? userId)
      .maybeSingle();
    if (!data) {
      return {
        household: null as any,
        taxYear,
        returns: [],
        documents: [],
        lines: [],
        stateReturns: [],
        missingInformation: [] as Record<string, unknown>[],
        checklist: [],
        priorYears: [],
      };
    }
    householdId = data.id as string;
  }
  const access = await assertHouseholdAccess(userId, householdId, taxYear, {
    ...(input.viewer ? { viewer: input.viewer } : {}),
  });
  const household = await rowOrFail("taxpayer_households", householdId, "Household");

  const [returns, documents, states] = await Promise.all([
    db().from("individual_tax_returns").select("*").eq("household_id", householdId),
    db().from("individual_tax_documents").select("*").eq("household_id", householdId),
    db().from("state_tax_returns").select("*").eq("household_id", householdId),
  ]);
  const rows = (r: any) => (r?.data ?? []) as any[];
  const current = rows(returns).find((r) => r.tax_year === taxYear) ?? null;
  let lines: any[] = [];
  if (current) {
    const { data } = await db().from("tax_return_lines").select("*").eq("return_id", current.id);
    lines = (data ?? []) as any[];
  }

  await recordTaxAccess({
    actorUserId: userId,
    onBehalfOf: access.onBehalf ? access.subjectUserId : null,
    delegationId: access.delegationId,
    resourceTable: "individual_tax_returns",
    resourceId: current?.id ?? householdId,
    action: "read",
  });

  const yearDocuments = rows(documents).filter((d) => d.tax_year === taxYear);
  return {
    household,
    taxYear,
    onBehalf: access.onBehalf,
    currentReturn: current,
    returns: rows(returns),
    priorYears: rows(returns).filter((r) => r.tax_year !== taxYear),
    amended: rows(returns).filter((r) => r.status === "amended" || r.supersedes_id),
    documents: yearDocuments,
    harmoniousDocuments: yearDocuments.filter((d) => d.origin === "harmonious"),
    externalDocuments: yearDocuments.filter((d) => d.origin !== "harmonious"),
    checklist: yearDocuments.map((d) => ({
      id: d.id,
      documentType: d.document_type,
      status: d.status,
      origin: d.origin,
    })),
    requested: yearDocuments.filter((d) => d.status === "requested"),
    lines,
    stateReturns: rows(states).filter((s) => s.tax_year === taxYear),
    missingInformation: (current?.missing_information ?? []) as Record<string, unknown>[],
  };
}
