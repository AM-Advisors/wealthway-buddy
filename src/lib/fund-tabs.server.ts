/**
 * Fund page tabs (To dos, Team, Documents, Banking, Investors, close details).
 * Server-only. Every call re-checks fund access; fee changes after any investor
 * has signed need Harmonious approval; signed documents can never be deleted;
 * bookkeeping corrections are voids, never edits. Nothing here moves money,
 * files anything or sends email.
 */
import { investorSteps } from "@/lib/investor-step-status";
import { currentProfileTaxDetails } from "@/lib/profile-tax-details.server";
import { canonicalFundingState, CANONICAL_FUNDING_LABELS, isReconciledFunding } from "@/lib/funding-status";

export const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];
const SIGNED_STAGES = new Set(["harmonious_review", "accepted", "approved_to_fund", "awaiting_funds", "funded", "closed"]);

export async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function isStaff(uid: string) {
  const { data } = await (await db()).from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role));
}

export async function assertFund(uid: string, fundId: string) {
  const d = await db();
  if (await isStaff(uid)) return { staff: true };
  const { data: mgr } = await d.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", fundId).maybeSingle();
  if (mgr) return { staff: false };
  const { isClientMemberOfFund } = await import("@/lib/fund-cap-table.functions");
  if (await isClientMemberOfFund(d, uid, fundId)) return { staff: false };
  throw new Error("You don't have access to this Fund.");
}

const personName = (p: any) => (p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "") || "Unnamed investor";

export function docStatus(o: any, outside?: { marked: boolean; complete: boolean } | null) {
  if (o.executed_snapshot || SIGNED_STAGES.has(o.stage)) return "Signed";
  if (outside?.complete) return "Signed (outside platform)";
  if (outside?.marked) return "Signed outside: copy pending";
  if (o.stage === "signature") return "Out for signature";
  return "Not started";
}

export async function anyInvestorSigned(fundId: string) {
  const { data } = await (await db()).from("investor_onboardings").select("stage, executed_snapshot").eq("offering_id", fundId).is("removed_at", null);
  return ((data ?? []) as any[]).some((o) => docStatus(o) === "Signed");
}

/* ---------------- Investors ---------------- */

export async function investorGrid(fundId: string) {
  const { data: fund, error: fundError } = await (await db()).from("offerings").select("has_multiple_classes").eq("id", fundId).maybeSingle();
  if (fundError) throw new Error("Fund class settings could not be loaded. Please try again.");
  const classApplicable = fund?.has_multiple_classes === true;
  const fundRelease = await (await import("@/lib/wire-release.server")).wireReleaseState(fundId).catch(() => ({ available: false }));
  const { data } = await (await db()).from("investor_onboardings")
    .select("id, stage, funding_status, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, funded_amount_cents, approved_to_fund_at, funding_released_at, executed_snapshot, last_activity_at, updated_at, person_id, investment_profile_id, application_id, investor_user_id, offering_class_key, questionnaire_submitted_at, investment_profiles(legal_name, profile_type, tax_id_last4)")
    .eq("offering_id", fundId).is("removed_at", null).order("created_at");
  // No foreign key from investor_onboardings.person_id, so persons are loaded separately.
  const ids = [...new Set(((data ?? []) as any[]).map((o) => o.person_id).filter(Boolean))];
  const { data: people } = ids.length
    ? await (await db()).from("persons").select("id, legal_first_name, legal_last_name, preferred_name, email, phone, kyc_status, aml_status, date_of_birth, citizenship_country, address_line1, city, postal_code, tax_id_last4").in("id", ids)
    : { data: [] as any[] };
  const byId = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  const outsideStates = await (await import("@/lib/prior-signed-documents.server")).outsideSubscriptionStates(await db(), ((data ?? []) as any[]).map((o) => o.id));
  const profileIds = [...new Set(((data ?? []) as any[]).map((o) => o.investment_profile_id).filter(Boolean))] as string[];
  const taxDetails = await currentProfileTaxDetails(await db(), profileIds);
  const { data: checks, error: checksError } = ids.length
    ? await (await db()).from("kyc_verifications").select("person_id, verified_date_of_birth, decision, completed_at").in("person_id", ids).eq("status", "approved").order("completed_at", { ascending: false })
    : { data: [] as any[], error: null };
  if (checksError) throw new Error("Verified investor details could not be loaded. Please try again.");
  const verifiedByPerson = new Map<string, any>();
  for (const check of (checks ?? []) as any[]) {
    if (check.completed_at && !verifiedByPerson.has(check.person_id)) verifiedByPerson.set(check.person_id, check);
  }
  const human = (s: string | null | undefined) => s ? s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  return ((data ?? []) as any[]).map((o) => {
    const p = byId.get(o.person_id) ?? {};
    const entity = !!o.investment_profiles?.profile_type && o.investment_profiles.profile_type !== "individual";
    const verified = verifiedByPerson.get(o.person_id);
    const identity = verified?.decision?.id_verification ?? verified?.decision?.id_verifications?.[0];
    const dateOfBirth = verified?.verified_date_of_birth || p.date_of_birth || null;
    // Nationality is citizenship; an ID's issuing country is not citizenship.
    const citizenship = identity?.nationality || p.citizenship_country || null;
    // An entity's EIN must never fall back to its signer's personal tax ID.
    const taxIdLast4 = taxDetails.get(o.investment_profile_id)?.last4 || o.investment_profiles?.tax_id_last4 || (!entity ? p.tax_id_last4 : null) || null;
    const kyc = p.kyc_status ?? "not_started";
    const aml = p.aml_status ?? "not_started";
    const funding = canonicalFundingState({ fundingStatus: o.funding_status, approvedToFund: !!o.approved_to_fund_at, instructionsReleased: !!o.approved_to_fund_at && fundRelease.available });
    const kycOk = ["verified", "approved", "passed", "clear"].includes(kyc) && ["clear", "passed", "approved", "verified"].includes(aml);
    const committedCents = o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents ?? null;
    const docs = docStatus(o, outsideStates.get(o.id));
    // Display-only checklist of what the fund manager still needs to collect.
    const missing: string[] = [];
    if (!o.investment_profiles?.profile_type) missing.push("Investing as (asset type)");
    if (!p.email) missing.push("Email");
    if (!p.phone) missing.push("Phone");
    if (!p.address_line1 || !p.city || !p.postal_code) missing.push("Address");
    if (!dateOfBirth && !entity) missing.push("Date of birth");
    if (!taxIdLast4) missing.push("Tax ID");
    if (!committedCents) missing.push("Commitment amount");
    if (!o.questionnaire_submitted_at) missing.push("Questionnaire");
    if (!kycOk) missing.push(entity ? "KYB/AML check" : "KYC/AML check");
    if (docs !== "Signed") missing.push("Signed subscription");
    return {
      id: o.id as string,
      name: personName(p),
      profileName: o.investment_profiles?.legal_name ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      dateOfBirth,
      citizenship,
      taxIdLast4,
      classApplicable,
      classLabel: human(o.offering_class_key) ?? "Fund default terms",
      assetLabel: human(o.investment_profiles?.profile_type),
      missing,
      committedCents,
      receivedCents: isReconciledFunding(o.funding_status) ? o.funded_amount_cents ?? null : null,
      kycLabel: `${entity ? "KYB" : "KYC"}/AML: ${String(kyc).replace(/_/g, " ")} / ${String(aml).replace(/_/g, " ")}`,
      kycOk,
      docs,
      wiring: CANONICAL_FUNDING_LABELS[funding],
      steps: investorSteps({ stage: o.stage, claimed: !!o.investor_user_id, profileChosen: !!o.investment_profiles?.profile_type, questionnaireDone: !!o.questionnaire_submitted_at,
        kyc, aml, signed: docs === "Signed" || docs === "Signed (outside platform)", outForSignature: docs === "Out for signature", funding }),
      lastActivity: o.last_activity_at ?? o.updated_at ?? null,
      stage: o.stage as string,
      applicationId: o.application_id ?? null,
      investorUserId: o.investor_user_id ?? null,
    };
  });
}

export async function investorDetail(fundId: string, onboardingId: string) {
  const d = await db();
  const { data: o } = await d.from("investor_onboardings")
    .select("*, investment_profiles(legal_name, profile_type)")
    .eq("id", onboardingId).eq("offering_id", fundId).maybeSingle();
  if (!o) throw new Error("That investor is not in this fund.");
  if (o.person_id) {
    const { data: person } = await d.from("persons").select("*").eq("id", o.person_id).maybeSingle();
    (o as any).persons = person ?? null;
  }
  const [{ data: letters }, { data: tasks }, { data: docs }] = await Promise.all([
    d.from("side_letters").select("id, status, effective_date, terms").eq("onboarding_id", onboardingId),
    d.from("investment_readiness_tasks").select("title, resolved_at").eq("onboarding_id", onboardingId).order("created_at"),
    o.application_id ? d.from("investor_documents").select("id, file_name, doc_kind, uploaded_at, review_status").eq("application_id", o.application_id) : Promise.resolve({ data: [] }),
  ]);
  const p = o.persons ?? {};
  const grid = (await investorGrid(fundId)).find((r) => r.id === onboardingId);
  if (!grid) throw new Error("That investor is not available in this fund.");
  return {
    ...grid,
    address: [p.address_line1, p.address_line2, p.city, p.region, p.postal_code, p.country].filter(Boolean).join(", ") || null,
    investmentDate: o.investment_date ?? null,
    classKey: o.offering_class_key ?? null,
    sideLetters: (letters ?? []) as any[],
    openItems: ((tasks ?? []) as any[]).filter((t) => !t.resolved_at && !(t.title === "Approve investor to fund" && o.approved_to_fund_at)).map((t) => t.title === "Approve investor to fund" ? "Fund manager: approve subscription" : t.title as string),
    documents: (docs ?? []) as any[],
  };
}

/* ---------------- Team & fees ---------------- */

export async function team(fundId: string) {
  const d = await db();
  const [{ data: members }, { data: fees }, signed, { data: managers }] = await Promise.all([
    d.from("fund_team_members").select("*").eq("offering_id", fundId).is("removed_at", null).order("created_at"),
    d.from("fund_fee_terms").select("*").eq("offering_id", fundId).order("created_at", { ascending: false }).limit(20),
    anyInvestorSigned(fundId),
    d.from("fund_managers").select("user_id").eq("offering_id", fundId),
  ]);
  const ids = ((managers ?? []) as any[]).map((m) => m.user_id);
  const { data: profs } = ids.length ? await d.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const feeRows = (fees ?? []) as any[];
  return {
    members: (members ?? []) as any[],
    signedInManagers: ((profs ?? []) as any[]).map((p) => ({ name: p.legal_name ?? p.email ?? "Fund manager", email: p.email ?? null })),
    activeFee: feeRows.find((f) => f.status === "active") ?? null,
    pendingFee: feeRows.find((f) => f.status === "pending_approval") ?? null,
    feeHistory: feeRows,
    investorsSigned: signed,
  };
}

export async function setFees(uid: string, fundId: string, f: { managementFeePct: number | null; managementFeeBasis: string; carryPct: number | null; hurdlePct: number | null; notes: string }) {
  const d = await db();
  const signed = await anyInvestorSigned(fundId);
  const row = {
    offering_id: fundId, management_fee_pct: f.managementFeePct, management_fee_basis: f.managementFeeBasis || null,
    carry_pct: f.carryPct, hurdle_pct: f.hurdlePct, notes: f.notes || null, requested_by: uid,
  };
  // One open request at a time.
  await d.from("fund_fee_terms").update({ status: "superseded" }).eq("offering_id", fundId).eq("status", "pending_approval");
  if (!signed) {
    await d.from("fund_fee_terms").update({ status: "superseded" }).eq("offering_id", fundId).eq("status", "active");
    await d.from("fund_fee_terms").insert({ ...row, status: "active", decided_by: uid, decided_at: new Date().toISOString() });
    await (await import("@/lib/client-work-notify.server")).notifyFundManagers(fundId, "material_update", "Fund fee terms", `/client/funds/${fundId}?tab=details`);
    return { applied: true };
  }
  const { data: request, error } = await d.from("fund_fee_terms").insert({ ...row, status: "pending_approval" }).select("id").single();
  if (error || !request) throw new Error("The fee change could not be recorded.");
  await (await import("@/lib/fund-change-notify.server")).notifyFundChange({ fundId, ref: request.id, title: "Fund fee terms", status: "requested", actorId: uid });
  return { applied: false };
}

export async function decideFees(uid: string, feeId: string, approve: boolean) {
  if (!(await isStaff(uid))) throw new Error("Only Harmonious can approve fee changes.");
  const d = await db();
  const { data: f } = await d.from("fund_fee_terms").select("*").eq("id", feeId).maybeSingle();
  if (!f || f.status !== "pending_approval") throw new Error("That fee change is no longer waiting for approval.");
  if (f.requested_by === uid && !(await (await import("@/lib/self-approval.server")).selfApprove(uid, "fee_terms", [feeId]))) throw new Error("Someone other than the requester must decide this change.");
  const now = new Date().toISOString();
  if (approve) await d.from("fund_fee_terms").update({ status: "superseded" }).eq("offering_id", f.offering_id).eq("status", "active");
  const { error } = await d.from("fund_fee_terms").update({ status: approve ? "active" : "rejected", decided_by: uid, decided_at: now }).eq("id", feeId);
  if (error) throw new Error("The fee decision could not be recorded.");
  await (await import("@/lib/fund-change-notify.server")).notifyFundChange({ fundId: f.offering_id, ref: feeId, title: "Fund fee terms", status: approve ? "approved" : "rejected", actorId: uid });
  return { ok: true };
}

/* ---------------- Documents ---------------- */

export const BUCKET = "manager-uploads";

export async function listFiles(fundId: string, includeSetupEvidence = false) {
  const d = await db();
  const { data } = await d.from("fund_files").select("*").eq("offering_id", fundId).is("deleted_at", null).order("created_at", { ascending: false });
  const out = [] as any[];
  for (const r of (data ?? []) as any[]) {
    let url: string | null = null;
    if (r.storage_path) url = (await d.storage.from(BUCKET).createSignedUrl(r.storage_path, 600)).data?.signedUrl ?? null;
    out.push({ ...r, url });
  }
  if (includeSetupEvidence) {
    const { data: setup } = await d.from("fund_setups").select("id").eq("offering_id", fundId).maybeSingle();
    const { data: evidence } = setup ? await d.from("fund_setup_documents").select("id, doc_type, title, storage_path, created_at").eq("setup_id", setup.id).eq("doc_type", "ein_letter").eq("is_current", true) : { data: [] };
    for (const e of evidence ?? []) {
      if (!e.storage_path) continue;
      const signed = await d.storage.from("fund-formation").createSignedUrl(e.storage_path, 300);
      out.push({ id: e.id, category: "ein_letter", title: e.title, file_name: e.title, created_at: e.created_at, url: signed.data?.signedUrl ?? null, setupEvidence: true });
    }
    out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  return out;
}

export async function uploadFile(uid: string, fundId: string, f: { title: string; category: string; fileName: string; contentType: string; base64: string }) {
  const bytes = Buffer.from(f.base64, "base64");
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Files must be 20 MB or smaller.");
  if (f.category === "ein_letter") {
    const state = await (await import("@/lib/fund-setup-extras.server")).getExtras(uid, fundId);
    if (!state.canUploadEvidence || !state.hasSetup) throw new Error("IRS evidence needs Harmonious review or a saved fund setup.");
    (await import("@/lib/upload-validation")).validateUpload(new Uint8Array(bytes), f.fileName, { allowed: ["pdf", "png", "jpg", "webp"], maxBytes: 10 * 1024 * 1024 });
  }
  const path = `fund-files/${fundId}/${crypto.randomUUID()}/${f.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const d = await db();
  const { error } = await d.storage.from(BUCKET).upload(path, bytes, { contentType: f.contentType || "application/octet-stream", upsert: false });
  if (error) throw new Error("Upload failed. Please try again.");
  const { data, error: e2 } = await d.from("fund_files").insert({
    offering_id: fundId, title: f.title, category: f.category, file_name: f.fileName, storage_path: path,
    content_type: f.contentType, size_bytes: bytes.byteLength, uploaded_by: uid,
  }).select("id").single();
  if (e2) throw new Error("Couldn't save the file.");
  if (f.category === "ein_letter") {
    const evidencePath = `fund-setup-restricted/${fundId}/ein_letter/${data.id}/${f.fileName.replace(/[^\w.\-]+/g, "_")}`;
    const { error: copyError } = await d.storage.from("fund-formation").upload(evidencePath, bytes, { contentType: f.contentType || "application/pdf", upsert: false });
    if (copyError) throw new Error("The file was saved but IRS evidence could not be linked. Please retry.");
    await (await import("@/lib/fund-setup-extras.server")).uploadEvidence(uid, { offeringId: fundId, kind: "ein_letter", path: evidencePath });
  }
  await (await import("@/lib/fund-setup-extras.server")).autoCompleteAfterSave({ offeringId: fundId });
  if (["w9", "signed_w9"].includes(f.category)) await (await import("@/lib/fund-w9.server")).requestW9AfterUpload(uid, fundId, `fund_files:${data.id}`);
  return { id: data.id as string };
}

async function fileOf(fundId: string, id: string) {
  const { data } = await (await db()).from("fund_files").select("*").eq("id", id).eq("offering_id", fundId).is("deleted_at", null).maybeSingle();
  if (!data) throw new Error("That document is not available.");
  return data as any;
}

export async function deleteFile(uid: string, fundId: string, id: string) {
  const f = await fileOf(fundId, id);
  if (f.status !== "draft") throw new Error("Documents that are out for signature or signed can't be deleted.");
  // Soft delete keeps the record; the file is kept for history.
  await (await db()).from("fund_files").update({ deleted_at: new Date().toISOString(), deleted_by: uid }).eq("id", id);
  return { ok: true };
}

export async function setSignatureBoxes(fundId: string, id: string, boxes: { signer: string; role: string; label: string }[]) {
  const f = await fileOf(fundId, id);
  if (f.status === "signed") throw new Error("Signed documents can't be changed.");
  await (await db()).from("fund_files").update({ signature_boxes: boxes }).eq("id", id);
  return { ok: true };
}

export async function saveGenerated(uid: string, fundId: string, g: { templateKey: string; title: string; category: string; body: string }) {
  if (!(await isStaff(uid))) throw new Error("Only Harmonious staff can generate fund documents.");
  const { data, error } = await (await db()).from("fund_files").insert({
    offering_id: fundId, title: g.title, category: g.category, template_key: g.templateKey, body: g.body, uploaded_by: uid,
  }).select("id").single();
  if (error) throw new Error("Couldn't save the document.");
  return { id: data.id as string, title: g.title, body: g.body };
}

/* ---------------- Banking & books ---------------- */

export async function books(fundId: string) {
  const d = await db();
  const [{ data: txns }, { data: tags }, { data: entries }, grid, { data: assets }, { data: proposed }] = await Promise.all([
    d.from("bank_transactions").select("id, posted_on, amount_cents, name, description, direction").eq("offering_id", fundId).order("posted_on", { ascending: false }).limit(300),
    d.from("fund_transaction_tags").select("*").eq("offering_id", fundId),
    d.from("fund_ledger_entries").select("*").eq("offering_id", fundId).order("entry_date", { ascending: false }).limit(1000),
    investorGrid(fundId),
    d.from("portfolio_assets").select("asset_name").eq("offering_id", fundId),
    d.from("fund_proposed_assets").select("asset_name").eq("offering_id", fundId),
  ]);
  const tagMap = new Map(((tags ?? []) as any[]).map((t) => [t.bank_transaction_id, t]));
  const live = ((entries ?? []) as any[]).filter((e) => !e.voided_at);
  const byCat: Record<string, { inCents: number; outCents: number }> = {};
  for (const e of live) {
    const c = (byCat[e.category] ??= { inCents: 0, outCents: 0 });
    if (e.direction === "in") c.inCents += Number(e.amount_cents); else c.outCents += Number(e.amount_cents);
  }
  const income = live.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount_cents), 0);
  const expense = live.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount_cents), 0);
  return {
    transactions: ((txns ?? []) as any[]).map((t) => ({ ...t, tag: tagMap.get(t.id) ?? null })),
    entries: (entries ?? []) as any[],
    report: { income, expense, net: income - expense, byCategory: Object.entries(byCat).map(([category, v]) => ({ category, ...v })) },
    investors: grid.map((g) => ({ id: g.id, name: g.name })),
    assets: [...new Set([...((assets ?? []) as any[]), ...((proposed ?? []) as any[])].map((a) => a.asset_name as string))],
  };
}

export async function tagTransaction(uid: string, fundId: string, t: { bankTransactionId: string; onboardingId: string | null; assetLabel: string | null }) {
  const d = await db();
  const { data: tx } = await d.from("bank_transactions").select("id").eq("id", t.bankTransactionId).eq("offering_id", fundId).maybeSingle();
  if (!tx) throw new Error("That bank transaction is not in this fund.");
  if (t.onboardingId) {
    const { data: o } = await d.from("investor_onboardings").select("id").eq("id", t.onboardingId).eq("offering_id", fundId).maybeSingle();
    if (!o) throw new Error("That investor is not in this fund.");
  }
  await d.from("fund_transaction_tags").upsert({ bank_transaction_id: t.bankTransactionId, offering_id: fundId, onboarding_id: t.onboardingId, asset_label: t.assetLabel, tagged_by: uid, updated_at: new Date().toISOString() });
  return { ok: true };
}

export async function addEntry(uid: string, fundId: string, e: { entryDate: string; description: string; category: string; direction: "in" | "out"; amountCents: number; bankTransactionId: string | null }) {
  const { error } = await (await db()).from("fund_ledger_entries").insert({
    offering_id: fundId, entry_date: e.entryDate, description: e.description, category: e.category, direction: e.direction,
    amount_cents: e.amountCents, bank_transaction_id: e.bankTransactionId, created_by: uid,
  });
  if (error) throw new Error("Couldn't save the entry.");
  return { ok: true };
}

export async function voidEntry(uid: string, fundId: string, id: string, reason: string) {
  const d = await db();
  const { data } = await d.from("fund_ledger_entries").select("id, voided_at").eq("id", id).eq("offering_id", fundId).maybeSingle();
  if (!data || data.voided_at) throw new Error("That entry can't be voided.");
  await d.from("fund_ledger_entries").update({ voided_at: new Date().toISOString(), voided_by: uid, void_reason: reason }).eq("id", id);
  return { ok: true };
}

/* ---------------- Investor reminders ---------------- */

const STEP_COPY: Record<string, string> = {
  verification: "Your identity verification is still open. Please sign in and finish the verification step so your investment can move forward.",
  sign: "Your fund documents are ready and waiting for your signature. Please sign in to review and sign them.",
  fund: "Your documents are signed. Please sign in to view your funding instructions and send your investment when ready.",
};

/** Last reminder per onboarding for this fund. */
export async function lastReminders(fundId: string): Promise<Record<string, string>> {
  const { data } = await (await db()).from("investor_reminders").select("onboarding_id, created_at").eq("offering_id", fundId).order("created_at", { ascending: false }).limit(2000);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) if (!out[r.onboarding_id]) out[r.onboarding_id] = r.created_at;
  return out;
}

/**
 * Sends a reminder email to investors stuck on Verification, Sign or Fund.
 * At most once per investor per cooldown; logs every send; never changes status.
 */
export async function sendReminders(uid: string, fundId: string, onboardingIds: string[]) {
  const { reminderAllowed, reminderStep } = await import("@/lib/fund-health");
  const d = await db();
  const grid = await investorGrid(fundId);
  const last = await lastReminders(fundId);
  const { data: fundRow } = await d.from("offerings").select("name").eq("id", fundId).maybeSingle();
  const { appUrl } = await import("@/lib/app-origins");
  const link = appUrl("client", "/home", process.env as any);
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const results: { id: string; outcome: "sent" | "skipped" | "failed"; reason?: string }[] = [];
  for (const id of onboardingIds) {
    const r = grid.find((g) => g.id === id);
    if (!r) { results.push({ id, outcome: "skipped", reason: "Not an investor in this fund" }); continue; }
    const step = reminderStep(r.stage, r.docs, r.wiring);
    if (!step) { results.push({ id, outcome: "skipped", reason: "Nothing outstanding" }); continue; }
    if (!r.email) { results.push({ id, outcome: "skipped", reason: "No email on file" }); continue; }
    // Never invited (added by the manager, no account): a sign-in reminder can't help them.
    // Send their personal invitation instead, through the same checked invite engine.
    const { data: ob } = await d.from("investor_onboardings").select("invitation_id, investor_user_id").eq("id", id).maybeSingle();
    if (ob && !ob.invitation_id && !ob.investor_user_id) {
      try {
        const io = await import("@/lib/investor-onboarding.server");
        await io.createPersonalLink(uid, id);
        const s = await io.sendPersonalLink(uid, id);
        results.push(s.emailSent ? { id, outcome: "sent" } : { id, outcome: "failed", reason: "Invite email could not be sent" });
      } catch (e) { results.push({ id, outcome: "failed", reason: (e as Error).message.slice(0, 300) }); }
      continue;
    }
    if (!reminderAllowed(last[id] ?? null)) { results.push({ id, outcome: "skipped", reason: "Reminded in the last 3 days" }); continue; }
    let delivery = "sent"; let note: string | null = null; let messageId: string | null = null;
    const subject = `Reminder: next step for ${fundRow?.name ?? "your investment"}`;
    try {
      const sent = await sendTemplateEmail("investor-message", r.email, {
        idempotencyKey: `reminder-${id}-${new Date().toISOString().slice(0, 10)}`,
        templateData: { investorName: r.name, offeringName: fundRow?.name ?? "Your fund", subject, body: `${STEP_COPY[step]}\n\nSign in: ${link}` },
      });
      messageId = (sent as any)?.messageId ?? null;
    } catch (e) { delivery = "failed"; note = (e as Error).message.slice(0, 300); }
    await d.from("investor_reminders").insert({ offering_id: fundId, onboarding_id: id, step, sent_by: uid, recipient_email: r.email, delivery, delivery_note: note });
    const { logInvestorEmail } = await import("@/lib/investor-emails.server");
    await logInvestorEmail({ onboardingId: id, offeringId: fundId, kind: "reminder", subject, recipient: r.email, messageId, sentBy: uid, outcome: note ? "failed" : "sent", note });
    results.push(note ? { id, outcome: "failed", reason: note } : { id, outcome: "sent" });
  }
  return results;
}

/** Investor levels + the fund's "needs upgrade" check (display only). */
export async function investorLevels(fundId: string) {
  const { investorLevel, portalFeatures, upgradeCheck } = await import("@/lib/investor-levels");
  const d = await db();
  const { data: f } = await d.from("offerings").select("client_id").eq("id", fundId).maybeSingle();
  const { data: ob } = await d.from("investor_onboardings")
    .select("id, application_id, commitment_amount_cents, accepted_amount_cents, requested_amount_cents")
    .eq("offering_id", fundId).is("removed_at", null);
  const rows = (ob ?? []) as any[];
  const appIds = rows.map((o) => o.application_id).filter(Boolean);
  const { data: acc } = appIds.length
    ? await d.from("accreditation_records").select("application_id, status, qualifies, method").in("application_id", appIds)
    : { data: [] as any[] };
  const accBy = new Map(((acc ?? []) as any[]).map((a) => [a.application_id, a]));
  let tierKey: string | null = null;
  const clientId = (f as any)?.client_id;
  if (clientId) {
    const { data: svc } = await d.from("client_service_records").select("service_key, offering_id")
      .eq("client_id", clientId).eq("status", "active").like("service_key", "investor_servicing_%");
    const list = (svc ?? []) as any[];
    const pick = list.find((s) => s.offering_id === fundId) ?? list.find((s) => !s.offering_id);
    tierKey = pick ? String(pick.service_key).replace("investor_servicing_", "") : null;
  }
  const effective = tierKey ?? "self_serve";
  const investors = rows.map((o) => {
    const a = accBy.get(o.application_id);
    const accredited = !!a && a.qualifies === true && ["approved"].includes(String(a.status));
    const qp = accredited && /qualified.?purchaser/i.test(String(a?.method ?? ""));
    const level = investorLevel({ accredited, qualifiedPurchaser: qp, commitmentCents: o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents ?? null });
    return { id: o.id as string, level, features: portalFeatures(level, effective) };
  });
  return { tierKey, investorCount: investors.length, investors, ...upgradeCheck(tierKey, investors.map((i) => i.level)) };
}
