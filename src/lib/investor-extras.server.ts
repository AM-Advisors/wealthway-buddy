/**
 * Investor onboarding extras: per-investment document uploads, fee acceptance and
 * fund updates. Server-only; every call re-checks that the caller owns the
 * investment (investor side) or can access the fund (manager/staff side).
 */
import { assertFund, db } from "@/lib/fund-tabs.server";

export const ONBOARDING_DOC_KINDS = [
  { value: "identification", label: "Government ID" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "accreditation_proof", label: "Accreditation proof (CPA/lawyer letter or statements)" },
  { value: "entity_formation", label: "Entity formation documents" },
  { value: "operating_agreement", label: "Operating agreement or trust agreement" },
  { value: "ownership_list", label: "Owner list (beneficial owners)" },
  { value: "tax_form", label: "Signed W-9 or W-8" },
] as const;
export type OnboardingDocKind = (typeof ONBOARDING_DOC_KINDS)[number]["value"];

const BUCKET = "investor-uploads";
const MAX_BYTES = 15 * 1024 * 1024;

async function ownOnboarding(userId: string, onboardingId: string) {
  const d = await db();
  const { data: ob } = await d.from("investor_onboardings").select("id, offering_id, investor_user_id, application_id").eq("id", onboardingId).maybeSingle();
  if (!ob || ob.investor_user_id !== userId) throw new Error("This investment isn't available.");
  return { d, ob: ob as { id: string; offering_id: string; application_id: string | null } };
}

export type OnboardingUpload = { id: string; fileName: string; kind: string; uploadedAt: string; status: string; note: string | null; canDelete: boolean };

export async function listUploads(userId: string, onboardingId: string): Promise<OnboardingUpload[]> {
  const { d } = await ownOnboarding(userId, onboardingId);
  const { data } = await d.from("investor_documents").select("id, file_name, doc_kind, uploaded_at, review_status, review_note")
    .eq("onboarding_id", onboardingId).eq("user_id", userId).order("uploaded_at", { ascending: false });
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id), fileName: String(r.file_name), kind: String(r.doc_kind), uploadedAt: String(r.uploaded_at),
    status: String(r.review_status ?? "new"), note: r.review_note ?? null, canDelete: (r.review_status ?? "new") === "new",
  }));
}

export async function uploadDoc(userId: string, input: { onboardingId: string; kind: OnboardingDocKind; fileName: string; contentType: string; base64: string }) {
  const { d, ob } = await ownOnboarding(userId, input.onboardingId);
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length === 0) throw new Error("That file is empty.");
  if (bytes.length > MAX_BYTES) throw new Error("Files can be up to 15 MB.");
  const safe = input.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const path = `${userId}/onboarding/${ob.id}/${crypto.randomUUID()}-${safe}`;
  const up = await d.storage.from(BUCKET).upload(path, bytes, { contentType: input.contentType || "application/octet-stream" });
  if (up.error) throw new Error("Couldn't save that file. Please try again.");
  const { error } = await d.from("investor_documents").insert({
    onboarding_id: ob.id, application_id: ob.application_id, offering_id: ob.offering_id, user_id: userId,
    storage_path: path, file_name: safe, doc_kind: input.kind,
  });
  if (error) {
    await d.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return { ok: true };
}

/** Only files Harmonious hasn't reviewed yet can be removed. */
export async function deleteDoc(userId: string, onboardingId: string, id: string) {
  const { d } = await ownOnboarding(userId, onboardingId);
  const { data: row } = await d.from("investor_documents").select("id, storage_path, review_status, user_id, onboarding_id").eq("id", id).maybeSingle();
  if (!row || row.user_id !== userId || row.onboarding_id !== onboardingId) throw new Error("That file isn't available.");
  if ((row.review_status ?? "new") !== "new") throw new Error("Harmonious has already reviewed this file, so it can't be removed.");
  await d.from("investor_documents").delete().eq("id", id);
  await d.storage.from(BUCKET).remove([row.storage_path]);
  return { ok: true };
}

export type FeeStatus = {
  terms: null | { id: string; managementFeePct: number | null; basis: string | null; carryPct: number | null; hurdlePct: number | null; notes: string | null };
  accepted: null | { at: string; name: string };
  sideLetters: string[];
};

async function activeTerms(d: any, offeringId: string) {
  const { data } = await d.from("fund_fee_terms").select("id, management_fee_pct, management_fee_basis, carry_pct, hurdle_pct, notes")
    .eq("offering_id", offeringId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as any;
}

export async function feeStatus(userId: string, onboardingId: string): Promise<FeeStatus> {
  const { d, ob } = await ownOnboarding(userId, onboardingId);
  const t = await activeTerms(d, ob.offering_id);
  if (!t) return { terms: null, accepted: null, sideLetters: [] };
  const [{ data: acc }, { data: sl }] = await Promise.all([
    d.from("investor_fee_acceptances").select("accepted_at, accepted_name").eq("onboarding_id", ob.id).eq("fee_terms_id", t.id).maybeSingle(),
    d.from("side_letters").select("status, document_reference").eq("onboarding_id", ob.id).limit(20),
  ]);
  return {
    terms: { id: String(t.id), managementFeePct: t.management_fee_pct, basis: t.management_fee_basis, carryPct: t.carry_pct, hurdlePct: t.hurdle_pct, notes: t.notes ?? null },
    accepted: acc ? { at: String((acc as any).accepted_at), name: String((acc as any).accepted_name) } : null,
    sideLetters: ((sl ?? []) as any[]).map((s) => `Side letter${s.document_reference ? ` (${s.document_reference})` : ""} - ${String(s.status ?? "").replace(/_/g, " ")}`),
  };
}

export async function acceptFees(userId: string, onboardingId: string, termsId: string, name: string) {
  const { d, ob } = await ownOnboarding(userId, onboardingId);
  const t = await activeTerms(d, ob.offering_id);
  if (!t || String(t.id) !== termsId) throw new Error("The fund's fees changed. Please review the current fees.");
  const { error } = await d.from("investor_fee_acceptances").insert({
    onboarding_id: ob.id, offering_id: ob.offering_id, fee_terms_id: t.id, accepted_by: userId, accepted_name: name,
    terms: { management_fee_pct: t.management_fee_pct, management_fee_basis: t.management_fee_basis, carry_pct: t.carry_pct, hurdle_pct: t.hurdle_pct, notes: t.notes },
  });
  if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
  return { ok: true };
}

/** Throws unless the investor accepted the fund's current fees (no fees set = nothing to accept). */
export async function assertFeesAccepted(userId: string, onboardingId: string) {
  const s = await feeStatus(userId, onboardingId);
  if (s.terms && !s.accepted) throw new Error("Please review and accept the fund's fees before signing.");
}

export type UpdateAttachment = { file: { name: string; url: string | null } | null; asset: { name: string; assetClass: string | null } | null };
export type InvestorUpdate = { id: string; fundId: string; fundName: string; title: string; body: string; postedAt: string } & UpdateAttachment;

/** Resolve attached fund files (fresh signed URL) and assets (name only — no cost/valuation shared). */
async function attachments(d: any, rows: any[]): Promise<Map<string, UpdateAttachment>> {
  const fileIds = [...new Set(rows.map((r) => r.file_id).filter(Boolean))];
  const assetIds = [...new Set(rows.map((r) => r.asset_id).filter(Boolean))];
  const [{ data: files }, { data: assets }] = await Promise.all([
    fileIds.length ? d.from("fund_files").select("id, title, file_name, storage_path, deleted_at").in("id", fileIds) : Promise.resolve({ data: [] }),
    assetIds.length ? d.from("portfolio_assets").select("id, asset_name, issuer_name, asset_class").in("id", assetIds) : Promise.resolve({ data: [] }),
  ]);
  const fm = new Map<string, { name: string; url: string | null }>();
  for (const f of (files ?? []) as any[]) {
    if (f.deleted_at) continue;
    const url = f.storage_path ? (await d.storage.from("manager-uploads").createSignedUrl(f.storage_path, 600)).data?.signedUrl ?? null : null;
    fm.set(String(f.id), { name: String(f.title || f.file_name), url });
  }
  const am = new Map(((assets ?? []) as any[]).map((a) => [String(a.id), { name: String(a.asset_name || a.issuer_name || "Asset"), assetClass: a.asset_class ?? null }]));
  return new Map(rows.map((r) => [String(r.id), { file: r.file_id ? fm.get(String(r.file_id)) ?? null : null, asset: r.asset_id ? am.get(String(r.asset_id)) ?? null : null }]));
}
export type InvestorFundLinks = { fundId: string; fundName: string; hasDealRoom: boolean };

export async function myUpdates(userId: string): Promise<{ updates: InvestorUpdate[]; funds: InvestorFundLinks[] }> {
  const d = await db();
  const { data: obs } = await d.from("investor_onboardings").select("offering_id").eq("investor_user_id", userId);
  const ids = Array.from(new Set(((obs ?? []) as any[]).map((o) => String(o.offering_id))));
  if (!ids.length) return { updates: [], funds: [] };
  const [{ data: ups }, { data: funds }, { data: rooms }] = await Promise.all([
    d.from("fund_investor_updates").select("id, offering_id, title, body, posted_at, file_id, asset_id").in("offering_id", ids).is("removed_at", null).order("posted_at", { ascending: false }).limit(30),
    d.from("offerings").select("id, name").in("id", ids),
    d.from("diligence_rooms").select("offering_id").in("offering_id", ids),
  ]);
  const names = new Map(((funds ?? []) as any[]).map((f) => [String(f.id), String(f.name)]));
  const roomSet = new Set(((rooms ?? []) as any[]).map((r) => String(r.offering_id)));
  const att = await attachments(d, (ups ?? []) as any[]);
  return {
    updates: ((ups ?? []) as any[]).map((u) => ({ ...att.get(String(u.id))!, id: String(u.id), fundId: String(u.offering_id), fundName: names.get(String(u.offering_id)) ?? "Fund", title: String(u.title), body: String(u.body), postedAt: String(u.posted_at) })),
    funds: ids.map((id) => ({ fundId: id, fundName: names.get(id) ?? "Fund", hasDealRoom: roomSet.has(id) })),
  };
}

export type FundUpdateRow = { id: string; title: string; body: string; postedAt: string } & UpdateAttachment;

export async function fundUpdates(userId: string, fundId: string): Promise<FundUpdateRow[]> {
  await assertFund(userId, fundId);
  const d = await db();
  const { data } = await d.from("fund_investor_updates").select("id, title, body, posted_at, file_id, asset_id").eq("offering_id", fundId).is("removed_at", null).order("posted_at", { ascending: false });
  const att = await attachments(d, (data ?? []) as any[]);
  return ((data ?? []) as any[]).map((u) => ({ ...att.get(String(u.id))!, id: String(u.id), title: String(u.title), body: String(u.body), postedAt: String(u.posted_at) }));
}

export async function postUpdate(userId: string, fundId: string, title: string, body: string, fileId?: string | null, assetId?: string | null) {
  await assertFund(userId, fundId);
  const d = await db();
  // Attachments must belong to this same fund.
  if (fileId) { const { data } = await d.from("fund_files").select("id").eq("id", fileId).eq("offering_id", fundId).is("deleted_at", null).maybeSingle(); if (!data) throw new Error("That document isn't part of this fund."); }
  if (assetId) { const { data } = await d.from("portfolio_assets").select("id").eq("id", assetId).eq("offering_id", fundId).maybeSingle(); if (!data) throw new Error("That asset isn't part of this fund."); }
  const { error } = await d.from("fund_investor_updates").insert({ offering_id: fundId, title, body, posted_by: userId, file_id: fileId ?? null, asset_id: assetId ?? null });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function removeUpdate(userId: string, fundId: string, id: string) {
  await assertFund(userId, fundId);
  await (await db()).from("fund_investor_updates").update({ removed_at: new Date().toISOString(), removed_by: userId }).eq("id", id).eq("offering_id", fundId);
  return { ok: true };
}

/** Fund documents and assets a manager may reference in an update. */
export async function updateAttachmentOptions(userId: string, fundId: string) {
  await assertFund(userId, fundId);
  const d = await db();
  const [{ data: files }, { data: assets }] = await Promise.all([
    d.from("fund_files").select("id, title, file_name").eq("offering_id", fundId).is("deleted_at", null).not("storage_path", "is", null).order("created_at", { ascending: false }),
    d.from("portfolio_assets").select("id, asset_name, issuer_name").eq("offering_id", fundId).order("acquisition_date", { ascending: false }),
  ]);
  return {
    files: ((files ?? []) as any[]).map((f) => ({ id: String(f.id), name: String(f.title || f.file_name) })),
    assets: ((assets ?? []) as any[]).map((a) => ({ id: String(a.id), name: String(a.asset_name || a.issuer_name || "Asset") })),
  };
}
