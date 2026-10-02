/**
 * Investment Profile detail: contact info, encrypted EIN/SSN, entity formation,
 * formation documents and per-profile accreditation. Owner-only; verification
 * statuses are only ever set to "review" here - staff approve elsewhere.
 * Full tax IDs are encrypted (encryptTin) and never returned to a browser.
 */
import { encryptTin } from "@/lib/irs-forms.server";
import { isEntityProfileType } from "@/lib/identity-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const blank = (v?: string | null) => (v && v.trim() ? v.trim() : null);
const MAX = 15 * 1024 * 1024;

async function ownProfile(userId: string, profileId: string) {
  const db = await admin();
  const { data } = await db.from("investment_profiles").select("*").eq("id", profileId).maybeSingle();
  if (!data || data.owner_user_id !== userId) throw new Error("That investment profile was not found.");
  return { db, profile: data };
}

async function log(db: any, profileId: string, actor: string, event: string, detail: Record<string, unknown> = {}) {
  await db.from("investment_profile_events").insert({ profile_id: profileId, actor_id: actor, event, detail });
}

export async function profileDetail(userId: string, profileId: string) {
  const { db, profile } = await ownProfile(userId, profileId);
  const [{ data: rels }, { data: kyb }, { data: accr }] = await Promise.all([
    db.from("investment_profile_relationships")
      .select("id, role, ownership_percent, is_authorized_signer, status, verification_status, persons(legal_first_name, legal_last_name, email)")
      .eq("profile_id", profileId).eq("status", "active"),
    db.from("entity_verifications").select("*").eq("profile_id", profileId).maybeSingle(),
    db.from("profile_accreditations").select("*").eq("profile_id", profileId).is("offering_id", null).maybeSingle(),
  ]);
  const signDocs = async (bucket: string, docs: any[]) =>
    Promise.all((docs ?? []).map(async (d: any) => {
      const { data } = await db.storage.from(bucket).createSignedUrl(d.path, 600);
      return { name: d.name, path: d.path, uploaded_at: d.uploaded_at, url: data?.signedUrl ?? null };
    }));
  const isEntity = isEntityProfileType(profile.profile_type);
  return {
    profile: {
      id: profile.id, profile_type: profile.profile_type, display_label: profile.display_label, legal_name: profile.legal_name,
      status: profile.status, phone: profile.phone, address_line1: profile.address_line1, address_line2: profile.address_line2,
      city: profile.city, region: profile.region, postal_code: profile.postal_code, country: profile.country,
      tax_id_type: profile.tax_id_type, tax_id_last4: profile.tax_id_last4,
    },
    isEntity,
    owners: ((rels ?? []) as any[]).map((r) => ({
      id: r.id, role: r.role, ownership_percent: r.ownership_percent, is_authorized_signer: r.is_authorized_signer,
      verification_status: r.verification_status,
      name: [r.persons?.legal_first_name, r.persons?.legal_last_name].filter(Boolean).join(" ") || r.persons?.email || "Unnamed",
      email: r.persons?.email ?? null,
    })),
    formation: kyb ? {
      legal_name: kyb.legal_name, entity_type: kyb.entity_type, formation_jurisdiction: kyb.formation_jurisdiction,
      formation_date: kyb.formation_date, trust_type: kyb.trust_type, trust_date: kyb.trust_date, kyb_status: kyb.kyb_status,
      review_notes: kyb.review_notes, documents: await signDocs("investor-uploads", kyb.formation_documents ?? []),
    } : null,
    accreditation: accr ? {
      status: accr.status, basis: accr.basis, verification_method: accr.verification_method,
      verified_at: accr.verified_at, expires_at: accr.expires_at,
      documents: await signDocs("accreditation-docs", accr.evidence?.documents ?? []),
    } : null,
  };
}

export type ProfileBasics = {
  profileId: string; legal_name?: string | undefined; phone?: string | undefined;
  address_line1?: string | undefined; address_line2?: string | undefined; city?: string | undefined;
  region?: string | undefined; postal_code?: string | undefined; country?: string | undefined;
  tax_id?: string | undefined; tax_id_type?: "ssn" | "itin" | "ein" | undefined;
};

export async function saveBasics(userId: string, d: ProfileBasics) {
  const { db, profile } = await ownProfile(userId, d.profileId);
  const patch: Record<string, unknown> = {
    legal_name: blank(d.legal_name) ?? profile.legal_name, phone: blank(d.phone),
    address_line1: blank(d.address_line1), address_line2: blank(d.address_line2), city: blank(d.city),
    region: blank(d.region), postal_code: blank(d.postal_code), country: blank(d.country), updated_at: new Date().toISOString(),
  };
  const tin = (d.tax_id ?? "").replace(/\D/g, "");
  if (tin) {
    if (tin.length !== 9) throw new Error("The EIN or SSN must be 9 digits.");
    const type = d.tax_id_type ?? (isEntityProfileType(profile.profile_type) ? "ein" : tin.startsWith("9") ? "itin" : "ssn");
    const enc = await encryptTin(tin);
    const { error } = await db.rpc("store_profile_tax_id", {
      _profile: d.profileId, _ciphertext: enc.ciphertext, _iv: enc.iv, _key_version: enc.keyVersion, _actor: userId,
    });
    if (error) throw new Error("The tax number couldn't be stored securely.");
    patch["tax_id_type"] = type;
    patch["tax_id_last4"] = tin.slice(-4);
  }
  const { error } = await db.from("investment_profiles").update(patch).eq("id", d.profileId);
  if (error) throw new Error(error.message);
  await log(db, d.profileId, userId, "basics_saved", { tax_id_changed: !!tin });
  return { ok: true };
}

export type FormationInput = {
  profileId: string; legal_name: string; entity_type?: string | undefined; formation_jurisdiction?: string | undefined;
  formation_date?: string | undefined; trust_type?: string | undefined; trust_date?: string | undefined;
};

async function ensureKyb(db: any, profileId: string) {
  const { data } = await db.from("entity_verifications").select("*").eq("profile_id", profileId).maybeSingle();
  if (data) return data;
  const ins = await db.from("entity_verifications").insert({ profile_id: profileId }).select("*").single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data;
}

export async function saveFormation(userId: string, d: FormationInput) {
  const { db, profile } = await ownProfile(userId, d.profileId);
  if (!isEntityProfileType(profile.profile_type)) throw new Error("Only business and trust profiles have formation details.");
  const kyb = await ensureKyb(db, d.profileId);
  if (kyb.kyb_status === "approved") throw new Error("These details are already verified. Message Harmonious to change them.");
  const { error } = await db.from("entity_verifications").update({
    legal_name: d.legal_name.trim(), entity_type: blank(d.entity_type), formation_jurisdiction: blank(d.formation_jurisdiction),
    formation_date: blank(d.formation_date), trust_type: blank(d.trust_type), trust_date: blank(d.trust_date),
    kyb_status: "review", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", kyb.id);
  if (error) throw new Error(error.message);
  await log(db, d.profileId, userId, "formation_submitted");
  return { ok: true };
}

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 120);

export async function uploadDoc(userId: string, d: { profileId: string; kind: "formation" | "accreditation"; fileName: string; contentType: string; base64: string }) {
  const { db, profile } = await ownProfile(userId, d.profileId);
  const bytes = Buffer.from(d.base64, "base64");
  if (bytes.length > MAX) throw new Error("Files must be 15 MB or smaller.");
  const name = safeName(d.fileName);
  const bucket = d.kind === "formation" ? "investor-uploads" : "accreditation-docs";
  const path = `profiles/${d.profileId}/${d.kind}/${crypto.randomUUID()}/${name}`;
  const doc = { name, path, uploaded_at: new Date().toISOString() };
  if (d.kind === "formation") {
    if (!isEntityProfileType(profile.profile_type)) throw new Error("Only business and trust profiles have formation documents.");
    const kyb = await ensureKyb(db, d.profileId);
    const up = await db.storage.from(bucket).upload(path, bytes, { contentType: d.contentType || "application/octet-stream" });
    if (up.error) throw new Error("The file couldn't be uploaded.");
    await db.from("entity_verifications").update({ formation_documents: [...(kyb.formation_documents ?? []), doc] }).eq("id", kyb.id);
  } else {
    const accr = await ensureAccr(db, d.profileId);
    const up = await db.storage.from(bucket).upload(path, bytes, { contentType: d.contentType || "application/octet-stream" });
    if (up.error) throw new Error("The file couldn't be uploaded.");
    const ev = accr.evidence ?? {};
    await db.from("profile_accreditations").update({ evidence: { ...ev, documents: [...(ev.documents ?? []), doc] } }).eq("id", accr.id);
  }
  await log(db, d.profileId, userId, `${d.kind}_document_uploaded`, { name });
  return { ok: true };
}

export async function removeDoc(userId: string, d: { profileId: string; kind: "formation" | "accreditation"; path: string }) {
  const { db } = await ownProfile(userId, d.profileId);
  if (d.kind === "formation") {
    const kyb = await ensureKyb(db, d.profileId);
    if (kyb.kyb_status === "approved" || kyb.kyb_status === "review") throw new Error("Documents can't be removed once submitted for review.");
    await db.from("entity_verifications").update({ formation_documents: (kyb.formation_documents ?? []).filter((x: any) => x.path !== d.path) }).eq("id", kyb.id);
  } else {
    const accr = await ensureAccr(db, d.profileId);
    if (accr.status === "approved" || accr.status === "review") throw new Error("Documents can't be removed once submitted for review.");
    const ev = accr.evidence ?? {};
    await db.from("profile_accreditations").update({ evidence: { ...ev, documents: (ev.documents ?? []).filter((x: any) => x.path !== d.path) } }).eq("id", accr.id);
  }
  // File kept in storage for the record; only unlinked.
  await log(db, d.profileId, userId, `${d.kind}_document_removed`, { path: d.path });
  return { ok: true };
}

async function ensureAccr(db: any, profileId: string) {
  const { data } = await db.from("profile_accreditations").select("*").eq("profile_id", profileId).is("offering_id", null).maybeSingle();
  if (data) return data;
  const ins = await db.from("profile_accreditations").insert({ profile_id: profileId, offering_id: null }).select("*").single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data;
}

export async function submitAccreditation(userId: string, d: { profileId: string; basis: string; verification_method: string }) {
  const { db } = await ownProfile(userId, d.profileId);
  const accr = await ensureAccr(db, d.profileId);
  if (accr.status === "approved") throw new Error("This profile's accreditation is already verified.");
  const { error } = await db.from("profile_accreditations").update({
    basis: d.basis, verification_method: d.verification_method, status: "review", updated_at: new Date().toISOString(),
  }).eq("id", accr.id);
  if (error) throw new Error(error.message);
  await log(db, d.profileId, userId, "accreditation_submitted", { basis: d.basis });
  return { ok: true };
}
