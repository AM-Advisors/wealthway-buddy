/**
 * Fund page tabs (To dos, Team, Documents, Banking, Investors, close details).
 * Server-only. Every call re-checks fund access; fee changes after any investor
 * has signed need Harmonious approval; signed documents can never be deleted;
 * bookkeeping corrections are voids, never edits. Nothing here moves money,
 * files anything or sends email.
 */
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

export function docStatus(o: any) {
  if (o.executed_snapshot || SIGNED_STAGES.has(o.stage)) return "Signed";
  if (o.stage === "signature") return "Out for signature";
  return "Not started";
}

export async function anyInvestorSigned(fundId: string) {
  const { data } = await (await db()).from("investor_onboardings").select("stage, executed_snapshot").eq("offering_id", fundId).is("removed_at", null);
  return ((data ?? []) as any[]).some((o) => docStatus(o) === "Signed");
}

/* ---------------- Investors ---------------- */

export async function investorGrid(fundId: string) {
  const { data } = await (await db()).from("investor_onboardings")
    .select("id, stage, funding_status, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, funded_amount_cents, approved_to_fund_at, funding_released_at, executed_snapshot, last_activity_at, updated_at, person_id, investment_profiles(legal_name, profile_type)")
    .eq("offering_id", fundId).is("removed_at", null).order("created_at");
  // No foreign key from investor_onboardings.person_id, so persons are loaded separately.
  const ids = [...new Set(((data ?? []) as any[]).map((o) => o.person_id).filter(Boolean))];
  const { data: people } = ids.length
    ? await (await db()).from("persons").select("id, legal_first_name, legal_last_name, preferred_name, email, phone, kyc_status, aml_status").in("id", ids)
    : { data: [] as any[] };
  const byId = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  return ((data ?? []) as any[]).map((o) => {
    const p = byId.get(o.person_id) ?? {};
    const entity = !!o.investment_profiles?.profile_type && o.investment_profiles.profile_type !== "individual";
    const kyc = p.kyc_status ?? "not_started";
    const aml = p.aml_status ?? "not_started";
    const funding = canonicalFundingState({ fundingStatus: o.funding_status, approvedToFund: !!o.approved_to_fund_at, instructionsReleased: !!o.funding_released_at });
    return {
      id: o.id as string,
      name: personName(p),
      profileName: o.investment_profiles?.legal_name ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      committedCents: o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents ?? null,
      receivedCents: isReconciledFunding(o.funding_status) ? o.funded_amount_cents ?? null : null,
      kycLabel: `${entity ? "KYB" : "KYC"}/AML: ${String(kyc).replace(/_/g, " ")} / ${String(aml).replace(/_/g, " ")}`,
      kycOk: ["verified", "approved", "passed", "clear"].includes(kyc) && ["clear", "passed", "approved", "verified"].includes(aml),
      docs: docStatus(o),
      wiring: CANONICAL_FUNDING_LABELS[funding],
      lastActivity: o.last_activity_at ?? o.updated_at ?? null,
      stage: o.stage as string,
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
  const grid = (await investorGrid(fundId)).find((r) => r.id === onboardingId)!;
  return {
    ...grid,
    address: [p.address_line1, p.address_line2, p.city, p.region, p.postal_code, p.country].filter(Boolean).join(", ") || null,
    citizenship: p.citizenship_country ?? null,
    taxIdLast4: p.tax_id_last4 ?? null,
    investmentDate: o.investment_date ?? null,
    classKey: o.offering_class_key ?? null,
    sideLetters: (letters ?? []) as any[],
    openItems: ((tasks ?? []) as any[]).filter((t) => !t.resolved_at).map((t) => t.title as string),
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
    return { applied: true };
  }
  await d.from("fund_fee_terms").insert({ ...row, status: "pending_approval" });
  return { applied: false };
}

export async function decideFees(uid: string, feeId: string, approve: boolean) {
  if (!(await isStaff(uid))) throw new Error("Only Harmonious can approve fee changes.");
  const d = await db();
  const { data: f } = await d.from("fund_fee_terms").select("*").eq("id", feeId).maybeSingle();
  if (!f || f.status !== "pending_approval") throw new Error("That fee change is no longer waiting for approval.");
  if (f.requested_by === uid) throw new Error("Someone other than the requester must decide this change.");
  const now = new Date().toISOString();
  if (approve) await d.from("fund_fee_terms").update({ status: "superseded" }).eq("offering_id", f.offering_id).eq("status", "active");
  await d.from("fund_fee_terms").update({ status: approve ? "active" : "rejected", decided_by: uid, decided_at: now }).eq("id", feeId);
  return { ok: true };
}

/* ---------------- Documents ---------------- */

const BUCKET = "manager-uploads";

export async function listFiles(fundId: string) {
  const d = await db();
  const { data } = await d.from("fund_files").select("*").eq("offering_id", fundId).is("deleted_at", null).order("created_at", { ascending: false });
  const out = [] as any[];
  for (const r of (data ?? []) as any[]) {
    let url: string | null = null;
    if (r.storage_path) url = (await d.storage.from(BUCKET).createSignedUrl(r.storage_path, 600)).data?.signedUrl ?? null;
    out.push({ ...r, url });
  }
  return out;
}

export async function uploadFile(uid: string, fundId: string, f: { title: string; category: string; fileName: string; contentType: string; base64: string }) {
  const bytes = Buffer.from(f.base64, "base64");
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Files must be 20 MB or smaller.");
  const path = `fund-files/${fundId}/${crypto.randomUUID()}/${f.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const d = await db();
  const { error } = await d.storage.from(BUCKET).upload(path, bytes, { contentType: f.contentType || "application/octet-stream", upsert: false });
  if (error) throw new Error("Upload failed. Please try again.");
  const { data, error: e2 } = await d.from("fund_files").insert({
    offering_id: fundId, title: f.title, category: f.category, file_name: f.fileName, storage_path: path,
    content_type: f.contentType, size_bytes: bytes.byteLength, uploaded_by: uid,
  }).select("id").single();
  if (e2) throw new Error("Couldn't save the file.");
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
  const { data, error } = await (await db()).from("fund_files").insert({
    offering_id: fundId, title: g.title, category: g.category, template_key: g.templateKey, body: g.body, uploaded_by: uid,
  }).select("id").single();
  if (error) throw new Error("Couldn't save the document.");
  return { id: data.id as string };
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
