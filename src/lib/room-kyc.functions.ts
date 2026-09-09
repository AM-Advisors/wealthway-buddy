import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requiresPreExistingRelationship, type RegTypeValue } from "@/lib/reg-types";
import { kycSchema } from "@/lib/onboarding.functions";

/**
 * The investor's own KYC application, taken inside the fund's investor room:
 * who they are, a government ID, a proof of address and how they qualify as an
 * accredited investor. Everything lands in review — a fund administrator or an
 * assigned manager has to approve it before the wire step opens.
 */

const ROOM_DOC_KINDS = ["identification", "proof_of_address"] as const;

async function applicationForOffering(supabase: any, userId: string, offeringId: string) {
  const existing = await supabase
    .from("investor_applications")
    .select(
      "id, offering_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, submitted_at",
    )
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (existing.data) return existing.data;

  // Only people who were given access to this fund get an application.
  const access = await supabase
    .from("investor_fund_access")
    .select("offering_id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (!access.data) return null;

  const created = await supabase
    .from("investor_applications")
    .insert({ user_id: userId, offering_id: offeringId, current_step: "kyc", source: "portal" })
    .select(
      "id, offering_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, submitted_at",
    )
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data;
}

export const getRoomApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    const { data: offering } = await supabase
      .from("offerings")
      .select("id, name, reg_type, min_investment_cents")
      .eq("id", data.offering_id)
      .maybeSingle();
    if (!offering) throw new Error("That fund is not available to you.");

    let { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) {
      const inserted = await supabase
        .from("profiles")
        .insert({ user_id: userId, email: (claims["email"] as string) ?? null })
        .select("*")
        .single();
      profile = inserted.data;
    }

    const application = await applicationForOffering(supabase, userId, data.offering_id);
    if (!application) {
      return { offering, profile, application: null, kyc: null, accreditation: null, uploads: [] };
    }

    const [kyc, accreditation, uploads] = await Promise.all([
      supabase
        .from("kyc_verifications")
        .select("status, result, updated_at")
        .eq("application_id", application.id)
        .maybeSingle(),
      supabase
        .from("accreditation_records")
        .select("status, method, questionnaire, attested_at, attested_signature, review_notes")
        .eq("application_id", application.id)
        .maybeSingle(),
      supabase
        .from("investor_documents")
        .select("id, file_name, doc_kind, uploaded_at, review_status, review_note, box_uploaded_at")
        .eq("application_id", application.id)
        .in("doc_kind", ROOM_DOC_KINDS as unknown as string[])
        .order("uploaded_at", { ascending: false }),
    ]);

    return {
      offering,
      profile,
      application,
      kyc: kyc.data ?? null,
      accreditation: accreditation.data ?? null,
      uploads: uploads.data ?? [],
    };
  });

/** Saves the identity details without submitting them for review yet. */
export const saveRoomIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    kycSchema.extend({ offering_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await applicationForOffering(supabase, userId, data.offering_id);
    if (!application) throw new Error("You do not have access to this fund yet.");

    const now = new Date().toISOString();
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        legal_name: data.legal_name,
        investor_type: data.investor_type,
        email: data.email,
        phone: data.phone,
        date_of_birth: data.date_of_birth,
        tax_id: data.tax_id,
        entity_name: data.entity_name || null,
        address_line1: data.address_line1,
        address_line2: data.address_line2 || null,
        city: data.city,
        region: data.region,
        postal_code: data.postal_code,
        country: data.country,
        updated_at: now,
      })
      .eq("user_id", userId);
    if (profileError) throw new Error(profileError.message);

    const identity = {
      id_document_type: data.id_document_type,
      id_document_number_last4: data.id_document_number.slice(-4),
      id_issuing_country: data.id_issuing_country,
      id_expiration: data.id_expiration,
      saved_at: now,
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await supabaseAdmin
      .from("kyc_verifications")
      .select("id")
      .eq("application_id", application.id)
      .maybeSingle();

    if (existing.data) {
      const { error } = await supabaseAdmin
        .from("kyc_verifications")
        .update({ result: identity, provider: "manual", updated_at: now })
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("kyc_verifications")
        .insert({
          application_id: application.id,
          provider: "manual",
          status: "not_started",
          result: identity,
        });
      if (error) throw new Error(error.message);
    }

    return { ok: true, applicationId: application.id as string };
  });

/** Records an ID or proof-of-address file uploaded from inside the room. */
export const recordRoomUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        storage_path: z.string().min(1).max(500),
        file_name: z.string().min(1).max(255),
        doc_kind: z.enum(ROOM_DOC_KINDS),
        note: z.string().trim().max(500).optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.storage_path.startsWith(`${userId}/`)) throw new Error("Invalid upload path.");

    const application = await applicationForOffering(supabase, userId, data.offering_id);
    if (!application) throw new Error("You do not have access to this fund yet.");

    const { data: inserted, error } = await supabase
      .from("investor_documents")
      .insert({
        application_id: application.id,
        offering_id: data.offering_id,
        user_id: userId,
        storage_path: data.storage_path,
        file_name: data.file_name,
        doc_kind: data.doc_kind,
        note: data.note ? data.note : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    let filedToBox = false;
    try {
      const { archiveInvestorUploadToBox } = await import("@/lib/investor-box.server");
      const result = await archiveInvestorUploadToBox(inserted.id as string);
      filedToBox = Boolean(result.ok && result.boxFileId);
    } catch (boxError) {
      console.error("[room-kyc] box filing failed", boxError);
    }

    return { ok: true, id: inserted.id as string, filedToBox };
  });

const accreditationSchema = z.object({
  offering_id: z.string().uuid(),
  basis: z.enum([
    "income",
    "net_worth",
    "professional_certification",
    "entity_assets",
    "knowledgeable_employee",
  ]),
  income_last_two_years: z.boolean(),
  net_worth_over_1m: z.boolean(),
  professional_license: z.string().trim().max(120).optional().or(z.literal("")),
  pre_existing_relationship: z.string().trim().max(600).optional().or(z.literal("")),
  attested_signature: z.string().trim().min(2, "Type your full legal name").max(120),
  attests: z.literal(true),
});

/** Saves the accreditation answers. A reviewer still has to approve them. */
export const saveRoomAccreditation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => accreditationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await applicationForOffering(supabase, userId, data.offering_id);
    if (!application) throw new Error("You do not have access to this fund yet.");

    const { data: offering } = await supabase
      .from("offerings")
      .select("reg_type")
      .eq("id", data.offering_id)
      .maybeSingle();

    const qualifies =
      data.income_last_two_years ||
      data.net_worth_over_1m ||
      data.basis === "professional_certification" ||
      data.basis === "entity_assets" ||
      data.basis === "knowledgeable_employee";
    if (!qualifies) {
      throw new Error(
        "Based on your answers you do not currently meet the accredited investor standard for this offering.",
      );
    }

    if (requiresPreExistingRelationship(offering?.reg_type) && (data.pre_existing_relationship ?? "").length < 10) {
      throw new Error("Describe your existing relationship with the fund manager.");
    }

    const now = new Date().toISOString();
    const payload = {
      application_id: application.id,
      reg_type: (offering?.reg_type ?? "506b") as RegTypeValue,
      method: data.basis,
      questionnaire: { ...data, submitted_at: now },
      qualifies: true,
      pre_existing_relationship: data.pre_existing_relationship || null,
      attested_at: now,
      attested_signature: data.attested_signature,
      status: "review" as const,
      updated_at: now,
    };

    const existing = await supabase
      .from("accreditation_records")
      .select("id")
      .eq("application_id", application.id)
      .maybeSingle();

    if (existing.data) {
      const { error } = await supabase
        .from("accreditation_records")
        .update(payload)
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("accreditation_records").insert(payload);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

/**
 * Hands the whole application to the fund team. Everything moves to "in
 * review" — nothing is auto-approved, so the wire step stays shut until a
 * reviewer says yes.
 */
export const submitRoomApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await applicationForOffering(supabase, userId, data.offering_id);
    if (!application) throw new Error("You do not have access to this fund yet.");

    const [kyc, accreditation, uploads, profile] = await Promise.all([
      supabase
        .from("kyc_verifications")
        .select("id, result")
        .eq("application_id", application.id)
        .maybeSingle(),
      supabase
        .from("accreditation_records")
        .select("id, attested_at")
        .eq("application_id", application.id)
        .maybeSingle(),
      supabase
        .from("investor_documents")
        .select("doc_kind")
        .eq("application_id", application.id)
        .in("doc_kind", ROOM_DOC_KINDS as unknown as string[]),
      supabase.from("profiles").select("legal_name").eq("user_id", userId).maybeSingle(),
    ]);

    const kinds = new Set((uploads.data ?? []).map((r: any) => r.doc_kind as string));
    const missing: string[] = [];
    if (!kyc.data || !(kyc.data as any).result?.id_document_type) missing.push("your personal details");
    if (!kinds.has("identification")) missing.push("a photo of your government ID");
    if (!kinds.has("proof_of_address")) missing.push("a proof of address");
    if (!accreditation.data?.attested_at) missing.push("your accreditation answers");
    if (missing.length) {
      throw new Error(`Please add ${missing.join(", ")} before sending your application.`);
    }

    const now = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("kyc_verifications")
      .update({ status: "review", updated_at: now })
      .eq("id", (kyc.data as any).id);

    const { error } = await supabase
      .from("investor_applications")
      .update({
        kyc_status: "review",
        accreditation_status: "review",
        status: "submitted",
        submitted_at: application.submitted_at ?? now,
        current_step: "documents",
        updated_at: now,
      })
      .eq("id", application.id);
    if (error) throw new Error(error.message);

    // Leave a trail in the room so the fund team sees it next to everything else.
    await supabase.from("diligence_activity").insert({
      offering_id: data.offering_id,
      actor_id: userId,
      actor_name: (profile.data as any)?.legal_name ?? null,
      event_type: "kyc_application_submitted",
      summary: "Sent their identity and accreditation application for review",
      metadata: { application_id: application.id },
    });

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true };
  });
