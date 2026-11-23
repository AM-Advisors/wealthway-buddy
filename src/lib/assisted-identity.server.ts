/**
 * Helper-run identity check: a helper checks the investor's government ID (no selfie or face match)
 * against the details already on the investor record. Clears the investor's identity only through
 * assistedOutcome; screening keeps its own result. ID images go to the identity provider and are never stored.
 * Authority: Harmonious staff, this fund's managers or fund team, or the investment's own named helper.
 */
import { onboardingActor, forbid } from "@/lib/investor-onboarding.server";
import { ASSISTED_MODE, assistedCanRun, assistedOutcome, assistedTriesLeft, missingRecordDetails, type IdFacts } from "@/lib/assisted-identity-model";

const DIDIT = "https://verification.didit.me/v2";
const TERMINAL = ["closed", "declined", "cancelled"];
type Role = "harmonious" | "manager" | "fund_team" | "helper";
type FileIn = { base64: string; contentType: string; fileName: string };

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
function fail(m: string): never { throw new Error(m); }

async function access(userId: string, onboardingId: string, preparerId?: string | null): Promise<{ row: any; role: Role; actorUserId: string }> {
  const d = await db();
  const { data: row } = await d.from("investor_onboardings").select("id, offering_id, person_id, investor_user_id, stage, removed_at").eq("id", onboardingId).maybeSingle();
  if (!row) fail("That investment was not found.");
  if (row.removed_at || TERMINAL.includes(String(row.stage))) fail("This investment can no longer be changed.");
  if (preparerId) {
    const { activePreparer } = await import("@/lib/onboarding-participants.server");
    const p = await activePreparer(userId, preparerId, onboardingId);
    return { row, role: "helper", actorUserId: p.userId };
  }
  const actor = await onboardingActor(userId);
  if (actor.isStaff) return { row, role: "harmonious", actorUserId: userId };
  if (actor.managedOfferingIds.includes(row.offering_id)) return { row, role: "manager", actorUserId: userId };
  const { routineReviewer } = await import("@/lib/fund-routine-access.server");
  if (await routineReviewer(d, userId, row.offering_id)) return { row, role: "fund_team", actorUserId: userId };
  if (row.investor_user_id === userId) forbid("use your own Verification step to check your identity.");
  forbid("you are not helping with this investment.");
}

async function recentTries(d: any, personId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await d.from("person_kyc_requests").select("id", { count: "exact", head: true }).eq("person_id", personId).eq("mode", ASSISTED_MODE).gte("created_at", since);
  return Number(count ?? 0);
}

const nameOf = (p: any) => [p?.legal_first_name, p?.legal_middle_name, p?.legal_last_name].filter(Boolean).join(" ").trim();
const recordOf = (p: any) => ({ firstName: p?.legal_first_name ?? null, middleName: p?.legal_middle_name ?? null, lastName: p?.legal_last_name ?? null, dateOfBirth: p?.date_of_birth ? String(p.date_of_birth).slice(0, 10) : null });

/** What the helper sees before running the check. */
export async function assistedIdentityStatus(userId: string, input: { onboardingId: string; preparerId?: string | null | undefined }) {
  const { row } = await access(userId, input.onboardingId, input.preparerId);
  const d = await db();
  if (!row.person_id) return { kyc: "not_started", missing: ["investor"], triesLeft: 0, canRun: false, blocker: "Add the investor's details first." };
  const { data: p } = await d.from("persons").select("legal_first_name, legal_middle_name, legal_last_name, date_of_birth, kyc_status").eq("id", row.person_id).maybeSingle();
  const missing = missingRecordDetails(recordOf(p));
  const can = assistedCanRun(p?.kyc_status ?? null);
  const triesLeft = assistedTriesLeft(await recentTries(d, row.person_id));
  const { data: last } = await d.from("person_kyc_requests").select("status, result_summary, created_at").eq("person_id", row.person_id).eq("mode", ASSISTED_MODE).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const blocker = !can.ok ? can.reason : missing.length ? `Add the investor's ${missing.join(", ")} first.` : triesLeft === 0 ? "Three tries were used in the last day. Try again tomorrow or ask Harmonious to review." : null;
  return {
    kyc: String(p?.kyc_status ?? "not_started"), missing, triesLeft, canRun: !blocker, blocker,
    investorName: nameOf(p) || null,
    last: last ? { cleared: last.status === "approved", reasons: ((last.result_summary as any)?.reasons ?? []) as string[], at: String(last.created_at) } : null,
  };
}

export async function runAssistedIdentityCheck(userId: string, input: {
  onboardingId: string; preparerId?: string | null | undefined; documentType: "drivers_license" | "passport" | "state_id";
  front: FileIn; back?: FileIn | null | undefined; permission: boolean;
}) {
  if (!input.permission) fail("Confirm you have the investor's permission and this is their own ID.");
  const { row, role, actorUserId } = await access(userId, input.onboardingId, input.preparerId);
  if (!row.person_id) fail("Add the investor's details first.");
  const d = await db();
  const { data: p } = await d.from("persons").select("id, legal_first_name, legal_middle_name, legal_last_name, date_of_birth, citizenship_country, kyc_status, aml_status").eq("id", row.person_id).maybeSingle();
  if (!p) fail("The investor's details were not found.");
  const can = assistedCanRun(p.kyc_status ?? null);
  if (!can.ok) fail(can.reason);
  const record = recordOf(p);
  const missing = missingRecordDetails(record);
  if (missing.length) fail(`Add the investor's ${missing.join(", ")} first, then run the check.`);
  if (assistedTriesLeft(await recentTries(d, p.id)) === 0) fail("Three tries were used in the last day. Try again tomorrow or ask Harmonious to review.");

  const key = process.env["DIDIT_API_KEY"]?.trim();
  if (!key) fail("Identity checks aren't configured yet.");
  const blob = (f: FileIn) => new Blob([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], { type: f.contentType || "image/jpeg" });
  const form = new FormData();
  form.append("front_image", blob(input.front), input.front.fileName);
  if (input.back) form.append("back_image", blob(input.back), input.back.fileName);
  const idRes = await fetch(`${DIDIT}/id-verification/`, { method: "POST", headers: { "x-api-key": key }, body: form });
  const idText = await idRes.text();
  if (!idRes.ok) { console.error("[assisted-identity] id check failed", idRes.status); fail("The ID photo couldn't be checked right now. Please try again in a few minutes."); }
  const idj = JSON.parse(idText);
  const idv = idj.id_verification ?? idj;
  const id: IdFacts = {
    status: idv.status ?? null, firstName: idv.first_name ?? null, lastName: idv.last_name ?? null, fullName: idv.full_name ?? null,
    dateOfBirth: idv.date_of_birth ? String(idv.date_of_birth).slice(0, 10) : null, expirationDate: idv.expiration_date ? String(idv.expiration_date).slice(0, 10) : null,
  };
  const now = new Date().toISOString();
  const outcome = assistedOutcome(record, id, now.slice(0, 10));

  // Watchlist screening runs with the record's legal name whenever the ID itself was readable.
  let aml: string | null = null;
  if (outcome.cleared) {
    try {
      const { iso2, amlFromResponse } = await import("@/lib/prior-verification.server");
      const nat = iso2(p.citizenship_country) ?? iso2(idv.nationality ?? idv.issuing_state ?? null);
      const amlRes = await fetch(`${DIDIT}/aml/`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify({ full_name: nameOf(p), date_of_birth: record.dateOfBirth, ...(nat ? { nationality: nat } : {}) }) });
      const amlText = await amlRes.text();
      if (amlRes.ok) aml = amlFromResponse(JSON.parse(amlText));
      else console.error("[assisted-identity] screening failed", amlRes.status);
    } catch (e) { console.error("[assisted-identity] screening error", (e as Error).message); }
  }

  const summary = {
    runBy: role, permissionConfirmed: true, noFaceMatch: true, documentType: input.documentType, idStatus: id.status,
    nameMatched: !outcome.reasons.some((r) => r.startsWith("The name")), birthdayMatched: !outcome.reasons.some((r) => r.startsWith("The date of birth")),
    expiry: id.expirationDate, documentNumberLast4: idv.document_number ? String(idv.document_number).slice(-4) : null, reasons: outcome.reasons,
    note: "Identity check run by a helper with the investor's ID photo. No selfie or face match.",
  };
  await d.from("person_kyc_requests").insert({
    person_id: p.id, mode: ASSISTED_MODE, document_type: input.documentType, session_id: idj.request_id ?? null,
    status: outcome.cleared ? "approved" : "not_cleared", id_status: id.status, aml_status: aml, result_summary: summary, created_by: actorUserId,
  });

  if (outcome.cleared) {
    const patch: Record<string, unknown> = { kyc_status: "approved", kyc_verified_at: now, identity_verified_at: now, updated_at: now };
    if (aml) { patch["aml_status"] = aml; patch["aml_screened_at"] = now; }
    // Never overturn a decline that happened meanwhile.
    await d.from("persons").update(patch).eq("id", p.id).neq("kyc_status", "declined");
    if (aml === "approved") { const { recheckTinsForPerson } = await import("@/lib/account-connect.server"); await recheckTinsForPerson(p.id); }
  }
  await d.from("investor_onboarding_events").insert({
    onboarding_id: row.id, offering_id: row.offering_id, event: outcome.cleared ? "identity_cleared_by_helper" : "identity_check_by_helper_not_cleared",
    actor_user_id: actorUserId, actor_role: role === "harmonious" ? "harmonious" : "manager", detail: { runBy: role, noFaceMatch: true, idStatus: id.status, aml, reasons: outcome.reasons },
  });
  if (outcome.cleared) {
    try {
      const engine = await import("@/lib/investor-onboarding.server");
      await engine.reconcileInvestmentReadiness(row.id, { actorUserId, trigger: "identity_cleared_by_helper" });
    } catch (e) { console.error("[assisted-identity] readiness refresh failed", (e as Error).message); }
    const { notifyVerificationConfirmation } = await import("@/lib/ops-slack-notify.server");
    const notice = { ref: `${row.id}:assisted:${now}`, offeringId: row.offering_id, path: `/ops/fund/${encodeURIComponent(row.offering_id)}?tab=investors` };
    await notifyVerificationConfirmation({ ...notice, check: "KYC", status: "approved" }).catch(() => null);
    if (aml) await notifyVerificationConfirmation({ ...notice, ref: `${notice.ref}:aml`, check: "AML", status: aml }).catch(() => null);
  }
  return { cleared: outcome.cleared, reasons: outcome.reasons, screening: aml };
}
