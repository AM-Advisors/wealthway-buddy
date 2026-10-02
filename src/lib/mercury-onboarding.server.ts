// Mercury Onboarding API: pre-fills a Mercury application and returns a sign-up link.
// Harmonious never submits the application, links or funds an account, or moves money.
import { createHash } from "crypto";

const SITE = "https://app.harmonious.co";

export type MercuryAddress = { address1: string; address2?: string | undefined; city: string; region: string; postalCode: string };
export type MercuryStartInput = {
  offeringId: string;
  address: MercuryAddress;
  phone?: string | undefined;
  website?: string | undefined;
  description?: string | undefined;
  formationDoc?: undefined | { fileName: string; base64: string; type: "ArticlesOfOrganization" | "CertificateOfFormation" | "PartnershipAgreement" | "ArticlesOfIncorporation" };
};

export function mercuryConfigured() {
  return Boolean(process.env["MERCURY_API_TOKEN"] && process.env["MERCURY_PARTNER_ID"]);
}

function baseUrl() {
  return process.env["MERCURY_ENV"] === "production"
    ? "https://api.mercury.com/api/v1"
    : "https://api-sandbox.mercury.com/api/v1";
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") || null };
}

/** What Harmonious has on file for this fund, and what's still missing before sending. */
export async function mercuryReadiness(offeringId: string) {
  const db = await admin();
  const [{ data: offering }, { data: detail }, { data: team }, { data: existing }] = await Promise.all([
    db.from("offerings").select("name, legal_entity_name, entity_type, principal_address, summary").eq("id", offeringId).maybeSingle(),
    db.rpc("get_offering_entity_details", { p_offering_id: offeringId }).maybeSingle(),
    db.from("fund_team_members").select("full_name, email, phone, team_role").eq("offering_id", offeringId).is("removed_at", null).in("team_role", ["gp", "manager"]),
    db.from("offering_bank_setup_requests").select("id, signup_link, provider_status, created_at").eq("offering_id", offeringId).eq("bank", "mercury").not("signup_link", "is", null).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const owners = ((team ?? []) as any[]).map((m) => ({ name: String(m.full_name ?? ""), email: m.email ?? null, phone: m.phone ?? null, role: String(m.team_role) }));
  const ein = String((detail as any)?.ein ?? "").replace(/\D/g, "");
  const legalName = String((offering as any)?.legal_entity_name ?? "").trim();
  const missing: string[] = [];
  if (!legalName) missing.push("Fund legal name (Fund Details)");
  if (owners.length === 0) missing.push("At least one Manager / GP on the Team tab");
  return {
    configured: mercuryConfigured(),
    legalName,
    fundName: String((offering as any)?.name ?? ""),
    entityType: String((offering as any)?.entity_type ?? ""),
    addressOnFile: String((offering as any)?.principal_address ?? ""),
    hasEin: ein.length === 9,
    owners,
    missing,
    existing: existing ? { id: String((existing as any).id), signupLink: String((existing as any).signup_link), status: String((existing as any).provider_status ?? "application_started") } : null,
  };
}

export async function startMercuryApplication(input: MercuryStartInput, actor: { userId: string; email: string | null }) {
  if (!mercuryConfigured()) throw new Error("Mercury isn't connected yet. Use \"Ask Harmonious to open it\" for now.");
  const ready = await mercuryReadiness(input.offeringId);
  if (ready.existing) return { id: ready.existing.id, signupLink: ready.existing.signupLink, reused: true };
  if (ready.missing.length) throw new Error(`Still needed before sending to Mercury: ${ready.missing.join("; ")}.`);

  const db = await admin();
  const { data: detail } = await db.rpc("get_offering_entity_details", { p_offering_id: input.offeringId }).maybeSingle();
  const ein = String((detail as any)?.ein ?? "").replace(/\D/g, "");
  const useFormation = ein.length === 9 && input.formationDoc;

  const addr = { ...input.address, address2: input.address.address2 || null, country: "US" };
  const body: Record<string, unknown> = {
    partner: process.env["MERCURY_PARTNER_ID"],
    applicationType: useFormation ? "DefaultApplication" : "PendingEINApplication",
    inviteEmail: actor.email ?? undefined,
    about: {
      legalBusinessName: ready.legalName,
      description: input.description || `Investment fund (${ready.fundName}) administered by Harmonious.`,
      industry: "Investment fund",
      website: input.website || null,
      countryOfOperation: "US",
    },
    businessLegalAddress: addr,
    businessPhysicalAddress: addr,
    businessContactDetails: { address1: addr.address1, address2: addr.address2, city: addr.city, state: addr.region, postalCode: addr.postalCode, country: "US", phoneNumber: input.phone || null },
    beneficialOwners: ready.owners.map((o) => ({
      ...splitName(o.name),
      email: o.email,
      phoneNumber: o.phone,
      jobTitle: o.role === "gp" ? "GeneralPartner" : "Other",
      otherJobTitle: o.role === "gp" ? null : "Fund manager",
    })),
  };
  if (useFormation) {
    body["formationDetails"] = {
      federalEin: `${ein.slice(0, 2)}-${ein.slice(2)}`,
      formationDocumentFileBlob: input.formationDoc!.base64,
      formationDocumentType: input.formationDoc!.type,
      companyOriginCountry: "US",
    };
  }

  const { data: req, error } = await db.from("offering_bank_setup_requests").insert({
    offering_id: input.offeringId, bank: "mercury", status: "in_progress", requested_by: actor.userId,
    requested_by_email: actor.email, note: "Mercury application pre-filled through the Mercury API.", provider_status: "sending",
  }).select("id").single();
  if (error) throw new Error(error.message);
  const requestId = String((req as any).id);
  const secret = process.env["MERCURY_WEBHOOK_SECRET"];
  if (secret) body["webhookURL"] = `${SITE}/api/public/mercury/onboarding?token=${encodeURIComponent(secret)}&request=${requestId}`;

  const res = await fetch(`${baseUrl()}/submit-onboarding-data`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env["MERCURY_API_TOKEN"]}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("mercury onboarding failed", res.status);
    await db.from("offering_bank_setup_requests").update({ status: "cancelled", provider_status: "failed" }).eq("id", requestId);
    await db.from("bank_application_events").insert({ request_id: requestId, status: "failed", source: "harmonious", actor_id: actor.userId, summary: { http: res.status } });
    throw new Error(`Mercury didn't accept the details (status ${res.status}). Harmonious has been notified; try again or ask Harmonious to open it.`);
  }
  const out = JSON.parse(text) as { signupLink: string; onboardingDataId: string };
  const hash = createHash("sha256").update(JSON.stringify({ ...body, formationDetails: useFormation ? "[file]" : undefined })).digest("hex");
  await db.from("offering_bank_setup_requests").update({
    provider_ref: out.onboardingDataId, signup_link: out.signupLink, provider_status: "application_started", submitted_payload_hash: hash,
  }).eq("id", requestId);
  await db.from("bank_application_events").insert({
    request_id: requestId, status: "application_started", source: "harmonious", actor_id: actor.userId,
    summary: { owners: ready.owners.length, applicationType: body["applicationType"], formationDocument: Boolean(useFormation) },
  });
  return { id: requestId, signupLink: out.signupLink, reused: false };
}

/** Status callback from Mercury. Caller already verified by the route. */
export async function recordMercuryStatus(requestId: string, rawStatus: string) {
  const db = await admin();
  const s = rawStatus.toLowerCase();
  const status = s.includes("approv") ? "approved" : s.includes("submit") ? "submitted" : s.includes("info") || s.includes("pending") ? "needs_info" : s.includes("reject") || s.includes("declin") ? "declined" : s.slice(0, 40) || "updated";
  const { data } = await db.from("offering_bank_setup_requests").select("id").eq("id", requestId).eq("bank", "mercury").maybeSingle();
  if (!data) return false;
  await db.from("offering_bank_setup_requests").update({ provider_status: status, ...(status === "approved" ? { status: "opened" } : {}) }).eq("id", requestId);
  await db.from("bank_application_events").insert({ request_id: requestId, status, source: "mercury", summary: { raw: rawStatus.slice(0, 80) } });
  return true;
}
