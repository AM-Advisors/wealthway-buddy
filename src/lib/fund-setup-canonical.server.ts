/**
 * Canonical Fund Setup engine. Reads and writes the offering row (Legal Name,
 * entity, signatory, offering terms) and reuses the existing versioned
 * economics in fund-setup.server (maker-checker). Staff edit; managers of the
 * exact fund read. Nothing here touches banking, documents, signatures or money.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
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

const db = () => supabaseAdmin as any;

async function assertRead(userId: string, offeringId: string) {
  const actor = await setupActor(userId);
  if (!actor.isStaff && !actor.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return actor;
}
async function assertStaffFor(userId: string, offeringId: string) {
  const actor = await assertRead(userId, offeringId);
  if (!actor.isStaff) forbid("only Harmonious can change canonical fund setup.");
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
  const [econ, docs, banking, managers, history] = await Promise.all([
    setup ? db().from("fund_economics_versions").select("*").eq("setup_id", setup.id).order("version", { ascending: false }) : { data: [] },
    setup ? db().from("fund_setup_documents").select("id").eq("setup_id", setup.id).eq("is_current", true) : { data: [] },
    db().from("offering_bank_setup_requests").select("status").eq("offering_id", offeringId),
    db().from("fund_managers").select("user_id").eq("offering_id", offeringId),
    actor.isStaff
      ? db().from("offering_legal_name_history").select("*").eq("offering_id", offeringId).order("changed_at", { ascending: false })
      : { data: [] },
  ]);
  const versions = (econ.data ?? []) as any[];
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
  const statuses = sectionStatuses({
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
    jurisdiction: o.state_formed,
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
    documentCount: (docs.data ?? []).length,
    bankingState,
    adminConfigured: false,
  });

  return {
    canEdit: actor.isStaff,
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
      taxClassification: o.tax_classification,
      regType: o.reg_type,
      targetRaiseCents: o.target_raise_cents,
      maxOfferingCents: o.max_offering_cents,
      minInvestmentCents: o.min_investment_cents,
      maxInvestmentCents: o.max_investment_cents,
      offeringOpenDate: o.offering_open_date,
      offeringCloseDate: o.offering_close_date,
      rollingCloses: o.rolling_closes,
      hasMultipleClasses: !!o.has_multiple_classes,
    },
    setup: setup
      ? { id: setup.id, fiscalYearEnd: setup.fiscal_year_end, fundTermMonths: setup.fund_term_months, investmentPeriodMonths: setup.investment_period_months }
      : null,
    termApplies: termApplies(o.fund_type),
    economics: {
      versionId: current?.id ?? null,
      status: current?.status ?? null,
      version: current?.version ?? null,
      approvedVersion: approved?.version ?? null,
      preparedByMe: current?.prepared_by === userId,
      terms,
      classes,
    },
    signatoryOptions,
    statuses,
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
  taxClassification: "tax_classification",
  regType: "reg_type",
  targetRaiseCents: "target_raise_cents",
  maxOfferingCents: "max_offering_cents",
  minInvestmentCents: "min_investment_cents",
  maxInvestmentCents: "max_investment_cents",
  offeringOpenDate: "offering_open_date",
  offeringCloseDate: "offering_close_date",
  rollingCloses: "rolling_closes",
  hasMultipleClasses: "has_multiple_classes",
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
  await assertStaffFor(userId, input.offeringId);
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
    await db().from("fund_setups").update(patch).eq("id", setup.id);
  }
  await (await import("@/lib/fund-setup-extras.server")).autoCompleteTasks(input.offeringId);
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
  input: { offeringId: string; terms: EconomicTerms; classes: FundClass[]; changeReason?: string | null },
) {
  await assertStaffFor(userId, input.offeringId);
  const errors = [...economicsErrors(input.terms), ...classErrors(input.classes)];
  if (errors.length) throw new Error(errors[0]);
  const { data: o } = await db().from("offerings").select("fund_type, has_multiple_classes").eq("id", input.offeringId).maybeSingle();
  if (!o?.has_multiple_classes && input.classes.length) throw new Error("Turn on multiple classes before adding classes.");
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
  await db().from("investor_onboardings").update({ offering_class_key: input.classKey }).eq("id", row.id);
  return { ok: true };
}
