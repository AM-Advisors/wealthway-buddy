/** Harmonious's own details, shown on invoices and other client-facing statements.
 *  Kept in one place so updating an address or phone number never means hunting
 *  through templates. */

export const COMPANY = {
  name: "Harmonious",
  legalName: "Harmonious Holdings LLC",
  tagline: "Fund administration, onboarding, reporting and payment facilitation",
  website: "harmonious.co",
  email: "operations@harmonious.co",
  billingEmail: "billing@harmonious.co",
  phone: "",
  address: {
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "United States",
  },
  /** Logo used on printed statements. */
  logoPath: "/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png",
};

/** The postal address as printable lines, skipping anything not filled in. */
export function companyAddressLines() {
  const a = COMPANY.address;
  const cityLine = [a.city, a.region, a.postalCode].filter(Boolean).join(", ");
  return [a.line1, a.line2, cityLine, a.country].filter(Boolean) as string[];
}

/** Full URL for the logo so a downloaded statement still shows it. */
export function companyLogoUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${COMPANY.logoPath}`;
}
