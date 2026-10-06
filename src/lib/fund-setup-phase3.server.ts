/**
 * Fund Setup Phase 3 engine: Banking, EIN / SS-4, Administration & Regulatory,
 * class changes and Review. Staff write; the fund's managers read. Bank values
 * and the responsible party's identifier never leave the private database
 * functions unmasked, and never go into activity text.
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import { rpIdentifierMeta, storeRpIdentifier, stripRpTin } from "@/lib/responsible-party-identifier.server";
import {
  ADMIN_SERVICES,
  adminSection,
  bankingNotRequiredError,
  bankingSection,
  bankInstructionsReleasable,
  classChangeImpact,
  einTransitionError,
  entitySection,
  readyFor,
  ss4Missing,
  ss4Prefill,
  validEin,
  type AdminService,
  type BankVersion,
  type BankingPath,
  type EinPath,
  type EinStatus,
  type FilingResponsibility,
  type HarmoniousBankStatus,
  type ServiceChoice,
} from "@/lib/fund-setup-phase3";

const db = () => supabaseAdmin as any;

async function assertRead(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}
async function assertStaff(userId: string, offeringId: string) {
  const a = await assertRead(userId, offeringId);
  if (!a.isStaff) forbid("only Harmonious can change Fund Setup.");
  return a;
}

async function setupId(offeringId: string): Promise<string | null> {
  const { data } = await db().from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle();
  return data?.id ?? null;
}

/** Payload-free activity entry. Never pass bank numbers, EINs or identifiers here. */
async function activity(offeringId: string, userId: string, event: string, summary: string, from?: string | null, to?: string | null) {
  await db().from("fund_setup_events").insert({
    setup_id: await setupId(offeringId),
    subject_table: "offerings",
    subject_id: offeringId,
    event,
    from_status: from ?? null,
    to_status: to ?? null,
    detail: { summary },
    actor_user_id: userId,
    actor_role: "harmonious",
  });
}

async function offering(offeringId: string) {
  const { data } = await db().from("offerings").select("*").eq("id", offeringId).maybeSingle();
  if (!data) throw new Error("Fund not found.");
  return data;
}

async function bankVersions(sb: any, offeringId: string) {
  const { data, error } = await sb.rpc("list_bank_instruction_versions", { p_offering_id: offeringId });
  if (error) throw new Error("Bank instructions couldn't be loaded.");
  return ((data ?? []) as any[]).map((v) => ({
    version: v.version as number,
    status: v.status as BankVersion["status"],
    ownershipReview: v.ownership_review as BankVersion["ownershipReview"],
    bankName: v.bank_name as string | null,
    accountName: v.account_name as string | null,
    accountMasked: v.account_last4 ? `••••${v.account_last4}` : "",
    routingMasked: v.routing_last4 ? `••••${v.routing_last4}` : "",
    hasSwift: !!v.has_swift,
    hasForFurtherCredit: !!v.has_ffc,
    hasWireDocument: !!v.wire_document_id,
    verifiedAt: v.verified_at as string | null,
    verificationMethod: v.verification_method as string | null,
    rejectionReason: v.rejection_reason as string | null,
    ownershipExplanation: v.ownership_explanation as string | null,
    createdAt: v.created_at as string,
  }));
}

async function controlledDocs(offeringId: string, docType: string) {
  const sid = await setupId(offeringId);
  if (!sid) return [];
  const { data } = await db().from("fund_setup_documents").select("id, version, is_current, uploaded_by, created_at, title").eq("setup_id", sid).eq("doc_type", docType).order("version", { ascending: false });
  return (data ?? []) as any[];
}

export async function phase3Overview(sb: any, userId: string, offeringId: string) {
  const actor = await assertRead(userId, offeringId);
  const o = await offering(offeringId);
  const [versions, einLetters, { data: detail }, setup] = await Promise.all([
    bankVersions(sb, offeringId),
    controlledDocs(offeringId, "ein_letter"),
    sb.rpc("get_offering_entity_details", { p_offering_id: offeringId }).maybeSingle(),
    db().from("fund_setups").select("id, fiscal_year_end").eq("offering_id", offeringId).maybeSingle(),
  ]);
  const hasEin = !!(detail as any)?.ein;
  const ss4: any = (detail as any)?.ss4 ?? {};
  const prefill = ss4Prefill({
    legalName: o.legal_entity_name,
    entityType: o.entity_type,
    jurisdiction: o.state_formed,
    formationDate: o.date_formed,
    principalAddress: o.principal_address,
    fiscalYearEnd: setup.data?.fiscal_year_end ?? null,
    gpName: o.gp_entity_name,
  });
  const merged = { ...ss4, ...prefill };
  const rpMeta = await rpIdentifierMeta(offeringId);
  const hasRpTin = rpMeta.onFile;
  const missing = ss4Missing({ ...merged, responsible_party_tin: hasRpTin ? "x" : "" }, {
    hasEmployees: Number(ss4.employees_other ?? 0) + Number(ss4.employees_household ?? 0) + Number(ss4.employees_agricultural ?? 0) > 0,
    usesDesignee: !!String(ss4.designee_name ?? "").trim(),
  });

  // Signing-readiness facts from Phase 2 Offering Documents.
  const { data: subDoc } = await db().from("offering_documents").select("id, usage, active_version").eq("offering_id", offeringId).eq("document_category", "subscription_agreement").maybeSingle();
  const { data: subVer } = subDoc?.active_version
    ? await db().from("offering_document_versions").select("signing_config, signing_config_status").eq("offering_document_id", subDoc.id).eq("version", subDoc.active_version).maybeSingle()
    : { data: null };
  const subscriptionReady = !!subDoc?.active_version && (subDoc.usage !== "signature" || subVer?.signing_config_status === "confirmed");
  const countersignRequired = !!(subVer?.signing_config?.signers ?? []).some((s: any) => s.role === "fund_signatory");
  const { data: econ } = setup.data ? await db().from("fund_economics_versions").select("id").eq("setup_id", setup.data.id).eq("status", "approved").limit(1) : { data: [] };

  const banking = bankingSection({ path: o.banking_path, harmoniousStatus: o.harmonious_bank_status, versions });
  const entity = entitySection({ path: o.ein_path, hasEin, hasEinLetter: einLetters.some((d) => d.is_current), status: o.ein_workflow_status, basicsComplete: !!(o.entity_type && o.state_formed && o.date_formed) });
  const services = (o.admin_services ?? {}) as Partial<Record<AdminService, ServiceChoice>>;
  const admin = adminSection({ services, formD: o.form_d_responsibility, blueSky: o.blue_sky_responsibility, regType: o.reg_type });

  const { data: events } = actor.isStaff
    ? await db().from("fund_setup_events").select("event, detail, created_at").eq("subject_table", "offerings").eq("subject_id", offeringId).order("created_at", { ascending: false }).limit(30)
    : { data: [] };

  return {
    canEdit: actor.isStaff,
    banking: {
      path: o.banking_path as BankingPath | null,
      notRequiredReason: actor.isStaff ? o.banking_not_required_reason : null,
      harmoniousStatus: o.harmonious_bank_status as HarmoniousBankStatus | null,
      versions: actor.isStaff ? versions : versions.map((v) => ({ ...v, rejectionReason: null, ownershipExplanation: null })),
      releasable: bankInstructionsReleasable(versions),
      section: banking,
    },
    ein: {
      path: o.ein_path as EinPath | null,
      status: o.ein_workflow_status as EinStatus | null,
      hasEin,
      einMasked: hasEin ? `••-•••${String((detail as any).ein).replace(/\D/g, "").slice(-4)}` : "",
      letters: einLetters.map((d) => ({ id: d.id, version: d.version, current: d.is_current, uploadedAt: d.created_at })),
      responsiblePersonId: o.ss4_responsible_person_id as string | null,
      ss4Prefilled: Object.keys(prefill),
      ss4Missing: missing,
      ss4Answers: (actor.isStaff ? stripRpTin(ss4) : {}) as Record<string, string | boolean>,
      hasResponsiblePartyTin: hasRpTin,
      responsiblePartyTinLast4: actor.isStaff ? rpMeta.last4 : null,
      section: entity,
    },
    admin: { services, formD: o.form_d_responsibility as FilingResponsibility | null, blueSky: o.blue_sky_responsibility as FilingResponsibility | null, regType: o.reg_type as string | null, section: admin },
    ready: readyFor({
      isOpen: !!o.is_open,
      legalName: !!o.legal_entity_name,
      regType: !!o.reg_type,
      economicsApproved: (econ ?? []).length > 0,
      subscriptionReady,
      subscriptionRequired: true,
      signatoryChosen: !!o.fund_signatory_person_id,
      countersignRequired,
      bankingReleasable: bankInstructionsReleasable(versions),
      bankingNotRequired: o.banking_path === "not_required",
    }),
    activity: ((events ?? []) as any[]).map((e) => ({ event: e.event, summary: String(e.detail?.summary ?? e.event), at: e.created_at })),
  };
}

// ------------------------------------------------------------------ banking

export async function setBankingPath(userId: string, input: { offeringId: string; path: BankingPath; reason?: string | null | undefined }) {
  await assertStaff(userId, input.offeringId);
  const o = await offering(input.offeringId);
  if (input.path === "not_required") {
    const { count } = await db().from("investor_onboardings").select("id", { count: "exact", head: true }).eq("offering_id", input.offeringId).is("removed_at", null);
    const err = bankingNotRequiredError({ reason: input.reason, hasInvestments: (count ?? 0) > 0 });
    if (err) throw new Error(err);
  }
  await db().from("offerings").update({
    banking_path: input.path,
    banking_not_required_reason: input.path === "not_required" ? input.reason : null,
    // Choosing Harmonious never implies an account exists.
    harmonious_bank_status: input.path === "harmonious" ? (o.harmonious_bank_status ?? "not_started") : o.harmonious_bank_status,
  }).eq("id", input.offeringId);
  await activity(input.offeringId, userId, "banking_path_set", "Banking approach chosen", o.banking_path, input.path);
  return { ok: true };
}

export async function setHarmoniousBankStatus(sb: any, userId: string, input: { offeringId: string; status: HarmoniousBankStatus }) {
  await assertStaff(userId, input.offeringId);
  const o = await offering(input.offeringId);
  if (o.banking_path !== "harmonious") throw new Error("This fund isn't using a Harmonious-established account.");
  if (input.status === "funding_instructions_ready" && !bankInstructionsReleasable(await bankVersions(sb, input.offeringId))) {
    throw new Error("Verify the wire instructions before marking funding instructions ready.");
  }
  await db().from("offerings").update({ harmonious_bank_status: input.status }).eq("id", input.offeringId);
  await activity(input.offeringId, userId, "bank_status_changed", "Bank account setup status updated", o.harmonious_bank_status, input.status);
  return { ok: true };
}

export async function saveBankDetails(sb: any, userId: string, input: { offeringId: string; details: Record<string, string> }) {
  await assertStaff(userId, input.offeringId);
  const details = Object.fromEntries(Object.entries(input.details).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v !== ""));
  const { error } = await sb.rpc("save_wire_instructions", { p_offering_id: input.offeringId, p_details: details });
  if (error) throw new Error("The bank details couldn't be saved.");
  await activity(input.offeringId, userId, "bank_instructions_entered", "New bank instructions entered - pending verification");
  return { ok: true };
}

export async function attachWireDocument(sb: any, userId: string, input: { offeringId: string; version: number; filePath: string }) {
  await assertStaff(userId, input.offeringId);
  if (!input.filePath.startsWith(`fund-setup-restricted/${input.offeringId}/`)) throw new Error("That file does not belong to this fund.");
  const docId = await addControlledDoc(userId, input.offeringId, "wire_instructions", "Wire Instructions", input.filePath);
  const { error } = await sb.rpc("review_bank_instruction_version", { p_offering_id: input.offeringId, p_version: input.version, p_decision: "attach_document", p_method: null, p_note: null, p_wire_document_id: docId });
  if (error) throw new Error(error.message);
  await activity(input.offeringId, userId, "wire_document_uploaded", `Wire instructions document attached to version ${input.version}`);
  return { ok: true };
}

export async function reviewBankVersion(sb: any, userId: string, input: { offeringId: string; version: number; decision: "verify" | "reject" | "accept_ownership"; method?: string | null | undefined; note?: string | null | undefined }) {
  await assertStaff(userId, input.offeringId);
  const { error } = await sb.rpc("review_bank_instruction_version", { p_offering_id: input.offeringId, p_version: input.version, p_decision: input.decision, p_method: input.method ?? null, p_note: input.note ?? null, p_wire_document_id: null });
  if (error) throw new Error(error.message);
  const label = input.decision === "verify" ? "Bank instructions verified" : input.decision === "reject" ? "Bank instructions returned for correction" : "Account ownership accepted after review";
  await activity(input.offeringId, userId, `bank_${input.decision}`, `${label} (version ${input.version})`);
  return { ok: true };
}

// ------------------------------------------------------------------ controlled documents

async function addControlledDoc(userId: string, offeringId: string, docType: string, title: string, path: string): Promise<string> {
  const sid = await setupId(offeringId);
  if (!sid) throw new Error("Save the Fund Details first so a setup record exists.");
  const existing = await controlledDocs(offeringId, docType);
  const current = existing.find((d) => d.is_current);
  if (current) await db().from("fund_setup_documents").update({ is_current: false }).eq("id", current.id);
  const { data, error } = await db().from("fund_setup_documents").insert({
    setup_id: sid,
    doc_type: docType,
    title,
    storage_path: path,
    version: (existing[0]?.version ?? 0) + 1,
    is_current: true,
    status: "uploaded",
    investor_facing: false,
    uploaded_by: userId,
    uploaded_role: "harmonious",
    supersedes_id: current?.id ?? null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

// ------------------------------------------------------------------ EIN / SS-4

export async function setEinPath(userId: string, input: { offeringId: string; path: EinPath }) {
  await assertStaff(userId, input.offeringId);
  const o = await offering(input.offeringId);
  await db().from("offerings").update({ ein_path: input.path, ein_workflow_status: input.path === "harmonious" ? (o.ein_workflow_status ?? "information_needed") : o.ein_workflow_status }).eq("id", input.offeringId);
  await activity(input.offeringId, userId, "ein_path_set", input.path === "harmonious" ? "Harmonious will obtain the EIN" : "Fund already has an EIN");
  return { ok: true };
}

async function writeEntity(sb: any, offeringId: string, patch: { ein?: string; ss4?: Record<string, unknown> }) {
  const { data: cur } = await sb.rpc("get_offering_entity_details", { p_offering_id: offeringId }).maybeSingle();
  const ein = patch.ein ?? (cur as any)?.ein ?? "";
  const ss4 = patch.ss4 ?? ((cur as any)?.ss4 ?? {});
  const { error } = await sb.rpc("save_offering_entity_details", { p_offering_id: offeringId, p_has_ein: !!ein, p_ein: ein, p_ss4: ss4 });
  if (error) throw new Error("Entity details couldn't be saved.");
}

/** Records a real EIN (existing, or received from the IRS). An IRS letter is required. */
export async function recordEin(sb: any, userId: string, input: { offeringId: string; ein: string; letterPath?: string | null | undefined; received: boolean }) {
  await assertStaff(userId, input.offeringId);
  if (!validEin(input.ein)) throw new Error("Enter the 9-digit EIN.");
  if (input.letterPath && !input.letterPath.startsWith(`fund-setup-restricted/${input.offeringId}/`)) throw new Error("That file does not belong to this fund.");
  const o = await offering(input.offeringId);
  if (input.received && o.ein_workflow_status !== "submitted" && o.ein_workflow_status !== "needs_attention") {
    throw new Error("Mark the SS-4 as submitted before recording the EIN the IRS issued.");
  }
  const digits = input.ein.replace(/\D/g, "");
  await writeEntity(sb, input.offeringId, { ein: `${digits.slice(0, 2)}-${digits.slice(2)}` });
  const extras = await import("@/lib/fund-setup-extras.server");
  if (input.letterPath) {
    const letterId = await addControlledDoc(userId, input.offeringId, "ein_letter", "IRS EIN Letter", input.letterPath);
    const sid = await setupId(input.offeringId);
    if (sid) await extras.linkEvidence(userId, sid, "ein_letter", null, letterId);
  } else {
    // No IRS letter: a signed W-9 is the substitute evidence. Create one open follow-up task (idempotent by title).
    const title = "Upload signed W-9 (no EIN letter on file)";
    const { data: existing } = await db().from("staff_tasks").select("id").eq("offering_id", input.offeringId).eq("title", title).neq("status", "done").limit(1);
    if (!existing?.length) {
      await db().from("staff_tasks").insert({
        title, description: "The EIN was saved without the IRS EIN letter. Have the fund sign a W-9 and upload it to the fund's documents (or upload the EIN letter when available).",
        priority: "high", status: "open", created_by: userId, team: "operations", offering_id: input.offeringId,
      } as any).then(() => undefined, () => undefined);
    }
  }
  if (input.received) await db().from("offerings").update({ ein_workflow_status: "ein_received" }).eq("id", input.offeringId);
  await activity(input.offeringId, userId, input.received ? "ein_received" : "ein_recorded", input.letterPath ? (input.received ? "EIN received from the IRS and recorded" : "Existing EIN recorded with IRS letter") : "EIN recorded without IRS letter; signed W-9 requested", o.ein_workflow_status, input.received ? "ein_received" : o.ein_workflow_status);
  await extras.autoCompleteTasks(input.offeringId);
  return { ok: true, w9Requested: !input.letterPath };
}

export async function saveSs4(sb: any, userId: string, input: { offeringId: string; answers: Record<string, unknown>; responsiblePersonId?: string | null | undefined; responsiblePartyTin?: string | null | undefined }) {
  await assertStaff(userId, input.offeringId);
  const { data: cur } = await sb.rpc("get_offering_entity_details", { p_offering_id: input.offeringId }).maybeSingle();
  const prev: any = (cur as any)?.ss4 ?? {};
  // Identifier goes to the encrypted vault first; it never enters SS-4 JSON.
  if (input.responsiblePartyTin) await storeRpIdentifier(input.offeringId, input.responsiblePartyTin, userId);
  const next: any = stripRpTin({ ...prev, ...input.answers });
  await writeEntity(sb, input.offeringId, { ss4: next });
  if (input.responsiblePersonId !== undefined) {
    if (input.responsiblePersonId) {
      const { data: p } = await db().from("persons").select("id").eq("id", input.responsiblePersonId).maybeSingle();
      if (!p) throw new Error("That person was not found.");
    }
    await db().from("offerings").update({ ss4_responsible_person_id: input.responsiblePersonId || null }).eq("id", input.offeringId);
  }
  await activity(input.offeringId, userId, "ss4_saved", "SS-4 information saved (draft)");
  return { ok: true };
}

export async function setEinStatus(sb: any, userId: string, input: { offeringId: string; status: EinStatus }) {
  await assertStaff(userId, input.offeringId);
  const o = await offering(input.offeringId);
  if (o.ein_path !== "harmonious") throw new Error("This fund isn't using the Harmonious SS-4 workflow.");
  const err = einTransitionError(o.ein_workflow_status, input.status);
  if (err) throw new Error(err);
  const patch: any = { ein_workflow_status: input.status };
  if (input.status === "ready_for_review" || input.status === "ready_for_submission") {
    const { data: cur } = await sb.rpc("get_offering_entity_details", { p_offering_id: input.offeringId }).maybeSingle();
    const ss4: any = (cur as any)?.ss4 ?? {};
    if (input.status === "ready_for_review") {
      const missing = ss4Missing(ss4, { hasEmployees: false, usesDesignee: !!String(ss4.designee_name ?? "").trim() });
      if (missing.length) throw new Error("Some SS-4 information is still missing.");
    }
    // Snapshot fingerprint of the answers used; no values stored here.
    patch.ss4_snapshot_hash = createHash("sha256").update(JSON.stringify(ss4)).digest("hex");
    patch.ss4_generated_form_version = "IRS Form SS-4 (bundled official PDF)";
  }
  await db().from("offerings").update(patch).eq("id", input.offeringId);
  await activity(input.offeringId, userId, "ein_status_changed", input.status === "submitted" ? "SS-4 submitted to the IRS" : "EIN workflow status updated", o.ein_workflow_status, input.status);
  return { ok: true };
}

// ------------------------------------------------------------------ administration

export async function saveAdministration(userId: string, input: { offeringId: string; services: Partial<Record<AdminService, ServiceChoice>>; formD: FilingResponsibility | null; blueSky: FilingResponsibility | null }) {
  await assertStaff(userId, input.offeringId);
  const services = Object.fromEntries(Object.entries(input.services).filter(([k]) => (ADMIN_SERVICES as readonly string[]).includes(k)));
  await db().from("offerings").update({ admin_services: services, form_d_responsibility: input.formD, blue_sky_responsibility: input.blueSky }).eq("id", input.offeringId);
  await activity(input.offeringId, userId, "administration_configured", "Administration and regulatory responsibilities updated");
  return { ok: true };
}

// ------------------------------------------------------------------ classes

async function classFacts(onboardingId: string) {
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, stage, application_id, investment_profile_id, funding_status, offering_class_key").eq("id", onboardingId).maybeSingle();
  if (!row) throw new Error("Investment not found.");
  const { data: docs } = await db().from("offering_documents").select("id").eq("offering_id", row.offering_id).not("active_version", "is", null);
  const ors = [row.application_id && `application_id.eq.${row.application_id}`, row.investment_profile_id && `investment_profile_id.eq.${row.investment_profile_id}`].filter(Boolean).join(",");
  const { count: signed } = ors
    ? await db().from("document_signatures").select("id", { count: "exact", head: true }).or(ors).not("provider_completed_at", "is", null)
    : { count: 0 };
  return {
    row,
    facts: {
      stage: String(row.stage ?? ""),
      applicableDocuments: (docs ?? []).length,
      signedDocuments: signed ?? 0,
      hasFundingActivity: !!row.funding_status && !["not_started", "none"].includes(String(row.funding_status)),
    },
  };
}

export async function previewClassChange(userId: string, input: { onboardingId: string }) {
  const { row, facts } = await classFacts(input.onboardingId);
  await assertStaff(userId, row.offering_id);
  return { current: row.offering_class_key as string | null, ...classChangeImpact(facts) };
}

export async function changeInvestmentClass(userId: string, input: { onboardingId: string; classKey: string | null; acknowledged: boolean }) {
  const { row, facts } = await classFacts(input.onboardingId);
  await assertStaff(userId, row.offering_id);
  if ((row.offering_class_key ?? null) === (input.classKey ?? null)) return { ok: true };
  const impact = classChangeImpact(facts);
  if (row.offering_class_key && impact.blocked) {
    throw new Error("This investment has signed documents, funding or is closed, so its class can't be changed here. Harmonious must review it.");
  }
  if (impact.warnings.length && !input.acknowledged) throw new Error("Review the impact before changing the class.");
  const { assignInvestmentClass } = await import("@/lib/fund-setup-canonical.server");
  await assignInvestmentClass(userId, { onboardingId: input.onboardingId, classKey: input.classKey });
  await activity(row.offering_id, userId, "investment_class_assigned", "An investment's class was assigned", row.offering_class_key, input.classKey);
  return { ok: true };
}

export async function classAssignments(userId: string, offeringId: string) {
  await assertStaff(userId, offeringId);
  const { data: setup } = await db().from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle();
  const { data: approved } = setup
    ? await db().from("fund_economics_versions").select("classes, terms").eq("setup_id", setup.id).eq("status", "approved").maybeSingle()
    : { data: null };
  const { data: rows } = await db().from("investor_onboardings").select("id, person_id, offering_class_key, stage, requested_amount_cents").eq("offering_id", offeringId).is("removed_at", null);
  const personIds = ((rows ?? []) as any[]).map((r) => r.person_id).filter(Boolean);
  const { data: people } = personIds.length ? await db().from("persons").select("id, legal_first_name, legal_last_name").in("id", personIds) : { data: [] };
  const name = new Map(((people ?? []) as any[]).map((p) => [p.id, [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")]));
  return {
    classes: ((approved?.classes ?? []) as any[]).map((c) => ({ key: c.key, name: c.name, managementFee: c.managementFee ?? null, carry: c.carry ?? null, minInvestmentCents: c.minInvestmentCents ?? null })),
    defaults: approved?.terms ?? null,
    investments: ((rows ?? []) as any[]).map((r) => ({ id: r.id, investor: name.get(r.person_id) || "Investor", classKey: r.offering_class_key as string | null, stage: r.stage as string })),
  };
}

/** Harmonious-only: funds whose current wire instructions await second-person verification. */
export async function pendingWireVerifications(sb: any, userId: string) {
  const { data: staff } = await sb.rpc("is_any_staff");
  if (!staff) forbid("only Harmonious can review wire instructions.");
  const { data: offerings } = await db().from("offerings").select("id, name").order("name");
  const out: { offeringId: string; fundName: string; version: number; hasDocument: boolean; ownershipReview: string | null }[] = [];
  for (const o of (offerings ?? []) as any[]) {
    const versions = await bankVersions(sb, o.id).catch(() => []);
    const cur = versions[0];
    if (cur && cur.status === "pending_verification") {
      out.push({ offeringId: o.id, fundName: o.name, version: cur.version, hasDocument: cur.hasWireDocument, ownershipReview: cur.ownershipReview ?? null });
    }
  }
  return out;
}
