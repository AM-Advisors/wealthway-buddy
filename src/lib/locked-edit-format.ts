/** Pure formatting for locked edit requests: turns a saved change payload into readable label/value rows. */
export type ChangeRow = { label: string; value: string };

const SKIP = new Set(["offeringId", "onboardingId", "clientId", "preparerId"]);
const LABELS: Record<string, string> = {
  investment: "Investment", person: "Person", profile: "Investing party",
  amountCents: "Investment amount", commitmentCents: "Commitment amount", acceptedCents: "Accepted amount",
  taxId: "Tax ID", legalName: "Legal name", firstName: "First name", middleName: "Middle name", lastName: "Last name",
  email: "Email", phone: "Phone", dateOfBirth: "Date of birth", citizenship: "Citizenship",
  addressLine1: "Address line 1", addressLine2: "Address line 2", city: "City", region: "State or region",
  postalCode: "Postal code", country: "Country", internalNotes: "Internal notes",
};
const SENSITIVE = /taxid|ssn|tin|ein$/i;

export function humanizeKey(key: string): string {
  if (LABELS[key]) return LABELS[key]!;
  const words = key.replace(/Cents$/, "").replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "Cleared";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && /cents$/i.test(key)) return formatCents(v);
  if (typeof v === "string" && SENSITIVE.test(key)) return v.length > 4 ? `Ending in ${v.slice(-4)}` : "Updated";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  return String(v);
}

/** Flattens nested sections; nested labels drop the generic section name. */
export function describeChanges(payload: unknown, prefix = ""): ChangeRow[] {
  if (!payload || typeof payload !== "object") return [];
  const rows: ChangeRow[] = [];
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (SKIP.has(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      rows.push(...describeChanges(v, k === "details" ? humanizeKey(k) : ""));
      continue;
    }
    rows.push({ label: prefix ? `${prefix}: ${humanizeKey(k)}` : humanizeKey(k), value: formatValue(k, v) });
  }
  return rows;
}
