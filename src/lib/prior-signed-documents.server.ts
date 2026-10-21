/**
 * Documents an investor completed in another system before joining Harmonious.
 * Harmonious staff or that fund's managers upload the finished copy; records are permanent
 * (DB trigger), corrections upload a replacement. Evidence only: never marks a step signed,
 * funded or verified.
 */
const STAFF = ["admin", "super_admin", "operations", "fund_administration"];
const BUCKET = "signed-documents";

export const PRIOR_DOC_KINDS = {
  subscription_agreement: "Subscription Agreement",
  operating_agreement: "Operating / Partnership Agreement",
  ppm_acknowledgment: "PPM acknowledgment",
  tax_form: "Tax form (W-9 / W-8)",
  side_letter: "Side letter",
  accreditation: "Accreditation evidence",
  other: "Other signed document",
} as const;
export type PriorDocKind = keyof typeof PRIOR_DOC_KINDS;

async function access(db: any, userId: string, fundId: string, onboardingId: string) {
  const [roles, managers, ob] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("fund_managers").select("id").eq("user_id", userId).eq("offering_id", fundId),
    db.from("investor_onboardings").select("id, offering_id, removed_at").eq("id", onboardingId).maybeSingle(),
  ]);
  if (roles.error || managers.error || ob.error) throw new Error("Access could not be checked.");
  const staff = (roles.data ?? []).some((r: any) => STAFF.includes(r.role));
  if (!staff && !managers.data?.length) throw new Error("Only Harmonious or this fund's managers can do this.");
  if (!ob.data || ob.data.offering_id !== fundId || ob.data.removed_at) throw new Error("That investor isn't in this fund.");
  return staff ? "harmonious" : "fund_manager";
}

export async function listPriorDocs(db: any, userId: string, input: { fundId: string; onboardingId: string }) {
  await access(db, userId, input.fundId, input.onboardingId);
  const { data, error } = await db.from("prior_signed_documents").select("id, document_kind, title, signed_on, file_name, note, uploaded_by_role, replaces_id, created_at")
    .eq("onboarding_id", input.onboardingId).order("created_at", { ascending: false });
  if (error) throw new Error("Previously signed documents could not be loaded.");
  const replaced = new Set(((data ?? []) as any[]).map((d) => d.replaces_id).filter(Boolean));
  return ((data ?? []) as any[]).map((d) => ({
    id: d.id as string, kind: d.document_kind as PriorDocKind, kindLabel: PRIOR_DOC_KINDS[d.document_kind as PriorDocKind] ?? "Document",
    title: d.title as string, signedOn: d.signed_on as string, fileName: d.file_name as string, note: d.note as string | null,
    uploadedBy: d.uploaded_by_role === "harmonious" ? "Harmonious" : "Fund manager", uploadedAt: d.created_at as string, replaced: replaced.has(d.id),
  }));
}

export async function startPriorUpload(db: any, userId: string, input: { fundId: string; onboardingId: string; fileName: string }) {
  await access(db, userId, input.fundId, input.onboardingId);
  const safe = input.fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "document.pdf";
  const path = `prior-imports/${input.fundId}/${input.onboardingId}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error("The upload could not be started.");
  return { path, token: data.token as string, signedUrl: data.signedUrl as string };
}

export async function recordPriorDoc(db: any, userId: string, input: { fundId: string; onboardingId: string; path: string; fileName: string; kind: PriorDocKind; title: string; signedOn: string; note?: string | null | undefined; replacesId?: string | null | undefined }) {
  const role = await access(db, userId, input.fundId, input.onboardingId);
  const prefix = `prior-imports/${input.fundId}/${input.onboardingId}/`;
  if (!input.path.startsWith(prefix) || input.path.includes("..")) throw new Error("That file isn't for this investor.");
  if (new Date(input.signedOn) > new Date()) throw new Error("The signed date can't be in the future.");
  const name = input.path.slice(prefix.length);
  const listed = await db.storage.from(BUCKET).list(prefix.slice(0, -1), { search: name });
  if (listed.error || !(listed.data ?? []).some((o: any) => o.name === name)) throw new Error("The file didn't finish uploading. Try again.");
  if (input.replacesId) {
    const { data: prev } = await db.from("prior_signed_documents").select("id, onboarding_id").eq("id", input.replacesId).maybeSingle();
    if (!prev || prev.onboarding_id !== input.onboardingId) throw new Error("The document being replaced wasn't found.");
    if (!(input.note ?? "").trim()) throw new Error("Give a reason for the replacement.");
  }
  const { data, error } = await db.from("prior_signed_documents").insert({
    offering_id: input.fundId, onboarding_id: input.onboardingId, document_kind: input.kind, title: input.title.trim(),
    signed_on: input.signedOn, storage_path: input.path, file_name: input.fileName, note: input.note?.trim() || null,
    uploaded_by: userId, uploaded_by_role: role, replaces_id: input.replacesId ?? null,
  }).select("id").single();
  if (error) throw new Error("The document could not be saved.");
  await db.from("investor_onboarding_events").insert({ onboarding_id: input.onboardingId, offering_id: input.fundId, event: "prior_signed_document_loaded", actor_user_id: userId, actor_role: role, detail: { document_id: data.id, kind: input.kind, replaces: input.replacesId ?? null } }).then(() => null, () => null);
  return { id: data.id as string };
}

export async function openPriorDoc(db: any, userId: string, input: { fundId: string; onboardingId: string; documentId: string }) {
  const role = await access(db, userId, input.fundId, input.onboardingId);
  const { data } = await db.from("prior_signed_documents").select("id, onboarding_id, storage_path").eq("id", input.documentId).maybeSingle();
  if (!data || data.onboarding_id !== input.onboardingId) throw new Error("That document wasn't found.");
  await db.from("investor_onboarding_events").insert({ onboarding_id: input.onboardingId, offering_id: input.fundId, event: "prior_signed_document_opened", actor_user_id: userId, actor_role: role, detail: { document_id: data.id } }).then(() => null, () => null);
  const r = await db.storage.from(BUCKET).createSignedUrl(data.storage_path, 300, { download: true });
  if (r.error || !r.data?.signedUrl) throw new Error("The document could not be opened.");
  return { url: r.data.signedUrl as string };
}
