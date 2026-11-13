/**
 * Canonical Fund Setup engine. Reads and writes the offering row (Legal Name,
 * entity, signatory, offering terms) and reuses the existing versioned
 * economics in fund-setup.server (maker-checker). Staff edit; managers of the
 * exact fund read. Nothing here touches banking, documents, signatures or money.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  classCountError,
  recordedArbitrationVenue,
  classAssignmentError,
  classErrors,
  classKey,
  economicsErrors,
  legalNameChangeWarning,
  sectionStatuses,
  structureForFundType,
  termApplies,
  type EconomicTerms,
  type FundClass,
} from "@/lib/fund-setup-canonical";
import { setupActor, forbid, createFundSetup, saveEconomics } from "@/lib/fund-setup.server";
import { seriesMasterKey, seriesMasterLabel, type SeriesMaster } from "@/lib/series-master";

const db = () => supabaseAdmin as any;

async function assertRead(userId: string, offeringId: string) {
  const actor = await setupActor(userId);
  if (!actor.isStaff && !actor.offeringIds.includes(offeringId)) await (await import("./fund-routine-access.server")).assertRoutineFund(db(), userId, offeringId);
  return actor;
}
async function assertStaffFor(userId: string, offeringId: string) {
  const actor = await assertRead(userId, offeringId);
  // Fund managers may save Fund details / Fees on their own fund via the self-serve grant.
  if (!actor.isStaff && !(await import("@/lib/self-serve.server")).selfServeAllows(userId, offeringId, "fund_setup")) forbid("only Harmonious can change canonical fund setup.");
  return actor;
}

async function downstreamCounts(offeringId: string) {
  const [{ count: investments }, { data: docs }] = await Promise.all([
    db().from("investor_onboardings").select("id", { count: "exact", head: true }).eq("offering_id", offeringId),
    db().from("offering_documents").select("id").eq("offering_id", offeringId),
  ]);
  const ids = ((docs ?? []) as any[]).map((d) => d.id);
  const { count: signed } = ids.length
    ? await db().from("document_signatures").select("id", { count: "exact", head: true }).in("offering_document_id", ids).is("cancelled_at", null)
    : { count: 0 };
  return { investments: investments ?? 0, signedDocuments: signed ?? 0 };
}

export async function fundSetupOverview(userId: string, offeringId: string, hasEin: boolean) {
  const actor = await assertRead(userId, offeringId);
  const { data: o } = await db().from("offerings").select("*").eq("id", offeringId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  const { data: setup } = await db().from("fund_setups").select("*").eq("offering_id", offeringId).maybeSingle();
  const [econ, docs, banking, managers, history, approvalEvents] = await Promise.all([
    setup ? db().from("fund_economics_versions").select("*").eq("setup_id", setup.id).order("version", { ascending: false }) : { data: [] },
    setup ? db().from("fund_setup_documents").select("id").eq("setup_id", setup.id).eq("is_current", true) : { data: [] },
    db().from("offering_bank_setup_requests").select("status").eq("offering_id", offeringId),
    db().from("fund_managers").select("user_id").eq("offering_id", offeringId),
    actor.isStaff
      ? db().from("offering_legal_name_history").select("*").eq("offering_id", offeringId).order("changed_at", { ascending: false })
      : { data: [] },
    setup
      ? db().from("fund_setup_events").select("subject_id, event, actor_user_id, actor_role, created_at, detail").eq("setup_id", setup.id).eq("subject_table", "fund_economics_versions").eq("event", "economics_approved").order("created_at", { ascending: false }).limit(100)
      : { data: [] },
  ]);
  const versions = (econ.data ?? []) as any[];
  const approvalRows = (approvalEvents.data ?? []) as any[];
  const approverIds = [...new Set([...approvalRows.map((e) => e.actor_user_id), ...versions.map((v) => v.approved_by)].filter(Boolean))] as string[];
  const { data: approverProfiles } = approverIds.length ? await db().from("profiles").select("user_id, legal_name, email").in("user_id", approverIds) : { data: [] };
  const { termsApprovalHistory } = await import("@/lib/terms-approval-history");
  const approvalHistory = termsApprovalHistory(
    versions,
    approvalRows,
    new Map(((approverProfiles ?? []) as any[]).map((p) => [p.user_id, { name: p.legal_name, email: p.email }])),
  );
  const current = versions.find((v) => v.status === "draft") ?? versions.find((v) => v.status === "approved") ?? null;
  const approved = versions.find((v) => v.status === "approved") ?? null;
  const terms = ((current?.terms ?? {}) as EconomicTerms) || ({} as EconomicTerms);
  const classes = (current?.classes ?? []) as FundClass[];

  // Signatory candidates: canonical Persons of this fund's assigned managers only.
  const managerIds = ((managers.data ?? []) as any[]).map((m) => m.user_id);
  const { data: people } = managerIds.length
    ? await db().from("persons").select("id, legal_first_name, legal_last_name, user_id").in("user_id", managerIds)
    : { data: [] };
  const signatoryOptions = ((people ?? []) as any[]).map((p) => ({
    id: p.id,
    name: [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || "Unnamed person",
  }));
  if (o.fund_signatory_person_id && !signatoryOptions.some((s) => s.id === o.fund_signatory_person_id)) {
    const { data: p } = await db().from("persons").select("id, legal_first_name, legal_last_name").eq("id", o.fund_signatory_person_id).maybeSingle();
    if (p) signatoryOptions.push({ id: p.id, name: [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") });
  }

  const bankRows = (banking.data ?? []) as any[];
  const bankingState = bankRows.some((r) => r.status === "opened") ? "active" : bankRows.some((r) => r.status === "in_progress") ? "in_progress" : bankRows.some((r) => r.status === "requested") ? "requested" : "none";

  const { listSetupDocuments } = await import("@/lib/offering-document-setup.server");
  const docSetup = await listSetupDocuments(userId, offeringId);
  const seriesMaster = await loadSeriesMaster(o);
  const check = await requestSetupCheck(offeringId, o, setup, current, classes, hasEin, bankRows.length > 0, seriesMaster?.jurisdiction ?? null);
  const documentNeeds = await (await import("@/lib/document-setup-needs.server")).fundDocumentSetupNeeds(offeringId);
  const statuses = sectionStatuses({
    documentNeeds: documentNeeds.filter((n) => n.step !== "economics").map((n) => n.label),
    economicsDocumentNeeds: documentNeeds.filter((n) => n.step === "economics").map((n) => n.label),
    questionsNext: check.questions.next,
    documentsStatus: docSetup.status,
    fundType: o.fund_type,
    legalName: o.legal_entity_name,
    displayName: o.name,
    gpName: o.gp_entity_name,
    signatoryPersonId: o.fund_signatory_person_id,
    signatoryTitle: o.signatory_title,
    fiscalYearEnd: setup?.fiscal_year_end ?? null,
    fundTermMonths: setup?.fund_term_months ?? null,
    investmentPeriodMonths: setup?.investment_period_months ?? null,
    entityType: o.entity_type,
    jurisdiction: seriesMaster?.jurisdiction ?? o.state_formed,
    formationDate: o.date_formed,
    hasEin,
    regType: o.reg_type,
    minInvestmentCents: o.min_investment_cents,
    targetRaiseCents: o.target_raise_cents,
    economicsStatus: approved && !versions.some((v) => v.status === "draft") ? "approved" : current ? "draft" : "none",
    managementFeeSet: terms?.managementFee?.ratePercent != null || !!terms?.notApplicable?.includes("managementFee"),
    carrySet: terms?.carry?.ratePercent != null || !!terms?.notApplicable?.includes("carry"),
    hasMultipleClasses: !!o.has_multiple_classes,
    classCount: classes.length,
    plannedClassCount: o.planned_class_count ?? null,
    documentCount: (docs.data ?? []).length,
    bankingState,
    adminConfigured: await adminServicesRecorded(setup?.id),
  });

  return {
    canEdit: actor.isStaff,
    routineOnly: !actor.isStaff,
    isStaff: actor.isStaff,
    offering: {
      id: o.id,
      displayName: o.name,
      legalName: o.legal_entity_name,
      fundType: o.fund_type,
      gpName: o.gp_entity_name,
      signatoryPersonId: o.fund_signatory_person_id,
      signatoryTitle: o.signatory_title,
      signatoryCapacity: o.signatory_capacity,
      signatoryEntityName: o.signatory_entity_name,
      entityType: o.entity_type,
      jurisdiction: o.state_formed,
      formationDate: o.date_formed,
      registeredAgent: o.registered_agent,
      principalAddress: o.principal_address,
      contactPhone: (o.contact_phone ?? null) as string | null,
      taxClassification: o.tax_classification,
      regType: o.reg_type,
      targetRaiseCents: o.target_raise_cents,
      maxOfferingCents: o.max_offering_cents,
      minInvestmentCents: o.min_investment_cents,
      maxInvestmentCents: o.max_investment_cents,
      offeringOpenDate: o.offering_open_date,
      offeringCloseDate: o.offering_close_date,
      ...recordedArbitrationVenue(o),
      rollingCloses: o.rolling_closes,
      hasMultipleClasses: !!o.has_multiple_classes,
      plannedClassCount: (o.planned_class_count ?? null) as number | null,
      driveFolderUrl: o.drive_folder_url,
      driveLinks: (actor.isStaff && Array.isArray(o.drive_links) ? o.drive_links : []) as { label: string; url: string }[],
    },
    setup: setup
      ? { id: setup.id, fiscalYearEnd: setup.fiscal_year_end, fundTermMonths: setup.fund_term_months, investmentPeriodMonths: setup.investment_period_months }
      : null,
    termApplies: termApplies(o.fund_type),
    documentNeeds,
    requestCheck: check,
    economics: {
      canApprove: true,
      canEdit: true,
      versionId: current?.id ?? null,
      status: current?.status ?? null,
      version: current?.version ?? null,
      approvedVersion: approved?.version ?? null,
      preparedByMe: current?.prepared_by === userId,
      terms,
      classes,
      approvalHistory,
    },
    signatoryOptions,
    statuses,
    seriesMaster,
    legalNameHistory: ((history.data ?? []) as any[]).map((h) => ({
      previous: h.previous_value,
      next: h.new_value,
      effectiveDate: h.effective_date,
      changedAt: h.changed_at,
    })),
  };
}

const OFFERING_FIELDS: Record<string, string> = {
  displayName: "name",
  fundType: "fund_type",
  gpName: "gp_entity_name",
  signatoryPersonId: "fund_signatory_person_id",
  signatoryTitle: "signatory_title",
  signatoryCapacity: "signatory_capacity",
  signatoryEntityName: "signatory_entity_name",
  entityType: "entity_type",
  jurisdiction: "state_formed",
  formationDate: "date_formed",
  registeredAgent: "registered_agent",
  principalAddress: "principal_address",
  contactPhone: "contact_phone",
  taxClassification: "tax_classification",
  regType: "reg_type",
  targetRaiseCents: "target_raise_cents",
  maxOfferingCents: "max_offering_cents",
  minInvestmentCents: "min_investment_cents",
  maxInvestmentCents: "max_investment_cents",
  offeringOpenDate: "offering_open_date",
  offeringCloseDate: "offering_close_date",
  arbitrationCity: "arbitration_city",
  arbitrationState: "arbitration_state",
  rollingCloses: "rolling_closes",
  hasMultipleClasses: "has_multiple_classes",
  plannedClassCount: "planned_class_count",
  driveFolderUrl: "drive_folder_url",
  driveLinks: "drive_links",
};

async function ensureSetup(userId: string, offeringId: string, fundType: string | null) {
  const { data: existing } = await db().from("fund_setups").select("*").eq("offering_id", offeringId).maybeSingle();
  if (existing) return existing;
  const { data: o } = await db().from("offerings").select("client_id, name").eq("id", offeringId).maybeSingle();
  return createFundSetup(userId, {
    offeringId,
    clientId: o?.client_id ?? null,
    structure: structureForFundType(fundType),
    displayName: o?.name ?? null,
  });
}

export async function saveFundSetupFields(
  userId: string,
  input: { offeringId: string; fields: Record<string, unknown>; setupFields?: { fiscalYearEnd?: string | null | undefined; fundTermMonths?: number | null | undefined; investmentPeriodMonths?: number | null | undefined } | undefined },
) {
  const actor = await assertRead(userId, input.offeringId);
  if (!actor.isStaff && !actor.offeringIds.includes(input.offeringId)) (await import("./fund-routine-access.server")).assertRoutineFields(input.fields);
  else if (!actor.isStaff) { try { (await import("./fund-routine-access.server")).assertRoutineFields(input.fields); } catch { await assertStaffFor(userId, input.offeringId); } }
  if (input.setupFields && Object.keys(input.setupFields).length && !actor.isStaff && !actor.offeringIds.includes(input.offeringId)) throw new Error("Fund tax and term setup requires the manager's existing workflow.");
  const update: any = {};
  for (const [k, v] of Object.entries(input.fields)) {
    const col = OFFERING_FIELDS[k];
    if (!col) throw new Error(`"${k}" cannot be changed here.`);
    update[col] = v === "" ? null : v;
  }
  if (update.fund_signatory_person_id) {
    // Signatory must be a canonical Person linked to this fund's managers or already recorded.
    const { data: p } = await db().from("persons").select("id").eq("id", update.fund_signatory_person_id).maybeSingle();
    if (!p) throw new Error("That signatory is not a recorded person.");
  }
  if (Object.keys(update).length) {
    update.updated_at = new Date().toISOString();
    const { error } = await db().from("offerings").update(update).eq("id", input.offeringId);
    if (error) throw new Error(error.message);
  }
  if (input.setupFields && Object.keys(input.setupFields).length) {
    const { data: o } = await db().from("offerings").select("fund_type").eq("id", input.offeringId).maybeSingle();
    const setup = await ensureSetup(userId, input.offeringId, o?.fund_type ?? null);
    const patch: any = { updated_at: new Date().toISOString() };
    if ("fiscalYearEnd" in input.setupFields) patch.fiscal_year_end = input.setupFields.fiscalYearEnd || null;
    if ("fundTermMonths" in input.setupFields) patch.fund_term_months = input.setupFields.fundTermMonths ?? null;
    if ("investmentPeriodMonths" in input.setupFields) patch.investment_period_months = input.setupFields.investmentPeriodMonths ?? null;
    const { error } = await db().from("fund_setups").update(patch).eq("id", setup.id);
    if (error) throw new Error("Fund setup details could not be saved.");
  }
  await (await import("@/lib/fund-setup-extras.server")).autoCompleteTasks(input.offeringId);
  return { ok: true };
}

/** The master LLC a series fund sits under, with the jurisdiction every series under it shares. */
async function loadSeriesMaster(o: { legal_entity_name?: string | null; name?: string | null }): Promise<SeriesMaster | null> {
  const src = o.legal_entity_name?.trim() || o.name || null;
  const key = seriesMasterKey(src);
  if (!key) return null;
  const [{ data: m }, { data: series }] = await Promise.all([
    db().from("series_master_entities").select("name, jurisdiction").eq("name_key", key).maybeSingle(),
    db().from("offerings").select("legal_entity_name, name").or("legal_entity_name.ilike.%series of%,name.ilike.%series of%").limit(2000),
  ]);
  const seriesCount = ((series ?? []) as any[]).filter((r) => seriesMasterKey(r.legal_entity_name?.trim() || r.name) === key).length;
  return { name: m?.name ?? seriesMasterLabel(src) ?? "", jurisdiction: m?.jurisdiction ?? null, seriesCount };
}

export async function seriesMasterForFund(userId: string, offeringId: string) {
  await assertRead(userId, offeringId);
  const { data: o } = await db().from("offerings").select("legal_entity_name, name").eq("id", offeringId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  return loadSeriesMaster(o);
}

/** Staff only: change the master's jurisdiction once; the database applies it to every series under that master and logs the change. */
export async function changeSeriesMasterJurisdiction(userId: string, input: { offeringId: string; jurisdiction: string; reason: string }) {
  const actor = await assertRead(userId, input.offeringId);
  if (!actor.isStaff) forbid("only Harmonious can change a master's jurisdiction.");
  const jurisdiction = input.jurisdiction.trim();
  const reason = input.reason.trim();
  if (!jurisdiction) throw new Error("Enter the master's jurisdiction of formation.");
  if (!reason) throw new Error("Add a short reason for the change.");
  const { data: o } = await db().from("offerings").select("legal_entity_name, name").eq("id", input.offeringId).maybeSingle();
  const src = o?.legal_entity_name?.trim() || o?.name || null;
  const key = seriesMasterKey(src);
  if (!key) throw new Error("This fund isn't a series of a master LLC.");
  const now = new Date().toISOString();
  const { data: existing } = await db().from("series_master_entities").select("id, jurisdiction").eq("name_key", key).maybeSingle();
  const res = existing
    ? await db().from("series_master_entities").update({ jurisdiction, change_reason: reason, updated_by: userId, updated_at: now }).eq("id", existing.id)
    : await db().from("series_master_entities").insert({ name_key: key, name: seriesMasterLabel(src) ?? key, jurisdiction, source: "recorded", change_reason: reason, updated_by: userId });
  if (res.error) throw new Error("The master's jurisdiction could not be saved.");
  if (!existing) await db().from("offerings").update({ state_formed: jurisdiction }).eq("id", input.offeringId);
  await (await import("@/lib/fund-setup.server")).syncFundFacts(input.offeringId);
  return { ok: true };
}

export async function previewLegalNameChange(userId: string, offeringId: string, next: string) {
  await assertStaffFor(userId, offeringId);
  const { data: o } = await db().from("offerings").select("legal_entity_name").eq("id", offeringId).maybeSingle();
  return { warning: legalNameChangeWarning({ current: o?.legal_entity_name ?? null, next, downstream: await downstreamCounts(offeringId) }) };
}

/** The only path that changes the canonical Legal Name; history is written by the database. */
export async function changeLegalName(
  userId: string,
  input: { offeringId: string; legalName: string; effectiveDate?: string | null | undefined; reason?: string | null | undefined },
) {
  await assertStaffFor(userId, input.offeringId);
  const name = input.legalName.trim();
  if (!name) throw new Error("Enter a Legal Name.");
  const { error } = await db()
    .from("offerings")
    .update({
      legal_entity_name: name,
      legal_name_changed_by: userId,
      legal_name_change_reason: input.reason ?? null,
      legal_name_effective_date: input.effectiveDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.offeringId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Saves a draft economics version (existing maker-checker applies on approval). */
export async function saveFundEconomics(
  userId: string,
  input: { offeringId: string; terms: EconomicTerms; classes: FundClass[]; changeReason?: string | null; classDifferencesConfirmed?: boolean | null },
) {
  await assertRead(userId, input.offeringId);
  const errors = [...economicsErrors(input.terms), ...classErrors(input.classes)];
  if (errors.length) throw new Error(errors[0]);
  const { data: o } = await db().from("offerings").select("fund_type, has_multiple_classes, planned_class_count").eq("id", input.offeringId).maybeSingle();
  if (!o?.has_multiple_classes && input.classes.length) throw new Error("Turn on multiple classes before adding classes.");
  if (o?.has_multiple_classes) {
    const countErr = classCountError(o.planned_class_count ?? null, input.classes);
    if (countErr) throw new Error(countErr);
    if (input.classes.length && !input.classDifferencesConfirmed) throw new Error("Confirm how each class differs from the fund default before saving.");
  }
  const setup = await ensureSetup(userId, input.offeringId, o?.fund_type ?? null);
  const { data: draft } = await db().from("fund_economics_versions").select("id").eq("setup_id", setup.id).eq("status", "draft").maybeSingle();
  const classes = input.classes.map((c) => ({ ...c, key: c.key || classKey(c.name) }));
  return saveEconomics(userId, {
    setupId: setup.id,
    terms: input.terms as Record<string, unknown>,
    classes,
    changeReason: input.changeReason ?? null,
    versionId: draft?.id,
  });
}

/** Assigns an investment to a class that exists on the fund's approved economics. */
export async function assignInvestmentClass(userId: string, input: { onboardingId: string; classKey: string | null }) {
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, stage").eq("id", input.onboardingId).maybeSingle();
  if (!row) throw new Error("Investment not found.");
  await assertStaffFor(userId, row.offering_id);
  if (["funded", "accepted", "closed"].includes(row.stage)) throw new Error("A funded or closed investment keeps the class it was admitted with.");
  const { data: o } = await db().from("offerings").select("has_multiple_classes").eq("id", row.offering_id).maybeSingle();
  const { data: setup } = await db().from("fund_setups").select("id").eq("offering_id", row.offering_id).maybeSingle();
  const { data: approved } = setup
    ? await db().from("fund_economics_versions").select("classes").eq("setup_id", setup.id).eq("status", "approved").maybeSingle()
    : { data: null };
  const err = classAssignmentError({ hasMultipleClasses: !!o?.has_multiple_classes, classes: (approved?.classes ?? []) as FundClass[], classKey: input.classKey });
  if (err) throw new Error(err);
  if (input.classKey) {
    const { classFitsAmount, hasRanges } = await import("@/lib/class-tiers");
    const classes = (approved?.classes ?? []) as FundClass[];
    const { data: amt } = await db().from("investor_onboardings").select("commitment_amount_cents, accepted_amount_cents, requested_amount_cents").eq("id", row.id).maybeSingle();
    const cents = Number(amt?.commitment_amount_cents ?? amt?.accepted_amount_cents ?? amt?.requested_amount_cents ?? 0);
    const cls = classes.find((c) => c.key === input.classKey);
    if (cls && hasRanges(classes) && cents > 0 && !classFitsAmount(cls, cents)) throw new Error(`${cls.name} does not apply to this investment amount.`);
  }
  await db().from("investor_onboardings").update({ offering_class_key: input.classKey }).eq("id", row.id);
  return { ok: true };
}

/** Harmonious services count as recorded once tax, accounting and reporting setup tasks are complete (set automatically or by staff). */
async function adminServicesRecorded(setupId: string | null | undefined) {
  if (!setupId) return false;
  const { data } = await db().from("fund_setup_tasks").select("task_key, status").eq("setup_id", setupId).in("task_key", ["tax_setup", "accounting_book", "reporting_configuration"]);
  const rows = (data ?? []) as any[];
  return rows.length > 0 && rows.every((r) => r.status === "complete");
}

/** Fund request answers and additional investor questions beside Setup (read-only). */
async function requestSetupCheck(offeringId: string, o: any, setup: any, econ: any, classes: FundClass[], hasEin: boolean, bankingStarted: boolean, inheritedJurisdiction: string | null) {
  const { checkRequestAgainstSetup, questionsStatus, checkSummary } = await import("@/lib/setup-request-check");
  const [intake, signers, team, docs, sections] = await Promise.all([
    db().from("client_fund_intakes").select("id, details, submitted_at").eq("offering_id", offeringId).neq("status", "request_draft").order("submitted_at", { ascending: false, nullsFirst: false }).limit(1),
    db().from("fund_signatories").select("person_id, title").eq("offering_id", offeringId).eq("status", "active"),
    db().from("fund_team_members").select("full_name").eq("offering_id", offeringId).is("removed_at", null),
    db().from("offering_documents").select("id", { count: "exact", head: true }).eq("offering_id", offeringId).is("removed_at", null),
    db().from("fund_questionnaire_sections").select("status, version, questions").eq("offering_id", offeringId),
  ]);
  const { data: versionFiles } = await db().from("offering_document_versions").select("file_name").eq("offering_id", offeringId).limit(500);
  const signerRows = (signers.data ?? []) as any[];
  const personIds = [...new Set([...signerRows.map((r) => r.person_id), o.fund_signatory_person_id].filter(Boolean))];
  const { data: people } = personIds.length ? await db().from("persons").select("id, legal_first_name, legal_last_name").in("id", personIds) : { data: [] };
  const signatoryNames = ((people ?? []) as any[]).map((p) => [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")).filter(Boolean);
  const terms = (econ?.terms ?? {}) as EconomicTerms;
  const providers = (setup?.service_providers && typeof setup.service_providers === "object" ? setup.service_providers : {}) as Record<string, string | null>;
  const row = ((intake.data ?? []) as any[])[0] ?? null;
  const rows = row ? checkRequestAgainstSetup(row.details, {
    legalName: o.legal_entity_name, displayName: o.name, fundType: o.fund_type, entityType: o.entity_type,
    jurisdiction: inheritedJurisdiction ?? o.state_formed, formationDate: o.date_formed, regType: o.reg_type,
    targetRaiseCents: o.target_raise_cents, minInvestmentCents: o.min_investment_cents, offeringCloseDate: o.offering_close_date,
    gpName: o.gp_entity_name, signatoryNames, signatoryTitles: [o.signatory_title, ...signerRows.map((r) => r.title)].filter(Boolean),
    teamNames: ((team.data ?? []) as any[]).map((t) => t.full_name).filter(Boolean),
    managementFeePct: terms?.managementFee?.ratePercent ?? null, carryPct: terms?.carry?.ratePercent ?? null, preferredReturnPct: (terms as any)?.preferredReturnPercent ?? null,
    fundTermMonths: setup?.fund_term_months ?? null, investmentPeriodMonths: setup?.investment_period_months ?? null,
    classNames: classes.map((c) => c.name), hasEin, bankingStarted: bankingStarted || !!o.banking_path,
    documentCount: docs.count ?? 0, serviceProviders: providers, investmentStrategy: setup?.investment_strategy ?? null,
    setupDetails: (setup?.setup_details && typeof setup.setup_details === "object" ? setup.setup_details : {}) as Record<string, unknown>,
    documentFileNames: ((versionFiles ?? []) as any[]).map((v) => String(v.file_name ?? "")).filter(Boolean),
  }) : [];
  const questions = questionsStatus((sections.data ?? []) as any[]);
  return { hasRequest: !!row, submittedAt: (row?.submitted_at ?? null) as string | null, rows, questions, summary: checkSummary(rows, questions) };
}

/** "More fund details" in Setup: request-only answers, service providers and strategy, edited in one place. */
export async function fundSetupDetails(userId: string, offeringId: string) {
  const actor = await assertRead(userId, offeringId);
  const canEdit = actor.isStaff || (await (await import("@/lib/self-serve.server")).selfServeAllows(userId, offeringId, "fund_setup"));
  const { data: s } = await db().from("fund_setups").select("id, setup_details, service_providers, investment_strategy").eq("offering_id", offeringId).maybeSingle();
  return {
    canEdit,
    hasSetup: !!s,
    details: (s?.setup_details && typeof s.setup_details === "object" ? s.setup_details : {}) as import("@/lib/fund-setup-details").SetupDetails,
    providers: (s?.service_providers && typeof s.service_providers === "object" ? s.service_providers : {}) as import("@/lib/fund-setup-details").Providers,
    investmentStrategy: (s?.investment_strategy ?? "") as string,
  };
}

export async function saveFundSetupDetails(userId: string, input: { offeringId: string; details?: Record<string, unknown> | undefined; providers?: Record<string, unknown> | undefined; investmentStrategy?: string | null | undefined }) {
  await assertStaffFor(userId, input.offeringId);
  const m = await import("@/lib/fund-setup-details");
  const { data: o } = await db().from("offerings").select("fund_type").eq("id", input.offeringId).maybeSingle();
  const setup = await ensureSetup(userId, input.offeringId, o?.fund_type ?? null);
  const { data: cur } = await db().from("fund_setups").select("setup_details, service_providers, investment_strategy").eq("id", setup.id).maybeSingle();
  const detailEdit = m.cleanSetupDetails(input.details);
  const providerEdit = m.cleanProviders(input.providers);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.keys(detailEdit).length) patch["setup_details"] = m.applyDetailEdit(cur?.setup_details ?? {}, detailEdit);
  if (Object.keys(providerEdit).length) patch["service_providers"] = m.applyProviderEdit(cur?.service_providers ?? {}, providerEdit);
  if (input.investmentStrategy !== undefined) patch["investment_strategy"] = (input.investmentStrategy ?? "").trim().slice(0, 2000) || null;
  const { error } = await db().from("fund_setups").update(patch).eq("id", setup.id);
  if (error) throw new Error("Fund details could not be saved.");
  await (await import("@/lib/fund-audit.server")).logFundAudit(userId, { offeringId: input.offeringId, eventType: "setup_details_saved", summary: "Saved more fund details", values: { ...detailEdit, ...providerEdit, ...(input.investmentStrategy !== undefined ? { investment_strategy: input.investmentStrategy } : {}) } });
  return { ok: true };
}
