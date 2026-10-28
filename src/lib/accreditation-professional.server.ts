import { REQUEST_LIMITS, effectiveStatus, sendBlocked, uploadAllowed, type ProfessionalRole } from "@/lib/accreditation-evidence-options";

/**
 * Investor-initiated requests for a CPA, attorney, adviser or broker-dealer to upload an
 * accreditation letter. Uploads only add evidence and move accreditation to review; they never approve.
 */
const APP_ORIGIN = "https://app.harmonious.co";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function logEvent(d: any, requestId: string, event: string, actor: string | null, detail: Record<string, unknown> = {}) {
  await d.from("accreditation_professional_request_events").insert({ request_id: requestId, event, actor_user_id: actor, detail });
}

/** The investor's own onboarding and application; refuses anyone else's. */
async function ownedApplication(d: any, userId: string, onboardingId: string) {
  const { data: onb } = await d.from("investor_onboardings").select("id, investor_user_id, application_id, offering_id").eq("id", onboardingId).maybeSingle();
  if (!onb || onb.investor_user_id !== userId) throw new Error("That investment isn't yours.");
  if (!onb.application_id) throw new Error("Finish About You first.");
  return onb as { id: string; application_id: string; offering_id: string };
}

async function sendRequestEmail(d: any, req: any, token: string, applicationId: string) {
  const { data: app } = await d.from("investor_applications").select("offering_id, user_id").eq("id", applicationId).maybeSingle();
  const [{ data: fund }, { data: prof }] = await Promise.all([
    d.from("offerings").select("name").eq("id", app?.offering_id).maybeSingle(),
    d.from("profiles").select("legal_name").eq("user_id", app?.user_id).maybeSingle(),
  ]);
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  return sendTemplateEmail("accreditation-professional-request", req.professional_email, {
    idempotencyKey: `accreditation-pro-${req.id}-${req.send_count}`,
    templateData: {
      professionalName: req.professional_name,
      investorName: prof?.legal_name || "Your client",
      fundName: fund?.name || "a private fund",
      uploadUrl: `${APP_ORIGIN}/verify-accreditation/${token}`,
      expiresOn: new Date(req.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    },
  });
}

export async function listRequests(userId: string, onboardingId: string) {
  const d = await db();
  const onb = await ownedApplication(d, userId, onboardingId);
  const { data } = await d.from("accreditation_professional_requests")
    .select("id, professional_name, professional_firm, professional_role, professional_email, status, expires_at, last_sent_at, uploaded_at, created_at")
    .eq("application_id", onb.application_id).eq("requested_by", userId).order("created_at", { ascending: false });
  return ((data ?? []) as any[]).map((r) => ({ ...r, status: effectiveStatus(r) }));
}

export async function createRequest(userId: string, input: { onboardingId: string; name: string; firm: string; role: ProfessionalRole; email: string }) {
  const d = await db();
  const onb = await ownedApplication(d, userId, input.onboardingId);
  const { data: rows } = await d.from("accreditation_professional_requests").select("status, expires_at, last_sent_at, send_count, created_at").eq("requested_by", userId);
  const blocked = sendBlocked((rows ?? []) as any[]);
  if (blocked) throw new Error(blocked);
  const token = newToken();
  const expires = new Date(Date.now() + REQUEST_LIMITS.expiryDays * 86400000).toISOString();
  const { data: req, error } = await d.from("accreditation_professional_requests").insert({
    application_id: onb.application_id, onboarding_id: onb.id, requested_by: userId,
    professional_name: input.name, professional_firm: input.firm || null, professional_role: input.role,
    professional_email: input.email.toLowerCase(), token_hash: await hashToken(token), expires_at: expires,
  }).select("*").single();
  if (error) throw new Error("Could not create the request.");
  await logEvent(d, req.id, "requested", userId, { role: input.role });
  try { await sendRequestEmail(d, req, token, onb.application_id); await logEvent(d, req.id, "sent", userId); }
  catch (e) { console.error("accreditation pro email", e); await logEvent(d, req.id, "send_failed", userId); throw new Error("The request was saved but the email could not be sent. Try Resend."); }
  void (await import("@/lib/accreditation-review.server")).notifyAccreditationActivity(onb.application_id, {
    kind: "professional_request_sent", professionalName: req.professional_name, professionalRole: req.professional_role, requestId: req.id, resent: false,
  }).catch(() => {});
  return { ok: true };
}

async function ownRequest(d: any, userId: string, requestId: string) {
  const { data: req } = await d.from("accreditation_professional_requests").select("*").eq("id", requestId).maybeSingle();
  if (!req || req.requested_by !== userId) throw new Error("Request not found.");
  return req;
}

/** Resend issues a fresh link (old one stops working) and extends the expiry. */
export async function resendRequest(userId: string, requestId: string) {
  const d = await db();
  const req = await ownRequest(d, userId, requestId);
  if (req.status === "uploaded" || req.status === "canceled") throw new Error("This request is already closed.");
  const { data: rows } = await d.from("accreditation_professional_requests").select("status, expires_at, last_sent_at, send_count, created_at").eq("requested_by", userId).neq("id", requestId);
  const blocked = sendBlocked([...((rows ?? []) as any[]), { ...req, status: "canceled" }]);
  if (blocked && !blocked.includes("open requests")) throw new Error(blocked);
  const token = newToken();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + REQUEST_LIMITS.expiryDays * 86400000).toISOString();
  const { data: updated, error } = await d.from("accreditation_professional_requests").update({
    token_hash: await hashToken(token), status: "requested", expires_at: expires, send_count: (req.send_count ?? 1) + 1, last_sent_at: now, updated_at: now,
  }).eq("id", requestId).select("*").single();
  if (error) throw new Error("Could not resend.");
  await sendRequestEmail(d, updated, token, req.application_id);
  await logEvent(d, requestId, "resent", userId);
  void (await import("@/lib/accreditation-review.server")).notifyAccreditationActivity(req.application_id, {
    kind: "professional_request_sent", professionalName: updated.professional_name, professionalRole: updated.professional_role, requestId, resent: true,
  }).catch(() => {});
  return { ok: true };
}

export async function cancelRequest(userId: string, requestId: string) {
  const d = await db();
  const req = await ownRequest(d, userId, requestId);
  if (req.status === "uploaded") throw new Error("A letter was already uploaded.");
  await d.from("accreditation_professional_requests").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", requestId);
  await logEvent(d, requestId, "canceled", userId);
  return { ok: true };
}

/** Public: what the upload page may show. Never amounts, tax IDs or other documents. */
export async function resolveUploadLink(token: string) {
  const d = await db();
  const { data: req } = await d.from("accreditation_professional_requests").select("id, application_id, professional_name, professional_role, status, expires_at").eq("token_hash", await hashToken(token)).maybeSingle();
  const reason = uploadAllowed(req);
  if (reason || !req) return { ok: false as const, reason: reason ?? "This link is not valid." };
  const { data: app } = await d.from("investor_applications").select("offering_id, user_id").eq("id", req.application_id).maybeSingle();
  const [{ data: fund }, { data: prof }] = await Promise.all([
    d.from("offerings").select("name").eq("id", app?.offering_id).maybeSingle(),
    d.from("profiles").select("legal_name").eq("user_id", app?.user_id).maybeSingle(),
  ]);
  return { ok: true as const, professionalName: req.professional_name as string, role: req.professional_role as string, investorName: (prof?.legal_name as string) || "Your client", fundName: (fund?.name as string) || "the fund" };
}

/** Public: store the letter, attach it as evidence, move accreditation to review. */
export async function acceptUpload(token: string, file: File, licenseNumber: string) {
  const d = await db();
  const { data: req } = await d.from("accreditation_professional_requests").select("*").eq("token_hash", await hashToken(token)).maybeSingle();
  const reason = uploadAllowed(req);
  if (reason) throw new Error(reason);
  const { data: app } = await d.from("investor_applications").select("id, user_id").eq("id", req.application_id).maybeSingle();
  if (!app) throw new Error("This link is not valid.");
  const safe = file.name.replace(/[^\w.\-]/g, "_").slice(0, 120);
  const path = `${app.user_id}/professional-${req.id}-${safe}`;
  const up = await d.storage.from("accreditation-docs").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error("Upload failed. Please try again.");
  const now = new Date().toISOString();
  // Claim the request first so a link can only be used once.
  const { data: claimed } = await d.from("accreditation_professional_requests")
    .update({ status: "uploaded", uploaded_at: now, license_number: licenseNumber, updated_at: now })
    .eq("id", req.id).eq("status", "requested").select("id").maybeSingle();
  if (!claimed) { await d.storage.from("accreditation-docs").remove([path]); throw new Error("A letter was already uploaded with this link."); }
  const { data: doc } = await d.from("accreditation_documents").insert({
    application_id: app.id, storage_path: path, file_name: `${req.professional_name} letter: ${safe}`.slice(0, 200), doc_kind: "verification_letter",
  }).select("id").single();
  await d.from("accreditation_professional_requests").update({ uploaded_document_id: doc?.id ?? null }).eq("id", req.id);
  const recordPatch = {
    application_id: app.id, reg_type: "506c", method: "third_party_letter", status: "review", updated_at: now,
    questionnaire: { source: "professional_upload", verifier_name: req.professional_name, verifier_firm: req.professional_firm, verifier_role: req.professional_role, professional_license: licenseNumber, submitted_at: now },
  };
  const { data: existing } = await d.from("accreditation_records").select("id, status").eq("application_id", app.id).maybeSingle();
  if (!existing) await d.from("accreditation_records").insert({ ...recordPatch, qualifies: null });
  else if (existing.status !== "approved") await d.from("accreditation_records").update(recordPatch).eq("id", existing.id);
  const { data: appRow } = await d.from("investor_applications").select("accreditation_status").eq("id", app.id).maybeSingle();
  if (appRow?.accreditation_status !== "approved") await d.from("investor_applications").update({ accreditation_status: "review", updated_at: now }).eq("id", app.id);
  await logEvent(d, req.id, "uploaded", null, { document_id: doc?.id ?? null, size: file.size, type: file.type });
  void (await import("@/lib/accreditation-review.server")).notifyAccreditationActivity(app.id, {
    kind: "professional_letter_uploaded", professionalName: req.professional_name, documentId: doc?.id ?? null, requestId: req.id,
  }).catch(() => {});
  if (doc?.id) void (await import("@/lib/accreditation-ai.server")).checkDocument(doc.id, null).catch(() => {});
  return { ok: true };
}
