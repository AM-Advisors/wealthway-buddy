/**
 * Address lookup and validation transport (server only).
 *
 * Credentials never reach the browser: suggestions and validation are proxied
 * through the server. Two credential routes are supported — the Lovable
 * connector gateway, and a directly configured Google Maps Platform server
 * key. When neither is configured, or the provider is unavailable, the
 * controlled manual-entry path stays open and the address is simply queued for
 * validation later. An outage never marks an address invalid.
 */

import type { ProviderVerdict } from "@/lib/address-model";
import { cleanAddress, type AddressSuggestion, type StructuredAddress } from "@/lib/address-validation";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const DIRECT_PLACES = "https://places.googleapis.com";
const DIRECT_VALIDATION = "https://addressvalidation.googleapis.com";

export const ADDRESS_PROVIDER = "google_address_validation";
export const AUTOCOMPLETE_PROVIDER = "google_places";

interface Transport {
  mode: "gateway" | "direct";
  placesUrl: (path: string) => string;
  validationUrl: (path: string) => string;
  headers: Record<string, string>;
}

type TransportKind = "places" | "validation";

function directKey(kind: TransportKind): string | null {
  const places = process.env["GOOGLE_PLACES_API_KEY"];
  const validation = process.env["GOOGLE_ADDRESS_API_KEY"];
  const chosen = kind === "places" ? (places ?? validation) : (validation ?? places);
  return chosen && chosen.trim() ? chosen.trim() : null;
}

/**
 * Resolves credentials at call time; module scope never reads env.
 * Places requests use GOOGLE_PLACES_API_KEY and Address Validation requests
 * use GOOGLE_ADDRESS_API_KEY; either falls back to the other only when a
 * single key is configured for both APIs.
 */
function transport(kind: TransportKind): Transport | null {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectorKey = process.env["GOOGLE_MAPS_API_KEY"];
  const direct = directKey(kind);
  if (!direct && lovableKey && connectorKey) {
    return {
      mode: "gateway",
      placesUrl: (path) => `${GATEWAY}/places${path}`,
      validationUrl: (path) => `${GATEWAY}/addressvalidation${path}`,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectorKey,
        "content-type": "application/json",
      },
    };
  }
  if (direct) {
    return {
      mode: "direct",
      placesUrl: (path) => `${DIRECT_PLACES}${path}`,
      validationUrl: (path) => `${DIRECT_VALIDATION}${path}`,
      headers: { "X-Goog-Api-Key": direct, "content-type": "application/json" },
    };
  }
  return null;
}

export function addressProviderConfigured(): boolean {
  return transport("places") !== null || transport("validation") !== null;
}

export function addressCapabilities() {
  return {
    autocomplete: transport("places") !== null,
    validation: transport("validation") !== null,
    providerLabel: transport("validation") !== null ? "Google Address Validation" : "Not configured",
  };
}

// ---------------------------------------------------------------------------
// Places autocomplete
// ---------------------------------------------------------------------------

export async function suggestAddresses(
  query: string,
  country?: string | null,
  sessionToken?: string | null,
): Promise<AddressSuggestion[]> {
  const t = transport();
  if (!t || query.trim().length < 3) return [];
  try {
    const res = await fetch(t.placesUrl("/v1/places:autocomplete"), {
      method: "POST",
      headers: {
        ...t.headers,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({
        input: query.trim().slice(0, 200),
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
        ...(sessionToken ? { sessionToken } : {}),
        ...(country && /^[A-Za-z]{2}$/.test(country)
          ? { includedRegionCodes: [country.toUpperCase()] }
          : {}),
      }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as any;
    const items = Array.isArray(body?.suggestions) ? body.suggestions : [];
    return items
      .map((item: any) => {
        const place = item?.placePrediction;
        if (!place?.placeId) return null;
        return {
          id: String(place.placeId),
          description: String(place.text?.text ?? ""),
          provider: AUTOCOMPLETE_PROVIDER,
        } satisfies AddressSuggestion;
      })
      .filter(Boolean)
      .slice(0, 8) as AddressSuggestion[];
  } catch {
    return [];
  }
}

function componentsFromGoogle(list: any[]): Partial<StructuredAddress> {
  const find = (type: string, short = false) => {
    const hit = list.find((c: any) => Array.isArray(c?.types) && c.types.includes(type));
    if (!hit) return null;
    return (
      String((short ? hit.shortText : hit.longText) ?? hit.longText ?? hit.shortText ?? "") || null
    );
  };
  const number = find("street_number");
  const route = find("route");
  return {
    line1: [number, route].filter(Boolean).join(" ") || null,
    line2: find("subpremise"),
    city: find("locality") ?? find("postal_town") ?? find("sublocality"),
    county: find("administrative_area_level_2"),
    region: find("administrative_area_level_1", true),
    postalCode: find("postal_code"),
    country: find("country", true) ?? undefined,
  } as Partial<StructuredAddress>;
}

/** Resolves a chosen suggestion into structured components. */
export async function resolveSuggestion(
  placeId: string,
  sessionToken?: string | null,
): Promise<(Partial<StructuredAddress> & { placeId: string }) | null> {
  const t = transport();
  if (!t || !placeId) return null;
  try {
    const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
    const res = await fetch(t.placesUrl(`/v1/places/${encodeURIComponent(placeId)}${qs}`), {
      headers: { ...t.headers, "X-Goog-FieldMask": "formattedAddress,addressComponents" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    const parts = componentsFromGoogle(
      Array.isArray(body?.addressComponents) ? body.addressComponents : [],
    );
    return { ...parts, formatted: body?.formattedAddress ?? null, placeId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

export interface ValidationOutcome {
  provider: string;
  verdict: ProviderVerdict;
  formatted: string | null;
  components: Partial<StructuredAddress>;
  placeId: string | null;
  warnings: string[];
  raw: Record<string, unknown>;
  validatedAt: string | null;
}

export function unavailableValidation(): ValidationOutcome {
  return {
    provider: ADDRESS_PROVIDER,
    verdict: "unavailable",
    formatted: null,
    components: {},
    placeId: null,
    warnings: [],
    raw: { reason: "validation_provider_unavailable" },
    validatedAt: null,
  };
}

/**
 * Validates a structured address. A provider outage returns "unavailable"
 * (address stays usable, queued for validation); a provider that actively
 * cannot find the address returns "unresolved" (review).
 */
export async function validateAddress(address: StructuredAddress): Promise<ValidationOutcome> {
  const t = transport();
  if (!t) return unavailableValidation();
  const clean = cleanAddress(address);
  try {
    const res = await fetch(t.validationUrl("/v1:validateAddress"), {
      method: "POST",
      headers: t.headers,
      body: JSON.stringify({
        address: {
          regionCode: clean.country,
          postalCode: clean.postalCode ?? undefined,
          administrativeArea: clean.region ?? undefined,
          locality: clean.city ?? undefined,
          addressLines: [clean.line1, clean.line2].filter(Boolean),
        },
      }),
    });
    if (!res.ok) return unavailableValidation();

    const body = (await res.json()) as any;
    const result = body?.result ?? {};
    const verdictBlock = result?.verdict ?? {};
    const formatted = result?.address?.formattedAddress ?? null;
    const complete = verdictBlock?.addressComplete === true;
    const granularity = String(verdictBlock?.validationGranularity ?? "");
    const confirmed = ["PREMISE", "SUB_PREMISE"].includes(granularity);
    const located = ["PREMISE", "SUB_PREMISE", "PREMISE_PROXIMITY", "BLOCK", "ROUTE"].includes(
      granularity,
    );

    const warnings: string[] = [];
    if (verdictBlock?.hasUnconfirmedComponents) warnings.push("Some parts of the address could not be confirmed.");
    if (verdictBlock?.hasInferredComponents) warnings.push("Some parts of the address were inferred by the provider.");
    if (verdictBlock?.hasReplacedComponents) warnings.push("Some parts of the address were replaced by the provider.");
    const missing: string[] = Array.isArray(result?.address?.missingComponentTypes)
      ? result.address.missingComponentTypes.map((m: unknown) => String(m))
      : [];
    if (missing.length) warnings.push(`Missing: ${missing.join(", ")}`);

    const components = componentsFromGoogle(
      (result?.address?.addressComponents ?? []).map((c: any) => ({
        longText: c?.componentName?.text,
        shortText: c?.componentName?.text,
        types: [c?.componentType].filter(Boolean),
      })),
    );

    let verdict: ProviderVerdict;
    if (complete && confirmed && warnings.length === 0) verdict = "validated";
    else if (complete && confirmed) verdict = "validation_warning" as ProviderVerdict;
    else if (formatted && located) verdict = warnings.length ? "warning" : "normalized";
    else if (formatted) verdict = "located";
    else verdict = "unresolved";
    if ((verdict as string) === "validation_warning") verdict = "warning";

    return {
      provider: ADDRESS_PROVIDER,
      verdict,
      formatted,
      components,
      placeId: result?.geocode?.placeId ?? null,
      warnings,
      raw: {
        granularity,
        addressComplete: complete,
        hasUnconfirmedComponents: verdictBlock?.hasUnconfirmedComponents ?? null,
        hasInferredComponents: verdictBlock?.hasInferredComponents ?? null,
        missingComponentTypes: missing,
      },
      validatedAt: new Date().toISOString(),
    };
  } catch {
    return unavailableValidation();
  }
}
