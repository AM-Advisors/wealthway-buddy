import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADDRESS_KINDS, ADDRESS_STATE_DISPLAY, type AddressKind } from "@/lib/address-model";
import { cleanAddress, isCompleteAddress } from "@/lib/address-validation";

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
  kind: z.enum(ADDRESS_KINDS).default("residential"),
});

/** What the browser is allowed to know about provider availability. */
export const addressProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { addressCapabilities } = await import("@/lib/address-lookup.server");
  return addressCapabilities();
});

/** Address suggestions, proxied so the lookup credential never reaches the browser. */
export const suggestAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string; country?: string | null; sessionToken?: string | null }) =>
    z
      .object({
        query: z.string().max(200),
        country: z.string().length(2).nullable().optional(),
        sessionToken: z.string().max(80).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { suggestAddresses, addressCapabilities } = await import("@/lib/address-lookup.server");
    const caps = addressCapabilities();
    return {
      ...caps,
      suggestions: await suggestAddresses(data.query, data.country ?? null, data.sessionToken ?? null),
    };
  });

/** Expands a chosen suggestion into structured fields the user can still edit. */
export const resolveAddressSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { placeId: string; sessionToken?: string | null }) =>
    z
      .object({ placeId: z.string().min(1).max(400), sessionToken: z.string().max(80).nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveSuggestion } = await import("@/lib/address-lookup.server");
    return await resolveSuggestion(data.placeId, data.sessionToken ?? null);
  });

/**
 * Runs the selected address through the validation provider so the person can
 * see the outcome before saving. Nothing is stored and the browser cannot
 * assert the result — saving re-validates on the server.
 */
export const previewAddressValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    addressInput.omit({ kind: true }).parse(input),
  )
  .handler(async ({ data }) => {
    const { validateAddress } = await import("@/lib/address-lookup.server");
    const { stateForVerdict, ADDRESS_STATE_DISPLAY } = await import("@/lib/address-model");
    const clean = cleanAddress(data as Record<string, any>);
    if (!isCompleteAddress(clean)) {
      return { verdict: "unresolved" as const, state: "review_required", label: "Review required", formatted: null, warnings: [] as string[] };
    }
    const outcome = await validateAddress(clean);
    const entry = stateForVerdict(outcome.verdict, data.entryMethod);
    return {
      verdict: outcome.verdict,
      state: entry.state,
      label: ADDRESS_STATE_DISPLAY[entry.state],
      formatted: outcome.formatted,
      warnings: outcome.warnings,
    };
  });

/** Staff-only: re-checks addresses saved while the provider was unavailable. */
export const reconcileAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: staff } = await supabase.rpc("ct_is_staff");
    if (staff !== true) throw new Error("Not authorised.");
    const { reconcileAddressValidation } = await import("@/lib/address-service.server");
    return await reconcileAddressValidation();
  });

/**
 * Records the signed-in person's address.
 *
 * Selecting a suggestion is convenience, never proof of residence, and the
 * browser can only ever assert the address text — the state, the provider
 * verdict and the provenance are all decided on the server.
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

    const clean = cleanAddress(data as Record<string, any>);
    if (!isCompleteAddress(clean)) throw new Error("Enter a street address and country.");

    const { proofOfAddressRequired } = await import("@/lib/kyc-verification.server");
    const proofRequired = await proofOfAddressRequired({
      personId: person.id,
      applicationId: null,
    }).catch(() => false);

    const { recordAddress } = await import("@/lib/address-service.server");
    const result = await recordAddress({
      ownerType: "person",
      ownerId: person.id,
      personId: person.id,
      kind: data.kind as AddressKind,
      address: clean,
      entryMethod: data.entryMethod,
      // The browser may only ever claim that the user typed or picked it.
      source: "user_entered",
      actorUserId: userId,
      placeId: data.providerPlaceId ?? null,
      proofRequired,
    });

    return {
      ...result,
      label: ADDRESS_STATE_DISPLAY[result.state],
      pending: result.status === "pending",
    };
  });

/** The person's current and pending addresses, as shown in the portal. */
export const myAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: person } = await supabase
      .from("persons")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!person?.id) return { current: null, pending: null };

    const { currentAddress, pendingAddress } = await import("@/lib/address-service.server");
    const [current, pending] = await Promise.all([
      currentAddress("person", person.id, "residential"),
      pendingAddress("person", person.id, "residential"),
    ]);
    const view = (row: Record<string, any> | null) =>
      row
        ? {
            id: row["id"] as string,
            version: row["version"] as number,
            formatted:
              (row["formatted"] as string | null) ??
              [row["line1"], row["city"], row["region"], row["postal_code"], row["country"]]
                .filter(Boolean)
                .join(", "),
            state: row["state"] as string,
            label: ADDRESS_STATE_DISPLAY[row["state"] as keyof typeof ADDRESS_STATE_DISPLAY] ?? row["state"],
          }
        : null;
    return { current: view(current), pending: view(pending) };
  });
