/**
 * Server-side address lookup and validation.
 *
 * The provider key never reaches the browser: suggestions and validation are
 * proxied through the server. When no provider is configured the controlled
 * manual-entry path stays available — an address simply cannot reach the
 * VALIDATED state without provider evidence.
 */

import {
  cleanAddress,
  type AddressSuggestion,
  type ProviderValidation,
  type StructuredAddress,
} from "@/lib/address-validation";

const PLACES_AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_DETAILS = "https://places.googleapis.com/v1/places/";
const ADDRESS_VALIDATION = "https://addressvalidation.googleapis.com/v1:validateAddress";

export const ADDRESS_PROVIDER = "google_address_validation";

function apiKey(): string | null {
  const key = process.env["GOOGLE_PLACES_API_KEY"];
  return key && key.trim() ? key.trim() : null;
}

export function addressProviderConfigured(): boolean {
  return !!apiKey();
}

/** Address suggestions for a partial entry. Empty when no provider is set up. */
export async function suggestAddresses(
  query: string,
  country?: string | null,
): Promise<AddressSuggestion[]> {
  const key = apiKey();
  if (!key || query.trim().length < 3) return [];
  try {
    const res = await fetch(PLACES_AUTOCOMPLETE, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input: query.trim().slice(0, 200),
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
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
          provider: ADDRESS_PROVIDER,
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
    return String((short ? hit.shortText : hit.longText) ?? hit.longText ?? hit.shortText ?? "") || null;
  };
  const number = find("street_number");
  const route = find("route");
  return {
    line1: [number, route].filter(Boolean).join(" ") || null,
    line2: find("subpremise"),
    city: find("locality") ?? find("postal_town") ?? find("sublocality"),
    region: find("administrative_area_level_1", true),
    postalCode: find("postal_code"),
    country: find("country", true) ?? undefined,
  } as Partial<StructuredAddress>;
}

/** Resolves a chosen suggestion into structured components. */
export async function resolveSuggestion(placeId: string): Promise<Partial<StructuredAddress> | null> {
  const key = apiKey();
  if (!key || !placeId) return null;
  try {
    const res = await fetch(`${PLACES_DETAILS}${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "formattedAddress,addressComponents",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    const parts = componentsFromGoogle(
      Array.isArray(body?.addressComponents) ? body.addressComponents : [],
    );
    return { ...parts, formatted: body?.formattedAddress ?? null };
  } catch {
    return null;
  }
}

/**
 * Validates a structured address. A provider that cannot confirm the address
 * yields "unresolved", which sends the address to review rather than through.
 */
export async function validateAddress(
  address: StructuredAddress,
): Promise<ProviderValidation | null> {
  const key = apiKey();
  if (!key) return null;
  const clean = cleanAddress(address);
  try {
    const res = await fetch(`${ADDRESS_VALIDATION}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
    if (!res.ok) {
      return { provider: ADDRESS_PROVIDER, verdict: "unresolved", formatted: null };
    }
    const body = (await res.json()) as any;
    const result = body?.result ?? {};
    const verdict = result?.verdict ?? {};
    const formatted = result?.address?.formattedAddress ?? null;
    const complete = verdict?.addressComplete === true;
    const granularity = String(verdict?.validationGranularity ?? "");
    const confirmed = ["PREMISE", "SUB_PREMISE", "PREMISE_PROXIMITY"].includes(granularity);

    const components = componentsFromGoogle(
      (result?.address?.addressComponents ?? []).map((c: any) => ({
        longText: c?.componentName?.text,
        shortText: c?.componentName?.text,
        types: [c?.componentType].filter(Boolean),
      })),
    );

    return {
      provider: ADDRESS_PROVIDER,
      verdict: complete && confirmed ? "validated" : formatted ? "normalized" : "unresolved",
      formatted,
      components,
      raw: {
        granularity,
        addressComplete: complete,
        hasUnconfirmedComponents: verdict?.hasUnconfirmedComponents ?? null,
        hasInferredComponents: verdict?.hasInferredComponents ?? null,
      },
    };
  } catch {
    return { provider: ADDRESS_PROVIDER, verdict: "unresolved", formatted: null };
  }
}
