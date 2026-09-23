import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ADDRESS_STATE_LABELS,
  applyProofPolicy,
  cleanAddress,
  isCompleteAddress,
  stateForEntry,
} from "@/lib/address-validation";

const addressInput = z.object({
  line1: z.string().min(3).max(200),
  line2: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  postalCode: z.string().max(30).nullable().optional(),
  country: z.string().length(2),
  formatted: z.string().max(400).nullable().optional(),
  entryMethod: z.enum(["autocomplete", "manual"]).default("manual"),
  providerPlaceId: z.string().max(400).nullable().optional(),
});

/** Address suggestions, proxied so the lookup key never reaches the browser. */
export const suggestAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string; country?: string | null }) =>
    z.object({ query: z.string().max(200), country: z.string().length(2).nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { suggestAddresses, addressProviderConfigured } = await import("@/lib/address-lookup.server");
    return {
      configured: addressProviderConfigured(),
      suggestions: await suggestAddresses(data.query, data.country ?? null),
    };
  });

/**
 * Records the person's residential address. Selecting a suggestion is a
 * convenience, never proof of residence: only a verified document can lift an
 * address to PROOF VERIFIED.
 */
export const saveResidentialAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addressInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: person } = await supabase
      .from("persons")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!person?.id) throw new Error("Complete your profile before adding an address.");

    const clean = cleanAddress(data);
    if (!isCompleteAddress(clean)) throw new Error("Enter a street address and country.");

    const { validateAddress } = await import("@/lib/address-lookup.server");
    const validation = await validateAddress(clean);
    const entry = stateForEntry({ entryMethod: data.entryMethod, validation });

    const { proofOfAddressRequired } = await import("@/lib/kyc-verification.server");
    const poaRequired = await proofOfAddressRequired({
      personId: person.id,
      applicationId: null,
    }).catch(() => false);
    const state = applyProofPolicy(entry.state, poaRequired);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    await supabaseAdmin
      .from("person_addresses")
      .update({ is_current: false, updated_at: nowIso })
      .eq("person_id", person.id)
      .eq("is_current", true);

    const { data: inserted, error } = await supabaseAdmin
      .from("person_addresses")
      .insert({
        person_id: person.id,
        line1: clean.line1,
        line2: clean.line2,
        city: clean.city,
        region: clean.region,
        postal_code: clean.postalCode,
        country: clean.country,
        formatted_address: validation?.formatted ?? clean.formatted,
        normalized_address: validation?.formatted ?? null,
        entry_method: data.entryMethod,
        validation_provider: validation?.provider ?? null,
        validation_result: validation ? (validation.raw ?? {}) : {},
        provider_place_id: data.providerPlaceId ?? null,
        state,
        state_reason: entry.reason,
        is_current: true,
      })
      .select("id, state")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("address_verification_events").insert({
      address_id: inserted.id,
      person_id: person.id,
      from_state: null,
      to_state: state,
      source: data.entryMethod === "autocomplete" ? "lookup_provider" : "self_reported",
      detail: { reason: entry.reason, provider: validation?.provider ?? null },
    });

    return { id: inserted.id, state, label: ADDRESS_STATE_LABELS[state], reason: entry.reason };
  });
