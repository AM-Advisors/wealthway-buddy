/**
 * Reading investor documents with AI (W-9, W-8, IDs, subscription agreements,
 * trust or company papers, statements). Pure helpers shared by server and UI.
 * Results are suggestions only: they fill blank boxes on the Add investor form or
 * rows on the bulk list, and a person reviews them before anything is saved.
 * Tax ID, account and document numbers are never returned.
 */
import { BULK_COLUMNS } from "@/lib/investor-record-model";

export const DOC_READ_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_READ_MAX_FILES = 25;
export const DOC_READ_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export const DOC_READ_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

export type ProfileGuess = "individual" | "joint" | "entity" | "trust" | "ira";

export type ExtractedInvestor = {
  firstName: string | null; middleName: string | null; lastName: string | null;
  email: string | null; phone: string | null;
  profileType: ProfileGuess | null; entityName: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null; postalCode: string | null; country: string | null;
  citizenship: string | null; amount: string | null;
};
export type DocumentReading = { documentKind: string; investors: ExtractedInvestor[]; notes: string[] };

export const EXTRACT_FIELDS = ["firstName", "middleName", "lastName", "email", "phone", "profileType", "entityName", "addressLine1", "addressLine2", "city", "region", "postalCode", "country", "citizenship", "amount"] as const;

const nullableString = { type: ["string", "null"] } as const;
/** Strict JSON schema for the AI response. No field can hold a tax ID or account number. */
export const EXTRACT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["document_kind", "investors", "notes"],
  properties: {
    document_kind: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
    investors: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["first_name", "middle_name", "last_name", "email", "phone", "investor_type", "entity_name", "address_line1", "address_line2", "city", "region", "postal_code", "country", "citizenship", "amount"],
        properties: {
          first_name: nullableString, middle_name: nullableString, last_name: nullableString, email: nullableString, phone: nullableString,
          investor_type: { type: ["string", "null"], enum: ["individual", "joint", "entity", "trust", "ira", null] },
          entity_name: nullableString, address_line1: nullableString, address_line2: nullableString, city: nullableString,
          region: nullableString, postal_code: nullableString, country: nullableString, citizenship: nullableString, amount: nullableString,
        },
      },
    },
  },
} as const;

export const EXTRACT_INSTRUCTIONS = [
  "You read documents a US fund administrator received for a new investor (for example IRS Form W-9 or W-8, a driver's license or passport, a subscription agreement, trust or company formation papers, a brokerage or bank statement).",
  "List each investing party the document identifies. A W-9 or subscription agreement usually names one. A list or roster may name several.",
  "For a company, LLC, partnership or family office use investor_type entity with entity_name, and put the signer or contact person in the name fields. For a trust use trust with the full trust name. For an IRA use ira.",
  "Copy values exactly as written. Use null when something is not clearly shown. Never guess.",
  "amount is the subscription or investment amount in US dollars as digits only, or null.",
  "Never output Social Security numbers, EINs, ITINs, tax ID numbers, account numbers, routing numbers, passport or license numbers, or dates of birth, anywhere, including notes.",
  "notes: short warnings a reviewer should know (unsigned, illegible, expired, name differs between pages). Keep each under 200 characters.",
].join(" ");

const TAXLIKE = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b|\b\d{2}[-\s]?\d{7}\b|\b\d{8,}\b/g;
/** Removes anything shaped like a tax ID or account number. */
export function redactNumbers(s: string): string {
  return s.replace(TAXLIKE, "[removed]");
}

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = redactNumbers(v.replace(/\s+/g, " ").trim()).slice(0, max);
  return t && !/^(n\/?a|none|null|unknown)$/i.test(t) && !t.includes("[removed]") ? t : null;
}
function cleanAmount(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1e12 ? String(Math.round(n * 100) / 100) : null;
}
function cleanEmail(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 254 ? t : null;
}
function cleanPhone(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  const digits = t.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 && /^[\d\s()+.\-]+$/.test(t) ? t : null;
}
const PROFILE: readonly ProfileGuess[] = ["individual", "joint", "entity", "trust", "ira"];

/** Turns the raw AI JSON into safe, bounded values. */
export function normalizeReading(raw: unknown): DocumentReading {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const investors = (Array.isArray(r["investors"]) ? r["investors"] : []).slice(0, 50).map((x: any): ExtractedInvestor => ({
    firstName: clean(x?.first_name, 120), middleName: clean(x?.middle_name, 120), lastName: clean(x?.last_name, 120),
    email: cleanEmail(x?.email), phone: cleanPhone(x?.phone),
    profileType: PROFILE.includes(x?.investor_type) ? x.investor_type : null,
    entityName: clean(x?.entity_name, 200),
    addressLine1: clean(x?.address_line1), addressLine2: clean(x?.address_line2), city: clean(x?.city, 120), region: clean(x?.region, 120),
    postalCode: clean(x?.postal_code, 20) ?? (typeof x?.postal_code === "string" && /^\d{5}(-\d{4})?$/.test(x.postal_code.trim()) ? x.postal_code.trim() : null),
    country: clean(x?.country, 80), citizenship: clean(x?.citizenship, 80), amount: cleanAmount(x?.amount),
  })).filter((i: ExtractedInvestor) => i.firstName || i.lastName || i.entityName || i.email);
  const notes = (Array.isArray(r["notes"]) ? r["notes"] : []).map((n: unknown) => clean(n, 200)).filter((n: string | null): n is string => !!n).slice(0, 8);
  return { documentKind: clean(r["document_kind"], 80) ?? "Document", investors, notes };
}

const keyOf = (i: ExtractedInvestor) =>
  (i.email ?? (i.entityName ? `e:${i.entityName}` : `p:${i.firstName ?? ""} ${i.lastName ?? ""}`)).toLowerCase().replace(/[^a-z0-9@:]+/g, " ").trim();

/** Several documents about the same investor become one entry; earlier documents win, later ones fill blanks. */
export function mergeInvestors(list: readonly ExtractedInvestor[]): ExtractedInvestor[] {
  const out: ExtractedInvestor[] = [];
  for (const inv of list) {
    const existing = out.find((o) => keyOf(o) === keyOf(inv)
      || (!!o.email && o.email === inv.email)
      || (!!o.entityName && !!inv.entityName && o.entityName.toLowerCase() === inv.entityName.toLowerCase())
      || (!o.entityName && !inv.entityName && !!o.lastName && o.lastName.toLowerCase() === inv.lastName?.toLowerCase() && o.firstName?.toLowerCase() === inv.firstName?.toLowerCase()));
    if (!existing) { out.push({ ...inv }); continue; }
    for (const f of EXTRACT_FIELDS) if (existing[f] == null && inv[f] != null) (existing as any)[f] = inv[f];
  }
  return out;
}

/** Form keys used by the Add investor form (create-investor.tsx). */
export const FORM_KEYS: Record<(typeof EXTRACT_FIELDS)[number], string> = {
  firstName: "firstName", middleName: "middleName", lastName: "lastName", email: "email", phone: "phone", profileType: "profileType",
  entityName: "entityName", addressLine1: "address1", addressLine2: "address2", city: "city", region: "region", postalCode: "postal",
  country: "country", citizenship: "citizenship", amount: "amount",
};

/** Fill only blank form boxes, so anything typed stays. Returns the new values and which boxes changed. */
export function fillBlankFormFields(form: Record<string, string>, inv: ExtractedInvestor, opts: { profileTouched?: boolean } = {}) {
  const next = { ...form };
  const filled: (typeof EXTRACT_FIELDS)[number][] = [];
  for (const f of EXTRACT_FIELDS) {
    const v = inv[f];
    if (v == null) continue;
    const k = FORM_KEYS[f];
    if (f === "profileType") {
      if (!opts.profileTouched && next[k] !== v) { next[k] = v; filled.push(f); }
      continue;
    }
    if (!(next[k] ?? "").trim()) { next[k] = v; filled.push(f); }
  }
  return { form: next, filled };
}

const csvCell = (v: string | null | undefined) => {
  const s = (v ?? "").replace(/[\r\n]+/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Rows for the existing bulk preview, in its column order. */
export function investorsToBulkCsv(list: readonly ExtractedInvestor[]): string {
  const rows = list.map((i) => {
    const addr = [i.addressLine1, i.addressLine2, i.city, [i.region, i.postalCode].filter(Boolean).join(" "), i.country].filter((x) => x && String(x).trim()).join(", ");
    const first = [i.firstName, i.middleName].filter(Boolean).join(" ");
    const row: Record<(typeof BULK_COLUMNS)[number], string | null> = {
      first_name: first || null, last_name: i.lastName, email: i.email, profile_type: i.profileType ?? "individual", amount: i.amount,
      commitment: null, phone: i.phone, entity_name: i.entityName, address: addr || null,
    };
    return BULK_COLUMNS.map((c) => csvCell(row[c])).join(",");
  });
  return [BULK_COLUMNS.join(","), ...rows].join("\n");
}

export const FIELD_LABELS: Record<(typeof EXTRACT_FIELDS)[number], string> = {
  firstName: "first name", middleName: "middle name", lastName: "last name", email: "email", phone: "phone", profileType: "investor type",
  entityName: "entity or trust name", addressLine1: "address", addressLine2: "address line 2", city: "city", region: "state", postalCode: "postal code",
  country: "country", citizenship: "citizenship", amount: "amount",
};
