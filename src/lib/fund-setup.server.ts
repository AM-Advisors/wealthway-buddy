/**
 * Server-only fund setup engine (Fund Administration Phase A).
 *
 * This is the canonical source of truth for getting a fund from a client
 * request to "ready for investor onboarding". Authority is always resolved
 * from authoritative records:
 *
 *   Harmonious staff — admin role in user_roles; owns every control
 *   fund manager     — fund_managers assignment for that exact offering;
 *                      reads its own setup, answers client-owned items,
 *                      never approves, never launches, never sees unreleased
 *                      banking instructions
 *
 * Nothing here opens a fund to investors on its own: launch requires an
 * explicit Harmonious approval recorded against the setup.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_LAUNCH_CONDITIONS,
  bankingInstructionsVisible,
  bankingTransitionError,
  canReleaseBankingInstructions,
  canTransitionDocument,
  clientMayUpdateTask,
  clientPortalBucket,
  defaultOnboardingRequirements,
  dependenciesSatisfied,
  economicsEditError,
  entityStepError,
  evaluateReadiness,
  investorOnboardingPath,
  isFundStructure,
  launchApprovalError,
  nextVersion,
  regulatoryAmendmentError,
  sectionSummaries,
  stageTransitionError,
  taskTemplates,
  type BankingStatus,
  type EntityStep,
  type FundStructure,
  type TaskStatus,
} from "@/lib/fund-setup-model";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();

export function forbid(message: string): never {
  throw new Error(`Forbidden: ${message}`);
}
function fail(message: string): never {
  throw new Error(message);
}

// ------------------------------------------------------------------ actor

export type SetupActor = {
  userId: string;
  isStaff: boolean;
  offeringIds: string[];
};

export async function setupActor(userId: string | null | undefined): Promise<SetupActor> {
  if (!userId) forbid("not signed in.");
  const { data: roles } = await db().from("user_roles").select("role").eq("user_id", userId);
  const list = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  const isStaff = list.includes("admin");
  const { data: assignments } = await db()
    .from("fund_managers")
    .select("offering_id")
    .eq("user_id", userId);
  const offeringIds = [
    ...new Set(((assignments ?? []) as { offering_id: string }[]).map((a) => a.offering_id)),
  ];
  return { userId: userId as string, isStaff, offeringIds };
}

export async function assertStaff(userId: string): Promise<SetupActor> {
  const actor = await setupActor(userId);
  if (!actor.isStaff) forbid("Harmonious fund administration authority is required.");
  return actor;
}

async function setupRow(setupId: string) {
  const { data } = await db().from("fund_setups").select("*").eq("id", setupId).maybeSingle();
  if (!data) fail("That fund setup was not found.");
  return data;
}

/** Read access: staff, or the manager of that exact offering. */
export async function assertSetupAccess(userId: string, setupId: string) {
  const actor = await setupActor(userId);
  const setup = await setupRow(setupId);
  if (!actor.isStaff && !actor.offeringIds.includes(setup.offering_id)) {
    forbid("you do not manage that fund.");
  }
  return { actor, setup };
}

async function recordEvent(input: {
  setupId: string | null;
  subjectTable: string;
  subjectId?: string | null;
  event: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  detail?: Record<string, unknown>;
  actorUserId: string;
  actorRole?: string;
}) {
  await db().from("fund_setup_events").insert({
    setup_id: input.setupId,
    subject_table: input.subjectTable,
    subject_id: input.subjectId ?? null,
    event: input.event,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    detail: input.detail ?? {},
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole ?? null,
  });
}

// ------------------------------------------------------------ new fund

export async function createFundSetup(
  userId: string,
  input: {
    offeringId: string;
    clientId?: string | null | undefined;
    fundRequestId?: string | null | undefined;
    structure: string;
    structureOther?: string | null | undefined;
    legalFundName?: string | null | undefined;
    displayName?: string | null | undefined;
  },
) {
  const actor = await assertStaff(userId);
  if (!isFundStructure(input.structure)) fail("That fund structure is not supported.");
  const structure = input.structure as FundStructure;

  const { data: existing } = await db()
    .from("fund_setups")
    .select("*")
    .eq("offering_id", input.offeringId)
    .maybeSingle();
  if (existing) return existing;

  const { data: setup, error } = await db()
    .from("fund_setups")
    .insert({
      offering_id: input.offeringId,
      client_id: input.clientId ?? null,
      fund_request_id: input.fundRequestId ?? null,
      structure,
      structure_other: input.structureOther ?? null,
      legal_fund_name: input.legalFundName ?? null,
      display_name: input.displayName ?? null,
      stage: "new_request",
      launch_state: "not_ready",
      created_by: actor.userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);

  const templates = taskTemplates(structure);
  await db()
    .from("fund_setup_tasks")
    .insert(
      templates.map((t, index) => ({
        setup_id: setup.id,
        section: t.section,
        task_key: t.taskKey,
        label: t.label,
        responsible_party: t.responsibleParty,
        blocking: t.blocking ?? true,
        client_editable: t.clientEditable ?? false,
        dependencies: t.dependencies ?? [],
        sort_order: index,
        created_by: actor.userId,
      })),
    );
  await db()
    .from("fund_launch_conditions")
    .insert(
      DEFAULT_LAUNCH_CONDITIONS.map((c, index) => ({
        setup_id: setup.id,
        condition_key: c.key,
        label: c.label,
        required: c.required,
        sort_order: index,
      })),
    );
  await db()
    .from("fund_onboarding_requirements")
    .insert(
      defaultOnboardingRequirements(structure).map((r, index) => ({
        setup_id: setup.id,
        investor_type: r.investorType,
        step: r.step,
        required: r.required,
        sort_order: index,
        updated_by: actor.userId,
      })),
    );
  await db().from("fund_entity_formation").insert({ setup_id: setup.id, updated_by: actor.userId });
  await db().from("fund_banking_setups").insert({ setup_id: setup.id, updated_by: actor.userId });

  await recordEvent({
    setupId: setup.id,
    subjectTable: "fund_setups",
    subjectId: setup.id,
    event: "fund_setup_created",
    toStatus: "new_request",
    detail: { structure },
    actorUserId: actor.userId,
    actorRole: "harmonious",
  });
  return setup;
}

export async function updateFundInformation(
  userId: string,
  setupId: string,
  patch: Record<string, unknown>,
) {
  await assertStaff(userId);
  const allowed = [
    "legal_fund_name",
    "display_name",
    "domicile",
    "entity_type",
    "formation_date",
    "fiscal_year_end",
    "tax_year",
    "base_currency",
    "regulatory_structure",
    "investment_strategy",
    "target_size_cents",
    "hard_cap_cents",
    "min_investment_cents",
    "target_close",
    "final_close",
    "investment_period_months",
    "fund_term_months",
    "extension_terms",
    "series_parent_id",
    "series_designation",
    "structure_other",
    "notes",
  ];
  const update: Record<string, unknown> = { updated_at: nowIso() };
  for (const key of allowed) if (key in patch) update[key] = patch[key];
  const { data } = await db()
    .from("fund_setups")
    .update(update)
    .eq("id", setupId)
    .select("*")
    .single();
  await recordEvent({
    setupId,
    subjectTable: "fund_setups",
    subjectId: setupId,
    event: "fund_information_updated",
    detail: { fields: Object.keys(update) },
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

export async function setSetupStage(userId: string, setupId: string, stage: string) {
  await assertStaff(userId);
  const setup = await setupRow(setupId);
  const error = stageTransitionError(setup.stage, stage);
  if (error) fail(error);
  const { data } = await db()
    .from("fund_setups")
    .update({ stage, updated_at: nowIso() })
    .eq("id", setupId)
    .select("*")
    .single();
  await recordEvent({
    setupId,
    subjectTable: "fund_setups",
    subjectId: setupId,
    event: "stage_changed",
    fromStatus: setup.stage,
    toStatus: stage,
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

// ------------------------------------------------------------- parties

export async function saveParty(
  userId: string,
  input: {
    id?: string | undefined;
    setupId: string;
    role: string;
    displayName: string;
    organizationId?: string | null | undefined;
    personId?: string | null | undefined;
    entityId?: string | null | undefined;
    partyUserId?: string | null | undefined;
    contactEmail?: string | null | undefined;
    contactPhone?: string | null | undefined;
    isAuthorizedSignatory?: boolean | undefined;
    notes?: string | null | undefined;
  },
) {
  await assertStaff(userId);
  const payload = {
    setup_id: input.setupId,
    role: input.role,
    display_name: input.displayName,
    organization_id: input.organizationId ?? null,
    person_id: input.personId ?? null,
    entity_id: input.entityId ?? null,
    user_id: input.partyUserId ?? null,
    contact_email: input.contactEmail ?? null,
    contact_phone: input.contactPhone ?? null,
    is_authorized_signatory: input.isAuthorizedSignatory ?? false,
    notes: input.notes ?? null,
    updated_at: nowIso(),
  };
  const result = input.id
    ? await db().from("fund_setup_parties").update(payload).eq("id", input.id).select("*").single()
    : await db()
        .from("fund_setup_parties")
        .insert({ ...payload, created_by: userId })
        .select("*")
        .single();
  if (result.error) fail(result.error.message);
  return result.data;
}

// ---------------------------------------------------------------- tasks

export async function updateTask(
  userId: string,
  input: {
    taskId: string;
    status?: TaskStatus | undefined;
    assignedUserId?: string | null | undefined;
    clientOwnerUserId?: string | null | undefined;
    dueDate?: string | null | undefined;
    responsibleParty?: string | undefined;
    notes?: string | null | undefined;
    response?: Record<string, unknown> | undefined;
  },
) {
  const { data: task } = await db()
    .from("fund_setup_tasks")
    .select("*")
    .eq("id", input.taskId)
    .maybeSingle();
  if (!task) fail("That setup task was not found.");
  const { actor } = await assertSetupAccess(userId, task.setup_id);

  if (!actor.isStaff) {
    // A fund manager may answer their own items. Harmonious-controlled
    // requirements — and completion itself — are never client-side acts.
    const verdict = clientMayUpdateTask(
      { responsibleParty: task.responsible_party, clientEditable: task.client_editable },
      (input.status ?? task.status) as TaskStatus,
    );
    if (!verdict.allowed) forbid(verdict.reason ?? "that item is not yours to change.");
    if (
      input.assignedUserId !== undefined ||
      input.responsibleParty !== undefined ||
      input.dueDate !== undefined
    ) {
      forbid("assignment and due dates are set by Harmonious.");
    }
  }

  if (input.status === "complete") {
    const { data: siblings } = await db()
      .from("fund_setup_tasks")
      .select("task_key,status")
      .eq("setup_id", task.setup_id);
    const byKey = new Map(
      ((siblings ?? []) as { task_key: string; status: string }[]).map((t) => [t.task_key, t]),
    );
    if (!dependenciesSatisfied({ dependencies: task.dependencies }, byKey)) {
      fail("Earlier items this task depends on are not complete yet.");
    }
  }

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.status) patch["status"] = input.status;
  if (input.notes !== undefined) patch["notes"] = input.notes;
  if (input.response !== undefined) patch["response"] = input.response;
  if (actor.isStaff) {
    if (input.assignedUserId !== undefined) patch["assigned_user_id"] = input.assignedUserId;
    if (input.clientOwnerUserId !== undefined) patch["client_owner_user_id"] = input.clientOwnerUserId;
    if (input.dueDate !== undefined) patch["due_date"] = input.dueDate;
    if (input.responsibleParty !== undefined) patch["responsible_party"] = input.responsibleParty;
  }
  if (input.status === "complete") {
    patch["completed_by"] = userId;
    patch["completed_at"] = nowIso();
  }

  const { data } = await db()
    .from("fund_setup_tasks")
    .update(patch)
    .eq("id", input.taskId)
    .select("*")
    .single();
  await recordEvent({
    setupId: task.setup_id,
    subjectTable: "fund_setup_tasks",
    subjectId: task.id,
    event: "task_updated",
    fromStatus: task.status,
    toStatus: input.status ?? task.status,
    actorUserId: userId,
    actorRole: actor.isStaff ? "harmonious" : "client",
  });
  return data;
}

// ------------------------------------------------------------ documents

export async function saveSetupDocument(
  userId: string,
  input: {
    setupId: string;
    docType: string;
    title: string;
    storagePath?: string | null | undefined;
    externalReference?: string | null | undefined;
    taskId?: string | null | undefined;
    investorFacing?: boolean | undefined;
    notes?: string | null | undefined;
  },
) {
  const { actor } = await assertSetupAccess(userId, input.setupId);
  const { data: versions } = await db()
    .from("fund_setup_documents")
    .select("*")
    .eq("setup_id", input.setupId)
    .eq("doc_type", input.docType);
  const list = (versions ?? []) as any[];
  const current = list.find((v) => v.is_current);
  const version = nextVersion(list.map((v) => ({ version: v.version })));

  // A new upload supersedes the previous version; the prior row is preserved.
  const { data, error } = await db()
    .from("fund_setup_documents")
    .insert({
      setup_id: input.setupId,
      task_id: input.taskId ?? null,
      doc_type: input.docType,
      title: input.title,
      status: "draft",
      version,
      is_current: true,
      supersedes_id: current?.id ?? null,
      storage_path: input.storagePath ?? null,
      external_reference: input.externalReference ?? null,
      uploaded_by: userId,
      uploaded_role: actor.isStaff ? "harmonious" : "client",
      investor_facing: input.investorFacing ?? false,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  if (current) {
    await db()
      .from("fund_setup_documents")
      .update({ is_current: false, status: "superseded", updated_at: nowIso() })
      .eq("id", current.id);
  }
  await recordEvent({
    setupId: input.setupId,
    subjectTable: "fund_setup_documents",
    subjectId: data.id,
    event: "document_version_added",
    toStatus: "draft",
    detail: { docType: input.docType, version, supersedes: current?.id ?? null },
    actorUserId: userId,
    actorRole: actor.isStaff ? "harmonious" : "client",
  });
  return data;
}

export async function transitionSetupDocument(userId: string, documentId: string, to: string) {
  await assertStaff(userId);
  const { data: doc } = await db()
    .from("fund_setup_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) fail("That document was not found.");
  if (!canTransitionDocument(doc.status, to)) {
    fail(`A document cannot move from ${doc.status} to ${to}.`);
  }
  const patch: Record<string, unknown> = { status: to, updated_at: nowIso() };
  if (to === "approved" || to === "current") {
    patch["approved_by"] = userId;
    patch["approved_at"] = nowIso();
  }
  if (to === "superseded") patch["is_current"] = false;
  const { data } = await db()
    .from("fund_setup_documents")
    .update(patch)
    .eq("id", documentId)
    .select("*")
    .single();
  await recordEvent({
    setupId: doc.setup_id,
    subjectTable: "fund_setup_documents",
    subjectId: documentId,
    event: "document_status",
    fromStatus: doc.status,
    toStatus: to,
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

// -------------------------------------------------------- entity formation

export async function advanceEntityFormation(
  userId: string,
  input: {
    setupId: string;
    step: EntityStep;
    jurisdiction?: string | null | undefined;
    registeredAgent?: string | null | undefined;
    entityIdentifiers?: Record<string, unknown> | undefined;
    formationDocumentId?: string | null | undefined;
    certificateDocumentId?: string | null | undefined;
    einLetterDocumentId?: string | null | undefined;
  },
) {
  await assertStaff(userId);
  const { data: record } = await db()
    .from("fund_entity_formation")
    .select("*")
    .eq("setup_id", input.setupId)
    .maybeSingle();
  if (!record) fail("That fund has no entity formation record.");

  const evidence = {
    formationDocumentId: input.formationDocumentId ?? record.formation_document_id,
    certificateDocumentId: input.certificateDocumentId ?? record.certificate_document_id,
    einLetterDocumentId: input.einLetterDocumentId ?? record.ein_letter_document_id,
  };
  const error = entityStepError(record.step as EntityStep, input.step, evidence);
  if (error) fail(error);

  const stamp: Record<EntityStep, string | null> = {
    name_selected: null,
    formation_requested: "formation_requested_at",
    formation_filed: "formation_filed_at",
    formation_accepted: "formation_accepted_at",
    ein_requested: "ein_requested_at",
    ein_received: "ein_received_at",
    registered_agent_confirmed: "registered_agent_confirmed_at",
    entity_active: "entity_active_at",
  };
  const patch: Record<string, unknown> = {
    step: input.step,
    jurisdiction: input.jurisdiction ?? record.jurisdiction,
    registered_agent: input.registeredAgent ?? record.registered_agent,
    entity_identifiers: input.entityIdentifiers ?? record.entity_identifiers,
    formation_document_id: evidence.formationDocumentId,
    certificate_document_id: evidence.certificateDocumentId,
    ein_letter_document_id: evidence.einLetterDocumentId,
    updated_by: userId,
    updated_at: nowIso(),
  };
  const column = stamp[input.step];
  if (column) patch[column] = nowIso();

  const { data } = await db()
    .from("fund_entity_formation")
    .update(patch)
    .eq("id", record.id)
    .select("*")
    .single();
  await recordEvent({
    setupId: input.setupId,
    subjectTable: "fund_entity_formation",
    subjectId: record.id,
    event: "entity_step",
    fromStatus: record.step,
    toStatus: input.step,
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

// ------------------------------------------------------------- economics

export async function saveEconomics(
  userId: string,
  input: {
    setupId: string;
    terms: Record<string, unknown>;
    classes?: unknown[] | undefined;
    investorSpecific?: unknown[] | undefined;
    effectiveFrom?: string | null | undefined;
    changeReason?: string | null | undefined;
    versionId?: string | undefined;
  },
) {
  await assertStaff(userId);
  const { data: rows } = await db()
    .from("fund_economics_versions")
    .select("*")
    .eq("setup_id", input.setupId);
  const list = (rows ?? []) as any[];

  if (input.versionId) {
    const current = list.find((v) => v.id === input.versionId);
    if (!current) fail("That economics version was not found.");
    const error = economicsEditError(current);
    if (error) fail(error);
    const { data } = await db()
      .from("fund_economics_versions")
      .update({
        terms: input.terms,
        classes: input.classes ?? current.classes,
        investor_specific: input.investorSpecific ?? current.investor_specific,
        effective_from: input.effectiveFrom ?? current.effective_from,
        change_reason: input.changeReason ?? current.change_reason,
        updated_at: nowIso(),
      })
      .eq("id", input.versionId)
      .select("*")
      .single();
    return data;
  }

  const approved = list.find((v) => v.status === "approved");
  const { data, error } = await db()
    .from("fund_economics_versions")
    .insert({
      setup_id: input.setupId,
      version: nextVersion(list.map((v) => ({ version: v.version }))),
      status: "draft",
      terms: input.terms,
      classes: input.classes ?? [],
      investor_specific: input.investorSpecific ?? [],
      effective_from: input.effectiveFrom ?? null,
      change_reason: input.changeReason ?? null,
      supersedes_id: approved?.id ?? null,
      prepared_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    setupId: input.setupId,
    subjectTable: "fund_economics_versions",
    subjectId: data.id,
    event: "economics_version_created",
    toStatus: "draft",
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

export async function approveEconomics(userId: string, versionId: string) {
  await assertStaff(userId);
  const { data: version } = await db()
    .from("fund_economics_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) fail("That economics version was not found.");
  if (version.status !== "draft") fail("Only a draft economics version can be approved.");
  if (version.prepared_by === userId) {
    fail("The person who prepared economic terms cannot also approve them.");
  }

  // The prior approved version becomes history; it is never overwritten.
  const { data: rows } = await db()
    .from("fund_economics_versions")
    .select("*")
    .eq("setup_id", version.setup_id);
  for (const prior of ((rows ?? []) as any[]).filter(
    (v) => v.status === "approved" && v.id !== versionId,
  )) {
    await db()
      .from("fund_economics_versions")
      .update({ status: "superseded", updated_at: nowIso() })
      .eq("id", prior.id);
  }

  const { data } = await db()
    .from("fund_economics_versions")
    .update({
      status: "approved",
      approved_by: userId,
      approved_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", versionId)
    .select("*")
    .single();
  await recordEvent({
    setupId: version.setup_id,
    subjectTable: "fund_economics_versions",
    subjectId: versionId,
    event: "economics_approved",
    fromStatus: "draft",
    toStatus: "approved",
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

// --------------------------------------------------------- target assets

export async function saveTargetAsset(
  userId: string,
  input: Record<string, any> & { setupId: string; assetName: string },
) {
  await assertStaff(userId);
  const payload = {
    setup_id: input.setupId,
    asset_name: input.assetName,
    issuer_name: input['issuerName'] ?? null,
    security_type: input['securityType'] ?? null,
    round_name: input['roundName'] ?? null,
    price_per_unit_cents: input['pricePerUnitCents'] ?? null,
    valuation_cents: input['valuationCents'] ?? null,
    purchase_amount_cents: input['purchaseAmountCents'] ?? null,
    unit_count: input['unitCount'] ?? null,
    closing_date: input['closingDate'] ?? null,
    investment_terms: input['investmentTerms'] ?? {},
    issuer_approval_status: input['issuerApprovalStatus'] ?? "not_required",
    transfer_restrictions: input['transferRestrictions'] ?? null,
    purchase_agreement_document_id: input['purchaseAgreementDocumentId'] ?? null,
    notes: input['notes'] ?? null,
    updated_at: nowIso(),
  };
  const result = input['id']
    ? await db().from("fund_target_assets").update(payload).eq("id", input['id']).select("*").single()
    : await db()
        .from("fund_target_assets")
        .insert({ ...payload, created_by: userId })
        .select("*")
        .single();
  if (result.error) fail(result.error.message);
  return result.data;
}

// --------------------------------------------------------------- banking

export async function updateBanking(
  userId: string,
  input: {
    setupId: string;
    status?: BankingStatus | undefined;
    bankName?: string | null | undefined;
    relationshipContact?: string | null | undefined;
    accountReference?: string | null | undefined;
    notes?: string | null | undefined;
  },
) {
  await assertStaff(userId);
  const { data: record } = await db()
    .from("fund_banking_setups")
    .select("*")
    .eq("setup_id", input.setupId)
    .maybeSingle();
  if (!record) fail("That fund has no banking record.");
  if (input.status) {
    const error = bankingTransitionError(record.status as BankingStatus, input.status);
    if (error) fail(error);
  }
  const patch: Record<string, unknown> = { updated_by: userId, updated_at: nowIso() };
  if (input.status) patch["status"] = input.status;
  if (input.bankName !== undefined) patch["bank_name"] = input.bankName;
  if (input.relationshipContact !== undefined) patch["relationship_contact"] = input.relationshipContact;
  if (input.accountReference !== undefined) patch["account_reference"] = input.accountReference;
  if (input.notes !== undefined) patch["notes"] = input.notes;
  if (input.status === "application") patch["application_submitted_at"] = nowIso();
  if (input.status === "approved") patch["approved_at"] = nowIso();
  if (input.status === "account_active") patch["account_active_at"] = nowIso();

  const { data } = await db()
    .from("fund_banking_setups")
    .update(patch)
    .eq("id", record.id)
    .select("*")
    .single();
  await recordEvent({
    setupId: input.setupId,
    subjectTable: "fund_banking_setups",
    subjectId: record.id,
    event: "banking_updated",
    fromStatus: record.status,
    toStatus: input.status ?? record.status,
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

/** Investor-facing funding instructions are released deliberately, by Harmonious. */
export async function releaseBankingInstructions(userId: string, setupId: string) {
  await assertStaff(userId);
  const { data: record } = await db()
    .from("fund_banking_setups")
    .select("*")
    .eq("setup_id", setupId)
    .maybeSingle();
  if (!record) fail("That fund has no banking record.");
  const error = canReleaseBankingInstructions(record);
  if (error) fail(error);
  const { data } = await db()
    .from("fund_banking_setups")
    .update({
      investor_instructions_released: true,
      investor_instructions_released_by: userId,
      investor_instructions_released_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", record.id)
    .select("*")
    .single();
  await recordEvent({
    setupId,
    subjectTable: "fund_banking_setups",
    subjectId: record.id,
    event: "banking_instructions_released",
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

/** Everything a non-staff viewer is allowed to know about the bank account. */
export function redactBanking(record: any, isStaff: boolean) {
  if (!record) return null;
  if (isStaff) return record;
  const released = bankingInstructionsVisible({
    status: record.status,
    investorInstructionsReleased: record.investor_instructions_released,
  });
  return {
    id: record.id,
    setup_id: record.setup_id,
    status: record.status,
    investor_instructions_released: record.investor_instructions_released,
    bank_name: released ? record.bank_name : null,
    account_reference: released ? record.account_reference : null,
    relationship_contact: null,
    notes: null,
  };
}

// ------------------------------------------------------------ regulatory

export async function saveRegulatoryConfig(
  userId: string,
  input: {
    setupId: string;
    selections: Record<string, unknown>;
    amendmentReason?: string | null | undefined;
    configId?: string | undefined;
  },
) {
  const actor = await assertStaff(userId);
  const setup = await setupRow(input.setupId);
  const launched = Boolean(setup.launched_at);

  const { data: rows } = await db()
    .from("fund_regulatory_configs")
    .select("*")
    .eq("setup_id", input.setupId);
  const list = (rows ?? []) as any[];

  if (input.configId) {
    const current = list.find((c) => c.id === input.configId);
    if (!current) fail("That regulatory configuration was not found.");
    const error = regulatoryAmendmentError({
      launched,
      actorIsStaff: actor.isStaff,
      reason: input.amendmentReason ?? null,
      createsNewVersion: false,
    });
    if (error) fail(error);
    if (current.locked_at) fail("A locked regulatory configuration is amended with a new version.");
    const { data } = await db()
      .from("fund_regulatory_configs")
      .update({ selections: input.selections, updated_at: nowIso() })
      .eq("id", input.configId)
      .select("*")
      .single();
    return data;
  }

  const amendError = regulatoryAmendmentError({
    launched,
    actorIsStaff: actor.isStaff,
    reason: input.amendmentReason ?? null,
    createsNewVersion: true,
  });
  if (amendError) fail(amendError);

  const previous = list.find((c) => c.status === "reviewed");
  const { data, error } = await db()
    .from("fund_regulatory_configs")
    .insert({
      setup_id: input.setupId,
      version: nextVersion(list.map((c) => ({ version: c.version }))),
      status: "draft",
      selections: input.selections,
      supersedes_id: previous?.id ?? null,
      amendment_reason: input.amendmentReason ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  await recordEvent({
    setupId: input.setupId,
    subjectTable: "fund_regulatory_configs",
    subjectId: data.id,
    event: launched ? "regulatory_amendment_created" : "regulatory_version_created",
    toStatus: "draft",
    detail: { reason: input.amendmentReason ?? null },
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

export async function reviewRegulatoryConfig(userId: string, configId: string) {
  await assertStaff(userId);
  const { data: config } = await db()
    .from("fund_regulatory_configs")
    .select("*")
    .eq("id", configId)
    .maybeSingle();
  if (!config) fail("That regulatory configuration was not found.");
  const { data } = await db()
    .from("fund_regulatory_configs")
    .update({
      status: "reviewed",
      reviewed_by: userId,
      reviewed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", configId)
    .select("*")
    .single();
  await recordEvent({
    setupId: config.setup_id,
    subjectTable: "fund_regulatory_configs",
    subjectId: configId,
    event: "regulatory_reviewed",
    fromStatus: config.status,
    toStatus: "reviewed",
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return data;
}

// ----------------------------------------------------- eligibility rules

export async function saveEligibilityConfig(
  userId: string,
  input: { setupId: string; rules: Record<string, unknown>; configId?: string | undefined },
) {
  await assertStaff(userId);
  const { data: rows } = await db()
    .from("fund_eligibility_configs")
    .select("*")
    .eq("setup_id", input.setupId);
  const list = (rows ?? []) as any[];
  if (input.configId) {
    const current = list.find((c) => c.id === input.configId);
    if (!current) fail("That eligibility configuration was not found.");
    if (current.status === "approved") {
      fail("Approved eligibility rules are preserved; create a new version instead.");
    }
    const { data } = await db()
      .from("fund_eligibility_configs")
      .update({ rules: input.rules, updated_at: nowIso() })
      .eq("id", input.configId)
      .select("*")
      .single();
    return data;
  }
  const approved = list.find((c) => c.status === "approved");
  const { data, error } = await db()
    .from("fund_eligibility_configs")
    .insert({
      setup_id: input.setupId,
      version: nextVersion(list.map((c) => ({ version: c.version }))),
      status: "draft",
      rules: input.rules,
      supersedes_id: approved?.id ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) fail(error.message);
  return data;
}

export async function approveEligibilityConfig(userId: string, configId: string) {
  await assertStaff(userId);
  const { data: config } = await db()
    .from("fund_eligibility_configs")
    .select("*")
    .eq("id", configId)
    .maybeSingle();
  if (!config) fail("That eligibility configuration was not found.");
  const { data: rows } = await db()
    .from("fund_eligibility_configs")
    .select("*")
    .eq("setup_id", config.setup_id);
  for (const prior of ((rows ?? []) as any[]).filter(
    (c) => c.status === "approved" && c.id !== configId,
  )) {
    await db()
      .from("fund_eligibility_configs")
      .update({ status: "superseded", updated_at: nowIso() })
      .eq("id", prior.id);
  }
  const { data } = await db()
    .from("fund_eligibility_configs")
    .update({
      status: "approved",
      approved_by: userId,
      approved_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", configId)
    .select("*")
    .single();
  return data;
}

export async function setOnboardingRequirement(
  userId: string,
  input: {
    setupId: string;
    investorType: string;
    step: string;
    required: boolean;
    config?: Record<string, unknown> | undefined;
  },
) {
  await assertStaff(userId);
  const { data: rows } = await db()
    .from("fund_onboarding_requirements")
    .select("*")
    .eq("setup_id", input.setupId)
    .eq("investor_type", input.investorType);
  const existing = ((rows ?? []) as any[]).find((r) => r.step === input.step);
  const payload = {
    setup_id: input.setupId,
    investor_type: input.investorType,
    step: input.step,
    required: input.required,
    config: input.config ?? {},
    updated_by: userId,
    updated_at: nowIso(),
  };
  const result = existing
    ? await db()
        .from("fund_onboarding_requirements")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await db().from("fund_onboarding_requirements").insert(payload).select("*").single();
  if (result.error) fail(result.error.message);
  return result.data;
}

// ---------------------------------------------------- readiness & launch

async function readinessFor(setupId: string) {
  const [conditions, tasks, approvals] = await Promise.all([
    db().from("fund_launch_conditions").select("*").eq("setup_id", setupId),
    db().from("fund_setup_tasks").select("*").eq("setup_id", setupId),
    db().from("fund_launch_approvals").select("*").eq("setup_id", setupId),
  ]);
  const conditionRows = (conditions.data ?? []) as any[];
  const taskRows = (tasks.data ?? []) as any[];
  const approvalRows = (approvals.data ?? []) as any[];
  const approved = approvalRows.some((a) => a.decision === "approved");
  return {
    conditionRows,
    taskRows,
    approvalRows,
    result: evaluateReadiness({
      conditions: conditionRows.map((c) => ({
        conditionKey: c.condition_key,
        label: c.label,
        required: c.required,
        satisfied: c.satisfied,
      })),
      tasks: taskRows.map((t) => ({ status: t.status, blocking: t.blocking })),
      harmoniousApproved: approved,
    }),
  };
}

export async function setLaunchCondition(
  userId: string,
  input: {
    setupId: string;
    conditionKey: string;
    label?: string | undefined;
    required?: boolean | undefined;
    satisfied?: boolean | undefined;
    evidence?: Record<string, unknown> | undefined;
  },
) {
  await assertStaff(userId);
  const { data: rows } = await db()
    .from("fund_launch_conditions")
    .select("*")
    .eq("setup_id", input.setupId);
  const existing = ((rows ?? []) as any[]).find((c) => c.condition_key === input.conditionKey);
  const payload: Record<string, unknown> = {
    setup_id: input.setupId,
    condition_key: input.conditionKey,
    label: input.label ?? existing?.label ?? input.conditionKey,
    required: input.required ?? existing?.required ?? true,
    updated_at: nowIso(),
  };
  if (input.satisfied !== undefined) {
    payload["satisfied"] = input.satisfied;
    payload["satisfied_at"] = input.satisfied ? nowIso() : null;
  }
  if (input.evidence !== undefined) payload["evidence"] = input.evidence;
  const result = existing
    ? await db()
        .from("fund_launch_conditions")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await db().from("fund_launch_conditions").insert(payload).select("*").single();
  if (result.error) fail(result.error.message);
  return result.data;
}

export async function getReadiness(userId: string, setupId: string) {
  await assertSetupAccess(userId, setupId);
  const { result, conditionRows } = await readinessFor(setupId);
  return { ...result, conditions: conditionRows };
}

/**
 * Harmonious approves — or declines — the fund for investor onboarding.
 * The decision is recorded immutably, with the unmet conditions at the time.
 */
export async function decideLaunch(
  userId: string,
  input: { setupId: string; decision: "approved" | "declined"; reason?: string | undefined },
) {
  const actor = await assertStaff(userId);
  const setup = await setupRow(input.setupId);
  const { result } = await readinessFor(input.setupId);

  if (input.decision === "approved") {
    const error = launchApprovalError({
      actorIsStaff: actor.isStaff,
      unmetBeforeApproval: result.unmet,
    });
    if (error) fail(error);
  }

  await db().from("fund_launch_approvals").insert({
    setup_id: input.setupId,
    decision: input.decision,
    reason: input.reason ?? null,
    unmet_conditions: result.unmet,
    decided_by: userId,
  });

  if (input.decision !== "approved") {
    await recordEvent({
      setupId: input.setupId,
      subjectTable: "fund_setups",
      subjectId: input.setupId,
      event: "launch_declined",
      detail: { reason: input.reason ?? null },
      actorUserId: userId,
      actorRole: "harmonious",
    });
    return { setup, decision: input.decision, readiness: result };
  }

  await db()
    .from("fund_launch_conditions")
    .update({ satisfied: true, satisfied_at: nowIso(), updated_at: nowIso() })
    .eq("setup_id", input.setupId)
    .eq("condition_key", "harmonious_approval");

  const { data: updated } = await db()
    .from("fund_setups")
    .update({
      launch_state: "ready",
      launch_approved_by: userId,
      launch_approved_at: nowIso(),
      stage: "ready_to_launch",
      updated_at: nowIso(),
    })
    .eq("id", input.setupId)
    .select("*")
    .single();

  await recordEvent({
    setupId: input.setupId,
    subjectTable: "fund_setups",
    subjectId: input.setupId,
    event: "launch_approved",
    toStatus: "ready",
    actorUserId: userId,
    actorRole: "harmonious",
  });
  return { setup: updated, decision: input.decision, readiness: { ...result, ready: true } };
}

/**
 * Generate the investor entry point. Only possible after an approval, and the
 * link is derived from the offering record — never from client input.
 */
export async function launchFund(userId: string, setupId: string) {
  await assertStaff(userId);
  const setup = await setupRow(setupId);
  const { result } = await readinessFor(setupId);
  if (!result.ready || setup.launch_state !== "ready") {
    fail("This fund is not approved for investor onboarding yet.");
  }
  const { data: offering } = await db()
    .from("offerings")
    .select("id,slug,name,legal_entity_name,min_investment_cents,reg_type,is_open")
    .eq("id", setup.offering_id)
    .maybeSingle();
  if (!offering?.slug) fail("That offering has no public reference yet.");

  const url = investorOnboardingPath(offering.slug);
  const { data: updated } = await db()
    .from("fund_setups")
    .update({
      launch_state: "launched",
      launched_at: nowIso(),
      stage: "investor_onboarding",
      investor_onboarding_url: url,
      updated_at: nowIso(),
    })
    .eq("id", setupId)
    .select("*")
    .single();

  // Lock the reviewed regulatory configuration at launch.
  await db()
    .from("fund_regulatory_configs")
    .update({ locked_at: nowIso(), updated_at: nowIso() })
    .eq("setup_id", setupId)
    .eq("status", "reviewed");

  const [documents, requirements, eligibility] = await Promise.all([
    db()
      .from("fund_setup_documents")
      .select("*")
      .eq("setup_id", setupId)
      .eq("is_current", true),
    db().from("fund_onboarding_requirements").select("*").eq("setup_id", setupId),
    db().from("fund_eligibility_configs").select("*").eq("setup_id", setupId).eq("status", "approved"),
  ]);

  await recordEvent({
    setupId,
    subjectTable: "fund_setups",
    subjectId: setupId,
    event: "fund_launched",
    toStatus: "launched",
    detail: { url },
    actorUserId: userId,
    actorRole: "harmonious",
  });

  return {
    setup: updated,
    investorOnboardingUrl: url,
    offering: {
      id: offering.id,
      slug: offering.slug,
      name: offering.name,
      legalEntityName: offering.legal_entity_name,
      minInvestmentCents: offering.min_investment_cents,
      regType: offering.reg_type,
    },
    subscriptionDocuments: ((documents.data ?? []) as any[]).filter((d) => d.investor_facing),
    investorRequirements: (requirements.data ?? []) as any[],
    eligibility: ((eligibility.data ?? []) as any[])[0] ?? null,
  };
}

// ------------------------------------------------------------ read models

export async function fundSetupDetail(userId: string, setupId: string) {
  const { actor, setup } = await assertSetupAccess(userId, setupId);
  const [
    parties,
    tasks,
    documents,
    entity,
    economics,
    assets,
    banking,
    regulatory,
    eligibility,
    requirements,
    conditions,
    approvals,
    events,
  ] = await Promise.all([
    db().from("fund_setup_parties").select("*").eq("setup_id", setupId),
    db().from("fund_setup_tasks").select("*").eq("setup_id", setupId).order("sort_order"),
    db().from("fund_setup_documents").select("*").eq("setup_id", setupId),
    db().from("fund_entity_formation").select("*").eq("setup_id", setupId).maybeSingle(),
    db().from("fund_economics_versions").select("*").eq("setup_id", setupId),
    db().from("fund_target_assets").select("*").eq("setup_id", setupId),
    db().from("fund_banking_setups").select("*").eq("setup_id", setupId).maybeSingle(),
    db().from("fund_regulatory_configs").select("*").eq("setup_id", setupId),
    db().from("fund_eligibility_configs").select("*").eq("setup_id", setupId),
    db().from("fund_onboarding_requirements").select("*").eq("setup_id", setupId),
    db().from("fund_launch_conditions").select("*").eq("setup_id", setupId).order("sort_order"),
    db().from("fund_launch_approvals").select("*").eq("setup_id", setupId),
    db()
      .from("fund_setup_events")
      .select("*")
      .eq("setup_id", setupId)
      .order("created_at", { ascending: false }),
  ]);

  const rows = (r: any) => (r?.data ?? []) as any[];
  const taskRows = rows(tasks);
  const { result } = await readinessFor(setupId);

  return {
    setup,
    isStaff: actor.isStaff,
    parties: rows(parties),
    tasks: taskRows,
    sections: sectionSummaries(setup.structure as FundStructure, taskRows),
    documents: rows(documents),
    currentDocuments: rows(documents).filter((d) => d.is_current),
    entityFormation: entity.data ?? null,
    economics: rows(economics),
    approvedEconomics: rows(economics).find((e) => e.status === "approved") ?? null,
    targetAssets: rows(assets),
    banking: redactBanking(banking.data, actor.isStaff),
    regulatory: rows(regulatory),
    eligibility: rows(eligibility),
    onboardingRequirements: rows(requirements),
    launchConditions: rows(conditions),
    launchApprovals: actor.isStaff ? rows(approvals) : [],
    readiness: result,
    events: rows(events).slice(0, 200),
  };
}

/** Harmonious Fund Administration command center. */
export async function fundAdministrationDashboard(userId: string) {
  await assertStaff(userId);
  const [setups, tasks, banking, entity] = await Promise.all([
    db().from("fund_setups").select("*").order("created_at", { ascending: false }),
    db().from("fund_setup_tasks").select("setup_id,status,responsible_party,blocking,section,label,due_date"),
    db().from("fund_banking_setups").select("setup_id,status,investor_instructions_released"),
    db().from("fund_entity_formation").select("setup_id,step"),
  ]);
  const setupRows = (setups.data ?? []) as any[];
  const taskRows = (tasks.data ?? []) as any[];
  const bankingBySetup = new Map(
    ((banking.data ?? []) as any[]).map((b) => [b.setup_id, b]),
  );
  const entityBySetup = new Map(((entity.data ?? []) as any[]).map((e) => [e.setup_id, e]));

  const enriched = setupRows.map((s) => {
    const own = taskRows.filter((t) => t.setup_id === s.id);
    const openBlocking = own.filter((t) => (t.blocking ?? true) && t.status !== "complete").length;
    return {
      ...s,
      openBlocking,
      waitingOnClient: own.filter((t) => t.status === "waiting_on_client").length,
      exceptions: own.filter((t) => t.status === "exception").length,
      banking: bankingBySetup.get(s.id) ?? null,
      entityStep: entityBySetup.get(s.id)?.step ?? null,
    };
  });

  const byStage = (...stages: string[]) => enriched.filter((s) => stages.includes(s.stage));
  return {
    all: enriched,
    newRequests: byStage("new_request"),
    setup: enriched.filter(
      (s) => !["new_request", "ready_to_launch", "investor_onboarding", "active"].includes(s.stage),
    ),
    waitingOnClient: enriched.filter((s) => s.waitingOnClient > 0),
    entityFormation: enriched.filter(
      (s) => s.entityStep && s.entityStep !== "entity_active",
    ),
    documents: byStage("documents"),
    banking: enriched.filter((s) => (s.banking?.status ?? "not_started") !== "account_active"),
    compliance: byStage("compliance"),
    readyToLaunch: enriched.filter((s) => s.launch_state === "ready"),
    investorOnboarding: byStage("investor_onboarding"),
    active: byStage("active"),
    exceptions: enriched.filter((s) => s.exceptions > 0),
  };
}

/** The fund manager's clean Fund Setup page: what we need, what we're doing. */
export async function clientFundSetup(userId: string, setupId?: string) {
  const actor = await setupActor(userId);
  let id = setupId;
  if (!id) {
    if (actor.offeringIds.length === 0) return { setups: [], setup: null };
    const { data } = await db()
      .from("fund_setups")
      .select("*")
      .in("offering_id", actor.offeringIds)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as any[];
    if (list.length === 0) return { setups: [], setup: null };
    id = list[0].id as string;
  }
  const detail = await fundSetupDetail(userId, id);
  const buckets = {
    needed_from_you: [] as any[],
    harmonious_working: [] as any[],
    third_party: [] as any[],
    completed: [] as any[],
  };
  for (const task of detail.tasks) {
    buckets[
      clientPortalBucket({ responsibleParty: task.responsible_party, status: task.status })
    ].push(task);
  }

  const { data: mine } = await db()
    .from("fund_setups")
    .select("id,display_name,legal_fund_name,stage,launch_state,offering_id")
    .in("offering_id", actor.offeringIds.length > 0 ? actor.offeringIds : ["00000000-0000-0000-0000-000000000000"]);

  return {
    setups: (mine ?? []) as any[],
    setup: detail.setup,
    sections: detail.sections,
    buckets,
    documents: detail.currentDocuments,
    readiness: {
      headline: detail.readiness.headline,
      ready: detail.readiness.ready,
      unmet: detail.readiness.unmet,
    },
    banking: detail.banking,
  };
}
