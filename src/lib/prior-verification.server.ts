/**
 * Load an investor's details from an earlier identity/business verification done
 * elsewhere, fill in what's missing, then rerun checks.
 * Authority: Harmonious staff or that exact fund's managers (assertOnboardingAccess).
 * Loaded data never approves anything by itself:
 *  - person screening (AML) is rerun with the identity provider and its result applies;
 *  - identity (KYC) needs the person's own ID + selfie, so a fresh link is emailed;
 *  - business (KYB) details go to Harmonious review, with entity screening rerun.
 */
import { assertOnboardingAccess } from "@/lib/investor-onboarding.server";

const DIDIT = "https://verification.didit.me/v2";
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

const PERSON_REQUIRED: [string, string][] = [
  ["legal_first_name", "Legal first name"], ["legal_last_name", "Last name"], ["email", "Email"], ["phone", "Phone"],
  ["date_of_birth", "Date of birth"], ["citizenship_country", "Citizenship"], ["address_line1", "Street address"],
  ["city", "City"], ["region", "State / region"], ["postal_code", "Postal code"], ["country", "Country"],
];
const ENTITY_REQUIRED: [string, string][] = [
  ["legal_name", "Entity legal name"], ["entity_type", "Entity type"], ["formation_jurisdiction", "Formation jurisdiction"],
  ["formation_date", "Formation date"], ["address_line1", "Entity street address"], ["city", "Entity city"],
  ["region", "Entity state / region"], ["postal_code", "Entity postal code"], ["country", "Entity country"],
];

const COUNTRY: Record<string, string> = { "united states": "US", usa: "US", "u.s.": "US", us: "US", america: "US", canada: "CA", "united kingdom": "GB", uk: "GB", india: "IN", china: "CN", taiwan: "TW", mexico: "MX", germany: "DE", france: "FR", australia: "AU", japan: "JP", singapore: "SG", "hong kong": "HK", israel: "IL", brazil: "BR" };
export function iso2(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY[s.toLowerCase()] ?? null;
}
export function amlFromResponse(a: any): "approved" | "review" | "declined" | "pending" {
  const aml = a?.aml ?? a ?? {};
  const hits = Number(aml.total_hits ?? (Array.isArray(aml.hits) ? aml.hits.length : 0)) || 0;
  const st = String(aml.status ?? "").toLowerCase();
  if (st === "declined") return "declined";
  if (st === "in review" || hits > 0) return "review";
  return st === "approved" ? "approved" : "pending";
}

async function access(userId: string, onboardingId: string) {
  const a = await assertOnboardingAccess(userId, onboardingId);
  if (a.role === "investor") throw new Error("Only Harmonious or this fund's managers can do this.");
  return a;
}
async function entityProfile(d: any, profileId: string | null) {
  if (!profileId) return null;
  const { data: p } = await d.from("investment_profiles").select("id, profile_type, legal_name").eq("id", profileId).maybeSingle();
  if (!p || ["individual", "joint"].includes(String(p.profile_type))) return null;
  const { data: ev } = await d.from("entity_verifications").select("*").eq("profile_id", p.id).maybeSingle();
  return { profile: p, ev };
}

export async function missingInfo(userId: string, onboardingId: string) {
  const { row } = await access(userId, onboardingId);
  const d = await db();
  const { data: p } = row.person_id ? await d.from("persons").select("*").eq("id", row.person_id).maybeSingle() : { data: null };
  const ent = await entityProfile(d, row.investment_profile_id);
  const evOrProfile = { ...(ent?.ev ?? {}), legal_name: ent?.ev?.legal_name ?? ent?.profile?.legal_name };
  return {
    person: PERSON_REQUIRED.filter(([k]) => blank(p?.[k])).map(([, l]) => l),
    entity: ent ? ENTITY_REQUIRED.filter(([k]) => blank((evOrProfile as any)[k])).map(([, l]) => l) : null,
    kyc: p?.kyc_status ?? "not_started", aml: p?.aml_status ?? "not_started",
    kyb: ent ? (ent.ev?.kyb_status ?? "not_started") : null, entityAml: ent ? (ent.ev?.entity_aml_status ?? "not_started") : null,
    hasEmail: !blank(p?.email),
  };
}

export type PriorInput = {
  onboardingId: string; provider: string; checkedOn: string; reference?: string | null;
  person?: Record<string, string>; entity?: Record<string, string>;
  rerun: { aml: boolean; kycLink: boolean; kyb: boolean };
};

async function screen(body: Record<string, unknown>) {
  const key = process.env["DIDIT_API_KEY"]?.trim();
  if (!key) throw new Error("Screening isn't configured yet.");
  const res = await fetch(`${DIDIT}/aml/`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) { console.error("[prior-verification] screening failed", res.status, text.slice(0, 300)); throw new Error(`Screening couldn't run [${res.status}].`); }
  return amlFromResponse(JSON.parse(text));
}

export async function loadPriorVerification(userId: string, input: PriorInput) {
  const { row, role } = await access(userId, input.onboardingId);
  const d = await db();
  const out: { saved: number; suggested: number; aml?: string; kycLink?: "emailed" | "created"; kyb?: string; entityAml?: string; warnings: string[] } = { saved: 0, suggested: 0, warnings: [] };

  // 1) Fill in details through the normal investor-record path (edit window, suggestions, history).
  const p = input.person ?? {};
  const map: Record<string, string> = { legal_first_name: "firstName", legal_middle_name: "middleName", legal_last_name: "lastName", email: "email", phone: "phone", date_of_birth: "dateOfBirth", citizenship_country: "citizenship", address_line1: "addressLine1", address_line2: "addressLine2", city: "city", region: "region", postal_code: "postalCode", country: "country" };
  const person: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (map[k] && v?.trim()) person[map[k]] = v.trim();
  if (Object.keys(person).length) {
    const { updateInvestorRecord } = await import("@/lib/investor-record.server");
    const r: any = await updateInvestorRecord(userId, { onboardingId: row.id, person: person as any });
    out.saved += Number(r?.changed ?? 0); out.suggested += Number(r?.suggested ?? 0);
  }

  // 2) Keep a record of the earlier check (informational; never sets a status).
  if (row.person_id) {
    await d.from("person_kyc_requests").insert({
      person_id: row.person_id, mode: "prior", status: "recorded", created_by: userId,
      result_summary: { provider: input.provider, checkedOn: input.checkedOn, reference: input.reference ?? null, loadedBy: role, fields: Object.keys(person), info: "Details loaded from an earlier verification. Not a Harmonious verification; does not change KYC/AML status." },
    });
  }

  // 3) Entity / KYB details → Harmonious review.
  const ent = await entityProfile(d, row.investment_profile_id);
  const e = input.entity ?? {};
  if (ent && Object.values(e).some((v) => v?.trim())) {
    if (ent.ev?.kyb_status === "approved") out.warnings.push("The business is already verified, so its details weren't changed.");
    else {
      const allowed = ["legal_name", "entity_type", "formation_jurisdiction", "formation_date", "address_line1", "address_line2", "city", "region", "postal_code", "country"];
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of allowed) if (e[k]?.trim()) patch[k] = e[k].trim();
      if (patch["formation_date"] && !/^\d{4}-\d{2}-\d{2}$/.test(String(patch["formation_date"]))) throw new Error("Use YYYY-MM-DD for the formation date.");
      const res = ent.ev
        ? await d.from("entity_verifications").update(patch).eq("id", ent.ev.id)
        : await d.from("entity_verifications").insert({ profile_id: ent.profile.id, ...patch });
      if (res.error) throw new Error(res.error.message);
      out.saved += allowed.filter((k) => patch[k]).length;
    }
  }

  // 4) Reruns.
  const { data: cur } = row.person_id ? await d.from("persons").select("*").eq("id", row.person_id).maybeSingle() : { data: null };
  const now = new Date().toISOString();
  if (input.rerun.aml) {
    if (!cur) out.warnings.push("No person on this investment to screen.");
    else {
      const fullName = [cur.legal_first_name, cur.legal_middle_name, cur.legal_last_name].filter(Boolean).join(" ");
      if (!fullName) out.warnings.push("Add the legal name before screening.");
      else {
        const nat = iso2(cur.citizenship_country);
        const st = await screen({ full_name: fullName, ...(cur.date_of_birth ? { date_of_birth: cur.date_of_birth } : {}), ...(nat ? { nationality: nat } : {}) });
        await d.from("persons").update({ aml_status: st, aml_screened_at: now }).eq("id", cur.id);
        await d.from("person_kyc_requests").insert({ person_id: cur.id, mode: "document", status: "completed", aml_status: st, created_by: userId, result_summary: { rerunAfterPriorLoad: true, provider: input.provider, note: "Screening rerun from loaded details. Not full identity verification." } });
        out.aml = st;
        if (st === "approved") { const { recheckTinsForPerson } = await import("@/lib/account-connect.server"); await recheckTinsForPerson(cur.id); }
      }
    }
  }
  if (input.rerun.kycLink) {
    if (!cur?.email) out.warnings.push("Add an email so the identity check link can be sent.");
    else {
      const { sendPersonKycLink } = await import("@/lib/person-kyc-link.server");
      const r = await sendPersonKycLink(cur, userId);
      out.kycLink = r.emailed ? "emailed" : "created";
      if (cur.kyc_status === "not_started") await d.from("persons").update({ kyc_status: "pending" }).eq("id", cur.id);
    }
  }
  if (input.rerun.kyb) {
    const fresh = await entityProfile(d, row.investment_profile_id);
    if (!fresh) out.warnings.push("This investment isn't through a business or trust, so there's no business check.");
    else {
      const name = fresh.ev?.legal_name ?? fresh.profile.legal_name;
      if (!name) out.warnings.push("Add the entity legal name before rerunning the business check.");
      else {
        const nat = iso2(fresh.ev?.country ?? fresh.ev?.formation_jurisdiction);
        const st = await screen({ full_name: name, entity_type: "company", ...(nat ? { nationality: nat } : {}) });
        const patch = { entity_aml_status: st, screened_at: now, ...(fresh.ev?.kyb_status === "approved" ? {} : { kyb_status: "review", submitted_at: now }), updated_at: now };
        if (fresh.ev) await d.from("entity_verifications").update(patch).eq("id", fresh.ev.id);
        else await d.from("entity_verifications").insert({ profile_id: fresh.profile.id, legal_name: name, ...patch });
        out.entityAml = st; out.kyb = fresh.ev?.kyb_status === "approved" ? "approved" : "review";
      }
    }
  }

  await d.from("investor_onboarding_events").insert({ onboarding_id: row.id, offering_id: row.offering_id, event: "prior_verification_loaded", actor_user_id: userId, detail: { provider: input.provider, checkedOn: input.checkedOn, rerun: input.rerun, aml: out.aml ?? null, kyb: out.kyb ?? null } });
  const { notifyVerificationConfirmation } = await import("@/lib/ops-slack-notify.server");
  const notice = { ref: `${row.id}:${now}`, offeringId: row.offering_id, path: `/ops/fund/${encodeURIComponent(row.offering_id)}?tab=investors` };
  await notifyVerificationConfirmation({ ...notice, check: "AML", status: out.aml });
  await notifyVerificationConfirmation({ ...notice, check: "KYB", status: out.kyb });
  await notifyVerificationConfirmation({ ...notice, ref: `${notice.ref}:entity`, check: "AML", status: out.entityAml });
  return out;
}
