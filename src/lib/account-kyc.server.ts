// Server-only: account-level identity verification that gates every non-staff account.
// Investment-level KYC (kyc_verifications) stays separate; an approved one counts here.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ACCOUNT_KYC_DECIDERS, gateOpen, resolveGate, type AccountCheckStatus } from "@/lib/account-kyc-model";

const db = () => supabaseAdmin as any;
const now = () => new Date().toISOString();
const DIDIT_SESSION_URL = "https://verification.didit.me/v2/session/";

async function roles(uid: string): Promise<string[]> {
  const { data } = await db().from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

async function grandfathered(uid: string): Promise<boolean> {
  const { data: apps } = await db().from("investor_applications").select("id").eq("user_id", uid);
  const appIds = ((apps ?? []) as any[]).map((a) => a.id);
  const { personForUser } = await import("@/lib/kyc-verification.server");
  const person = await personForUser(uid);
  const ors = [appIds.length ? `application_id.in.(${appIds.join(",")})` : null, person?.["id"] ? `person_id.eq.${person["id"]}` : null].filter(Boolean);
  if (!ors.length) return false;
  const { data } = await db().from("kyc_verifications").select("id").eq("status", "approved").or(ors.join(",")).limit(1);
  return (data ?? []).length > 0;
}

async function latest(uid: string) {
  const { data } = await db().from("account_identity_checks").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as any;
}

async function logEvent(c: any, event: string, from: string | null, to: string | null, actor: string | null, note: string | null = null) {
  await db().from("account_identity_check_events").insert({ check_id: c.id, user_id: c.user_id, event, from_status: from, to_status: to, note, actor_user_id: actor });
}

export async function accountKycStatus(uid: string) {
  const [r, l] = await Promise.all([roles(uid), latest(uid)]);
  let state = resolveGate({ roles: r, grandfathered: false, latest: (l?.status ?? null) as AccountCheckStatus | null });
  if (!gateOpen(state) && (await grandfathered(uid))) state = "approved";
  return { state, open: gateOpen(state), declineNote: l?.status === "declined" || l?.status === "sent_back" ? (l?.decision_note ?? null) : null, expired: l?.status === "expired" };
}

/** Throws unless the account may use the platform. Used by the server-side gate. */
export async function assertAccountVerified(uid: string) {
  const { isGloballyBlocked } = await import("@/lib/user-access.server");
  if (await isGloballyBlocked(uid)) throw new Response("Access revoked", { status: 403 });
  const s = await accountKycStatus(uid);
  if (!s.open) throw new Response("Identity verification required", { status: 403 });
}

export async function startAccountCheck(uid: string, origin: string) {
  const s = await accountKycStatus(uid);
  if (s.open) return { url: null as string | null, done: true };
  const key = process.env["DIDIT_API_KEY"]?.trim();
  const { diditWorkflowId, personForUser } = await import("@/lib/kyc-verification.server");
  const workflowId = diditWorkflowId();
  if (!key || !workflowId) throw new Error("Identity verification isn't available right now. Please contact Harmonious.");
  let c = await latest(uid);
  if (c && ["pending", "not_started"].includes(c.status) && c.session_url) return { url: String(c.session_url), done: false };
  if (c?.status === "review") throw new Error("Your check is with our compliance team.");
  const person = await personForUser(uid);
  const vendor = `acct:${crypto.randomUUID()}`;
  const ins = await db().from("account_identity_checks").insert({ user_id: uid, person_id: person?.["id"] ?? null, vendor_data: vendor, status: "not_started" }).select("*").single();
  if (ins.error) throw new Error("Couldn't start the identity check.");
  c = ins.data;
  const { buildDiditPrefill } = await import("@/lib/kyc-verification");
  const prefill = buildDiditPrefill(person as any);
  const res = await fetch(DIDIT_SESSION_URL, {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ workflow_id: workflowId, vendor_data: vendor, metadata: { account_check: c.id }, callback: `${origin}/verify-identity`, ...(Object.keys(prefill).length ? { contact_details: prefill, expected_details: prefill } : {}) }),
  });
  const text = await res.text();
  if (!res.ok) { console.error("[account-kyc] session failed", res.status, text.slice(0, 300)); throw new Error("Couldn't start identity verification. Please try again shortly."); }
  const p = JSON.parse(text);
  const url = p.url ?? p.session_url ?? p.verification_url;
  if (!url) throw new Error("The identity provider didn't return a link.");
  await db().from("account_identity_checks").update({ session_id: p.session_id ? String(p.session_id) : null, session_url: url, status: "pending", updated_at: now() }).eq("id", c.id);
  await logEvent(c, "started", "not_started", "pending", uid);
  return { url: String(url), done: false };
}

/** Apply a provider decision (webhook or poll). Approved / review / declined / expired. */
export async function applyAccountDecision(c: any, decision: Record<string, any>) {
  const { normalizeDiditDecision, evaluateDocumentExpiry } = await import("@/lib/kyc-verification");
  const n = normalizeDiditDecision(decision);
  if (["approved", "declined"].includes(c.status) && c.decided_by) return c; // human decision stands
  const exp = evaluateDocumentExpiry({ expirationDate: n.document.expirationDate, verificationDate: new Date() });
  let to: AccountCheckStatus = n.providerStatus === "approved" ? "approved" : n.providerStatus === "declined" ? "declined" : n.providerStatus === "review" ? "review" : "pending";
  if (exp.expired) to = "expired";
  if (to === "approved" && n.aml.hitCount > 0) to = "review";
  if (to === c.status) return c;
  const summary = { document: { type: n.document.documentType, country: n.document.issuingCountry, last4: n.document.numberLast4, expires: n.document.expirationDate }, liveness: n.liveness.status, faceMatch: n.faceMatch.status, address: n.proofOfAddress.status, aml: { status: n.aml.status, hits: n.aml.hitCount } };
  await db().from("account_identity_checks").update({ status: to, decision_summary: summary, warnings: n.warnings.slice(0, 20), updated_at: now() }).eq("id", c.id);
  await logEvent(c, "provider_decision", c.status, to, null);
  return { ...c, status: to };
}

export async function accountCheckByProviderRef(vendorData: string | null, sessionId: string | null) {
  if (vendorData?.startsWith("acct:")) { const { data } = await db().from("account_identity_checks").select("*").eq("vendor_data", vendorData).maybeSingle(); if (data) return data; }
  if (sessionId) { const { data } = await db().from("account_identity_checks").select("*").eq("session_id", sessionId).maybeSingle(); if (data) return data; }
  return null;
}

export async function reconcileAccountCheck(uid: string) {
  const c = await latest(uid);
  if (c?.session_id && c.status === "pending") {
    const { fetchDiditSessionDecision } = await import("@/lib/didit.server");
    const d = await fetchDiditSessionDecision(String(c.session_id));
    if (d) await applyAccountDecision(c, d);
  }
  return accountKycStatus(uid);
}

async function assertDecider(uid: string) {
  if (!(await roles(uid)).some((r) => ACCOUNT_KYC_DECIDERS.includes(r))) throw new Error("Only Harmonious compliance can review identity checks.");
}

export async function accountCheckQueue(uid: string) {
  await assertDecider(uid);
  const { data } = await db().from("account_identity_checks").select("id, user_id, status, decision_summary, warnings, decision_note, created_at, updated_at, decided_at").order("updated_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as any[];
  const emails = new Map<string, string>();
  await Promise.all([...new Set(rows.map((r) => r.user_id))].map(async (id) => { const { data: u } = await db().auth.admin.getUserById(id); if (u?.user?.email) emails.set(id, u.user.email); }));
  return rows.map((r) => ({ ...r, email: emails.get(r.user_id) ?? "Unknown" }));
}

export async function decideAccountCheck(uid: string, checkId: string, action: "approve" | "decline" | "send_back", note: string | null) {
  await assertDecider(uid);
  const { data: c } = await db().from("account_identity_checks").select("*").eq("id", checkId).maybeSingle();
  if (!c) throw new Error("Check not found.");
  if (c.user_id === uid) throw new Error("You can't decide your own identity check.");
  if (action !== "approve" && !note?.trim()) throw new Error("Add a note explaining why.");
  if (action === "approve" && c.status !== "review") throw new Error("Only checks marked Needs review can be approved by hand.");
  if (c.status === "approved" && action !== "send_back") throw new Error("Already approved.");
  const to = action === "approve" ? "approved" : action === "decline" ? "declined" : "sent_back";
  await db().from("account_identity_checks").update({ status: to, decided_by: uid, decided_at: now(), decision_note: note?.trim() || null, updated_at: now() }).eq("id", checkId);
  await logEvent(c, `staff_${action}`, c.status, to, uid, note?.trim() || null);
  return { ok: true };
}
