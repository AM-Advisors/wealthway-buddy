import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  INVESTMENT_PROFILE_TYPES,
  PROFILE_RELATIONSHIP_ROLES,
  isEntityProfileType,
  type ReadinessResult,
} from "@/lib/identity-model";

/**
 * The investor-facing identity workflows.
 *
 * Every write here is a controlled server workflow: verification states
 * (KYC, AML, KYB, accreditation) are never taken from the browser, and
 * restricted values (date of birth, tax identifiers) are stored but never
 * returned to a client.
 */

const server = async () => await import("@/lib/identity.server");

const personSchema = z.object({
  legal_first_name: z.string().trim().min(1, "First name is required").max(80),
  legal_middle_name: z.string().trim().max(80).optional().or(z.literal("")),
  legal_last_name: z.string().trim().min(1, "Last name is required").max(80),
  preferred_name: z.string().trim().max(80).optional().or(z.literal("")),
  date_of_birth: z.string().trim().max(20).optional().or(z.literal("")),
  citizenship_country: z.string().trim().max(60).optional().or(z.literal("")),
  residence_country: z.string().trim().max(60).optional().or(z.literal("")),
  address_line1: z.string().trim().max(160).optional().or(z.literal("")),
  address_line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  region: z.string().trim().max(80).optional().or(z.literal("")),
  postal_code: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  tax_residency_country: z.string().trim().max(60).optional().or(z.literal("")),
  tax_id: z.string().trim().max(32).optional().or(z.literal("")),
});

const blank = (v: string | undefined | null) => (v && String(v).trim() ? String(v).trim() : null);

/** Everything the My Profile area shows, with restricted values removed. */
export const getMyIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const { ensurePerson, evaluateOnboardingGate, redactPerson } = await server();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const person = await ensurePerson(userId, { email: (claims["email"] as string) ?? null });
    const gate = await evaluateOnboardingGate(userId);

    const [{ data: fresh }, { data: profiles }, { data: history }] = await Promise.all([
      db.from("persons").select("*").eq("id", person.id).maybeSingle(),
      db
        .from("investment_profiles")
        .select("*")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: true }),
      db
        .from("person_onboarding_events")
        .select("from_state, to_state, reason, created_at")
        .eq("person_id", person.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const profileIds = ((profiles ?? []) as any[]).map((p) => p.id);
    const [{ data: relationships }, { data: kyb }, { data: accreditations }] = await Promise.all([
      profileIds.length
        ? db
            .from("investment_profile_relationships")
            .select("id, profile_id, person_id, role, ownership_percent, is_authorized_signer, status, verification_status")
            .in("profile_id", profileIds)
        : { data: [] as any[] },
      profileIds.length
        ? db
            .from("entity_verifications")
            .select("profile_id, legal_name, entity_type, formation_jurisdiction, formation_date, trust_type, trust_date, kyb_status, entity_aml_status, verified_at, expires_at, review_notes")
            .in("profile_id", profileIds)
        : { data: [] as any[] },
      profileIds.length
        ? db
            .from("profile_accreditations")
            .select("profile_id, offering_id, status, basis, verification_method, verified_at, expires_at")
            .in("profile_id", profileIds)
        : { data: [] as any[] },
    ]);

    return {
      person: redactPerson((fresh as any) ?? person),
      onboarding: { state: gate.state, allowed: gate.allowed, nextStep: gate.nextStep, staff: gate.bypass === "staff" },
      history: history ?? [],
      profiles: profiles ?? [],
      relationships: relationships ?? [],
      entityVerifications: kyb ?? [],
      accreditations: accreditations ?? [],
    };
  });

/** Saves the person's own details. Verification states are untouched. */
export const saveMyPersonalInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => personSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { ensurePerson, refreshOnboardingState } = await server();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const person = await ensurePerson(userId);
    const taxId = blank(data.tax_id);

    const { error } = await (supabaseAdmin as any)
      .from("persons")
      .update({
        legal_first_name: data.legal_first_name.trim(),
        legal_middle_name: blank(data.legal_middle_name),
        legal_last_name: data.legal_last_name.trim(),
        preferred_name: blank(data.preferred_name),
        date_of_birth: blank(data.date_of_birth),
        citizenship_country: blank(data.citizenship_country),
        residence_country: blank(data.residence_country),
        address_line1: blank(data.address_line1),
        address_line2: blank(data.address_line2),
        city: blank(data.city),
        region: blank(data.region),
        postal_code: blank(data.postal_code),
        country: blank(data.country),
        phone: blank(data.phone),
        email: blank(data.email),
        tax_residency_country: blank(data.tax_residency_country),
        ...(taxId ? { tax_id_reference: taxId, tax_id_last4: taxId.slice(-4) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", person.id);
    if (error) throw new Error(error.message);

    const state = await refreshOnboardingState(person.id);
    return { ok: true, state };
  });

const profileSchema = z.object({
  profile_type: z.enum(INVESTMENT_PROFILE_TYPES),
  display_label: z.string().trim().min(2, "Give this profile a name").max(120),
  legal_name: z.string().trim().max(160).optional().or(z.literal("")),
});

/** Creates another way for this person to invest. */
export const createInvestmentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => profileSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { ensurePerson } = await server();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const person = await ensurePerson(userId);

    const created = await db
      .from("investment_profiles")
      .insert({
        owner_user_id: userId,
        person_id: data.profile_type === "individual" ? person.id : null,
        profile_type: data.profile_type,
        display_label: data.display_label.trim(),
        legal_name: blank(data.legal_name),
        status: "draft",
      })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);

    await db
      .from("investment_profile_relationships")
      .insert({
        profile_id: created.data.id,
        person_id: person.id,
        role: "owner",
        added_by: userId,
        status: "active",
      })
      .select("id");

    if (isEntityProfileType(data.profile_type)) {
      await db
        .from("entity_verifications")
        .insert({ profile_id: created.data.id, legal_name: blank(data.legal_name) });
    }

    return { ok: true, id: created.data.id as string };
  });

const relationshipSchema = z.object({
  profile_id: z.string().uuid(),
  role: z.enum(PROFILE_RELATIONSHIP_ROLES),
  person_email: z.string().trim().email().max(255),
  full_name: z.string().trim().min(2).max(160),
  ownership_percent: z.number().min(0).max(100).optional(),
});

/**
 * Attaches a person to a profile the caller owns. The person's own identity
 * verification always starts from scratch — nobody can be marked verified here.
 */
export const addProfileRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => relationshipSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: profile } = await db
      .from("investment_profiles")
      .select("id, owner_user_id")
      .eq("id", data.profile_id)
      .maybeSingle();
    if (!profile || profile.owner_user_id !== userId) {
      throw new Error("That investment profile was not found.");
    }

    const email = data.person_email.trim().toLowerCase();
    const existing = await db.from("persons").select("id").ilike("email", email).maybeSingle();

    let personId = existing.data?.id as string | undefined;
    if (!personId) {
      const name = data.full_name.trim();
      const created = await db
        .from("persons")
        .insert({
          email,
          legal_first_name: name.split(/\s+/)[0],
          legal_last_name: name.includes(" ") ? name.slice(name.indexOf(" ") + 1) : null,
          onboarding_state: "profile_required",
        })
        .select("id")
        .single();
      if (created.error) throw new Error(created.error.message);
      personId = created.data.id as string;
    }

    const { error } = await db.from("investment_profile_relationships").insert({
      profile_id: data.profile_id,
      person_id: personId,
      role: data.role,
      ownership_percent: data.ownership_percent ?? null,
      added_by: userId,
      status: "active",
      verification_status: "not_started",
    });
    if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);

    return { ok: true };
  });

const kybSchema = z.object({
  profile_id: z.string().uuid(),
  legal_name: z.string().trim().min(2).max(160),
  entity_type: z.string().trim().max(80).optional().or(z.literal("")),
  tax_id: z.string().trim().max(32).optional().or(z.literal("")),
  formation_jurisdiction: z.string().trim().max(80).optional().or(z.literal("")),
  formation_date: z.string().trim().max(20).optional().or(z.literal("")),
  address_line1: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  region: z.string().trim().max(80).optional().or(z.literal("")),
  postal_code: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  trust_type: z.string().trim().max(80).optional().or(z.literal("")),
  trust_date: z.string().trim().max(20).optional().or(z.literal("")),
});

/** Submits entity/trust details for review. Only staff can approve them. */
export const submitEntityVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => kybSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: profile } = await db
      .from("investment_profiles")
      .select("id, owner_user_id, profile_type")
      .eq("id", data.profile_id)
      .maybeSingle();
    if (!profile || profile.owner_user_id !== userId) {
      throw new Error("That investment profile was not found.");
    }
    if (!isEntityProfileType(profile.profile_type)) {
      throw new Error("This profile does not need entity verification.");
    }

    const taxId = blank(data.tax_id);
    const payload = {
      profile_id: data.profile_id,
      legal_name: data.legal_name.trim(),
      entity_type: blank(data.entity_type),
      formation_jurisdiction: blank(data.formation_jurisdiction),
      formation_date: blank(data.formation_date),
      address_line1: blank(data.address_line1),
      city: blank(data.city),
      region: blank(data.region),
      postal_code: blank(data.postal_code),
      country: blank(data.country),
      trust_type: blank(data.trust_type),
      trust_date: blank(data.trust_date),
      ...(taxId ? { tax_id_reference: taxId, tax_id_last4: taxId.slice(-4) } : {}),
      // Submitted for review — never approved from the browser.
      kyb_status: "review" as const,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existing = await db
      .from("entity_verifications")
      .select("id")
      .eq("profile_id", data.profile_id)
      .maybeSingle();

    const { error } = existing.data
      ? await db.from("entity_verifications").update(payload).eq("id", existing.data.id)
      : await db.from("entity_verifications").insert(payload);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/** "Choose how you're investing": the caller's profiles with their readiness. */
export const listEligibleProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offeringId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { canInvest } = await server();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles } = await (supabaseAdmin as any)
      .from("investment_profiles")
      .select("id, display_label, legal_name, profile_type, status")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: true });

    const results: Array<{
      id: string;
      label: string;
      type: string;
      readiness: ReadinessResult;
    }> = [];

    for (const profile of (profiles ?? []) as any[]) {
      results.push({
        id: profile.id,
        label: profile.display_label,
        type: profile.profile_type,
        readiness: await canInvest(userId, profile.id, data.offeringId),
      });
    }

    return { profiles: results };
  });

/** The onboarding gate, for screens that need to show where a person stands. */
export const getOnboardingGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { evaluateOnboardingGate } = await server();
    return await evaluateOnboardingGate(context.userId);
  });
