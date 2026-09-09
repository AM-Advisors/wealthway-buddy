import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const investorType = z.enum(["individual", "joint", "entity", "trust", "ira"]);

export const kycSchema = z.object({
  legal_name: z.string().trim().min(2, "Enter your full legal name").max(120),
  investor_type: investorType,
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(30),
  date_of_birth: z.string().trim().min(1, "Date of birth is required"),
  tax_id: z.string().trim().min(4, "Enter your SSN/EIN").max(20),
  entity_name: z.string().trim().max(160).optional().or(z.literal("")),
  address_line1: z.string().trim().min(3, "Street address is required").max(160),
  address_line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().min(1, "City is required").max(80),
  region: z.string().trim().min(1, "State/region is required").max(80),
  postal_code: z.string().trim().min(3, "Postal code is required").max(20),
  country: z.string().trim().min(2).max(60),
  id_document_type: z.enum(["passport", "drivers_license", "state_id"]),
  id_document_number: z.string().trim().min(4, "Document number is required").max(40),
  id_issuing_country: z.string().trim().min(2).max(60),
  id_expiration: z.string().trim().min(1, "Expiration date is required"),
});

export const amlSchema = z.object({
  source_of_funds: z.enum([
    "employment_income",
    "business_proceeds",
    "investment_returns",
    "sale_of_asset",
    "inheritance_gift",
    "retirement_savings",
    "other",
  ]),
  source_of_funds_detail: z.string().trim().max(600).optional().or(z.literal("")),
  source_of_wealth: z.string().trim().min(10, "Please describe how your wealth was accumulated").max(600),
  funds_origin_country: z.string().trim().min(2).max(60),
  is_pep: z.boolean(),
  pep_detail: z.string().trim().max(600).optional().or(z.literal("")),
  is_us_person: z.boolean(),
  sanctions_exposure: z.boolean(),
  sanctions_detail: z.string().trim().max(600).optional().or(z.literal("")),
  criminal_history: z.boolean(),
  criminal_detail: z.string().trim().max(600).optional().or(z.literal("")),
  third_party_funding: z.boolean(),
  third_party_detail: z.string().trim().max(600).optional().or(z.literal("")),
  certify_accurate: z.literal(true),
});

export type KycInput = z.infer<typeof kycSchema>;
export type AmlInput = z.infer<typeof amlSchema>;

/** Loads (or creates) the signed-in investor's profile + application snapshot. */
export const getOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

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

    // Access is invitation-only: an existing application, or a fund the person
    // has been invited to, decides which offering they see. Nothing is created
    // for people who have not been invited.
    let application = null;
    const existingApp = await supabase
      .from("investor_applications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    application = existingApp.data;

    let offeringId: string | null = application?.offering_id ?? null;

    if (!offeringId) {
      const access = await supabase
        .from("investor_fund_access")
        .select("offering_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      offeringId = (access.data?.offering_id as string | undefined) ?? null;
    }

    if (!offeringId) {
      return { offering: null, profile, application: null, kyc: null, aml: null, invited: false };
    }

    const { data: offering } = await supabase
      .from("offerings")
      .select("id, slug, name, reg_type, min_investment_cents")
      .eq("id", offeringId)
      .maybeSingle();

    if (!application && offering) {
      const created = await supabase
        .from("investor_applications")
        .insert({ user_id: userId, offering_id: offering.id, current_step: "kyc", source: "portal" })
        .select("*")
        .single();
      if (created.error) throw new Error(created.error.message);
      application = created.data;
    }

    const kyc = application
      ? (
          await supabase
            .from("kyc_verifications")
            .select("*")
            .eq("application_id", application.id)
            .maybeSingle()
        ).data
      : null;

    const aml = application
      ? (
          await supabase
            .from("aml_screenings")
            .select("*")
            .eq("application_id", application.id)
            .maybeSingle()
        ).data
      : null;

    return { offering, profile, application, kyc, aml, invited: true };

  });

export const submitKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => kycSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: application, error: appError } = await supabase
      .from("investor_applications")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (appError) throw new Error(appError.message);
    if (!application) throw new Error("No application found. Reload and try again.");

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
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (profileError) throw new Error(profileError.message);

    const identity = {
      id_document_type: data.id_document_type,
      id_document_number_last4: data.id_document_number.slice(-4),
      id_issuing_country: data.id_issuing_country,
      id_expiration: data.id_expiration,
      submitted_at: new Date().toISOString(),
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
        .update({ status: "review", result: identity, provider: "manual", updated_at: new Date().toISOString() })
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("kyc_verifications")
        .insert({ application_id: application.id, provider: "manual", status: "review", result: identity });
      if (error) throw new Error(error.message);
    }

    const { error: statusError } = await supabase
      .from("investor_applications")
      .update({ kyc_status: "review", current_step: "aml", updated_at: new Date().toISOString() })
      .eq("id", application.id);
    if (statusError) throw new Error(statusError.message);

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true, applicationId: application.id };
  });

export const submitAml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => amlSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: application, error: appError } = await supabase
      .from("investor_applications")
      .select("id, kyc_status")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (appError) throw new Error(appError.message);
    if (!application) throw new Error("No application found. Reload and try again.");
    if (application.kyc_status === "not_started") {
      throw new Error("Complete identity verification before the AML questionnaire.");
    }

    const flagged =
      data.is_pep || data.sanctions_exposure || data.criminal_history || data.third_party_funding;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload = {
      application_id: application.id,
      provider: "manual",
      status: "review" as const,
      matches: {
        answers: data,
        flagged,
        submitted_at: new Date().toISOString(),
      },
    };

    const existing = await supabaseAdmin
      .from("aml_screenings")
      .select("id")
      .eq("application_id", application.id)
      .maybeSingle();

    if (existing.data) {
      const { error } = await supabaseAdmin
        .from("aml_screenings")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("aml_screenings").insert(payload);
      if (error) throw new Error(error.message);
    }

    const { error: statusError } = await supabase
      .from("investor_applications")
      .update({
        aml_status: "review",
        current_step: "accreditation",
        status: "submitted",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", application.id);
    if (statusError) throw new Error(statusError.message);

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true, flagged };
  });
