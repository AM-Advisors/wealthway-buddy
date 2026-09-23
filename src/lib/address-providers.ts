/**
 * Central address provider configuration (client-safe: no credentials here).
 *
 * Every address surface asks this layer which provider does what, so the
 * provider can be swapped later without touching a single form.
 */

export type AddressProviderId = "google" | "none";

export interface AddressProviderConfig {
  /** Finds addresses while the user types. */
  autocomplete: AddressProviderId;
  /** Normalises and assesses a selected or typed address. */
  validation: AddressProviderId;
  /** Verifies documentary evidence connecting a person to an address. */
  proof: "didit" | "none";
}

export const ADDRESS_PROVIDERS: AddressProviderConfig = {
  autocomplete: "google",
  validation: "google",
  proof: "didit",
};

export const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Address Validation",
  google_places: "Google Places",
  didit: "Didit",
  none: "Not configured",
};

/** Reported to the browser so forms can fall back gracefully. */
export interface AddressCapabilities {
  autocomplete: boolean;
  validation: boolean;
  providerLabel: string;
}

export const OFFLINE_CAPABILITIES: AddressCapabilities = {
  autocomplete: false,
  validation: false,
  providerLabel: PROVIDER_LABELS["none"] as string,
};
