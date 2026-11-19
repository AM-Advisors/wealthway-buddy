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
export const RELATED_ROLES_READ = ["beneficial_owner", "control_person", "authorized_signer", "joint_owner", "trustee"] as const;
export type RelatedRoleGuess = (typeof RELATED_ROLES_READ)[number];
export const ENTITY_KINDS_READ = ["llc", "corporation", "partnership", "family_office", "foundation", "other_entity"] as const;

/** An owner, signer, trustee or joint owner named in the document (never the investing entity itself). */
export type ExtractedRelated = { firstName: string; lastName: string; email: string | null; role: RelatedRoleGuess; ownershipPercent: string | null; isSigner: boolean };

export type ExtractedInvestor = {
  firstName: string | null; middleName: string | null; lastName: string | null; preferredName: string | null;
  email: string | null; phone: string | null;
  profileType: ProfileGuess | null; entityName: string | null; entityType: (typeof ENTITY_KINDS_READ)[number] | null; jurisdiction: string | null; trustType: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null; postalCode: string | null; country: string | null;
  mailingAddress: string | null;
  /** Harmonious only: kept only when Harmonious staff read the document. */
  dateOfBirth: string | null;
  citizenship: string | null; amount: string | null; commitment: string | null; investmentDate: string | null; units: string | null;
  related: ExtractedRelated[];
};
export type DocumentReading = { documentKind: string; investors: ExtractedInvestor[]; notes: string[] };

/** Single-value fields, in the order they are shown. */
export const EXTRACT_FIELDS = [
  "firstName", "middleName", "lastName", "preferredName", "email", "phone", "profileType", "entityName", "entityType", "jurisdiction", "trustType",
  "addressLine1", "addressLine2", "city", "region", "postalCode", "country", "mailingAddress", "dateOfBirth", "citizenship",
  "amount", "commitment", "investmentDate", "units",
] as const;
export type ExtractField = (typeof EXTRACT_FIELDS)[number];

const nullableString = { type: ["string", "null"] } as const;
const INVESTOR_KEYS = [
  "first_name", "middle_name", "last_name", "preferred_name", "email", "phone", "investor_type", "entity_name", "entity_type", "jurisdiction", "trust_type",
  "address_line1", "address_line2", "city", "region", "postal_code", "country", "mailing_address", "date_of_birth", "citizenship",
  "amount", "commitment", "investment_date", "units", "related_people",
] as const;
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
        required: [...INVESTOR_KEYS],
        properties: {
          first_name: nullableString, middle_name: nullableString, last_name: nullableString, preferred_name: nullableString, email: nullableString, phone: nullableString,
          investor_type: { type: ["string", "null"], enum: ["individual", "joint", "entity", "trust", "ira", null] },
          entity_name: nullableString,
          entity_type: { type: ["string", "null"], enum: [...ENTITY_KINDS_READ, null] },
          jurisdiction: nullableString, trust_type: nullableString,
          address_line1: nullableString, address_line2: nullableString, city: nullableString,
          region: nullableString, postal_code: nullableString, country: nullableString, mailing_address: nullableString,
          date_of_birth: nullableString, citizenship: nullableString,
          amount: nullableString, commitment: nullableString, investment_date: nullableString, units: nullableString,
          related_people: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["first_name", "last_name", "email", "role", "ownership_percent", "is_signer"],
              properties: {
                first_name: { type: "string" }, last_name: { type: "string" }, email: nullableString,
                role: { type: "string", enum: [...RELATED_ROLES_READ] }, ownership_percent: nullableString, is_signer: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Reading rules. Birth dates are asked for only when Harmonious staff read the document. */
export function extractInstructions(opts: { includeBirthDate?: boolean } = {}): string {
  return [
    "You read documents a US fund administrator received for an investor (for example IRS Form W-9 or W-8, a driver's license or passport, a subscription agreement with its investor questionnaire, trust or company formation papers, an operating agreement, an owner list, a brokerage or bank statement).",
    "Read the whole document: every page, including signature pages, investor questionnaires, schedules, exhibits, annexes and attachments. Details for one investor are often spread across pages (name on the cover, address in the questionnaire, amount on the signature page, owners in an exhibit). Combine them into one entry per investing party and fill every field the document shows.",
    "List each investing party the document identifies. A W-9 or subscription agreement usually names one. A list or roster may name several.",
    "For a company, LLC, partnership or family office use investor_type entity with entity_name and entity_type, and put the signer or main contact person in the name fields. For a trust use trust with the full trust name, and put the trustee or grantor who signs in the name fields. For an IRA use ira. Two people investing together are joint: put the first person in the name fields and the other in related_people with role joint_owner.",
    "jurisdiction: the state or country where the company or trust was formed or whose law governs it. trust_type: for example Revocable or Irrevocable.",
    "Address fields hold the residential or principal address. mailing_address: a different mailing address as one line, or null.",
    "preferred_name: only a nickname the document states. citizenship: the country of citizenship when stated (for example on a passport, W-8 or questionnaire).",
    "amount is the subscription or investment amount in US dollars as digits only. commitment is a separate capital commitment if one is stated, else null. investment_date is the date the subscription was signed or accepted as YYYY-MM-DD. units is the number of units, shares or interests if stated.",
    "related_people: every owner, member, manager, trustee, beneficial owner, control person, authorized signer and joint owner named for that investing party (not the investing entity itself, and not the person already in the name fields). ownership_percent as digits only. is_signer true when they sign or are authorized to sign.",
    opts.includeBirthDate ? "date_of_birth: the person in the name fields' date of birth as YYYY-MM-DD, or null." : "date_of_birth: always null.",
    "Copy values exactly as written. Use null when something is not clearly shown. Never guess.",
    "Never output Social Security numbers, EINs, ITINs, tax ID numbers, account numbers, routing numbers, or passport or license numbers, anywhere, including notes.",
    "notes: short warnings a reviewer should know (unsigned, illegible, expired, pages missing, name differs between pages). Keep each under 200 characters.",
  ].join(" ");
}
export const EXTRACT_INSTRUCTIONS = extractInstructions();

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
function cleanNumber(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(String(v).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= max ? String(Math.round(n * 10000) / 10000) : null;
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
/** A real calendar date, not in the future; birth dates also after 1900. */
export function cleanDate(v: unknown, opts: { birth?: boolean; today?: string } = {}): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) return null;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  if (t > today) return null;
  if (opts.birth && t < "1900-01-01") return null;
  return t;
}
const PROFILE: readonly ProfileGuess[] = ["individual", "joint", "entity", "trust", "ira"];

function normalizeRelated(raw: unknown, inv: { firstName: string | null; lastName: string | null }): ExtractedRelated[] {
  const out: ExtractedRelated[] = [];
  for (const x of (Array.isArray(raw) ? raw : []).slice(0, 20) as any[]) {
    const firstName = clean(x?.first_name, 120), lastName = clean(x?.last_name, 120);
    if (!firstName || !lastName) continue;
    const same = (a: string | null, b: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
    if (same(firstName, inv.firstName) && same(lastName, inv.lastName)) continue;
    if (out.some((o) => same(o.firstName, firstName) && same(o.lastName, lastName))) continue;
    out.push({
      firstName, lastName, email: cleanEmail(x?.email),
      role: (RELATED_ROLES_READ as readonly string[]).includes(x?.role) ? x.role : "beneficial_owner",
      ownershipPercent: cleanNumber(x?.ownership_percent, 100), isSigner: x?.is_signer === true,
    });
  }
  return out;
}

/** Turns the raw AI JSON into safe, bounded values. Birth dates are kept only when asked for. */
export function normalizeReading(raw: unknown, opts: { keepBirthDate?: boolean } = {}): DocumentReading {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const investors = (Array.isArray(r["investors"]) ? r["investors"] : []).slice(0, 50).map((x: any): ExtractedInvestor => {
    const firstName = clean(x?.first_name, 120), lastName = clean(x?.last_name, 120);
    return {
      firstName, middleName: clean(x?.middle_name, 120), lastName, preferredName: clean(x?.preferred_name, 120),
      email: cleanEmail(x?.email), phone: cleanPhone(x?.phone),
      profileType: PROFILE.includes(x?.investor_type) ? x.investor_type : null,
      entityName: clean(x?.entity_name, 200),
      entityType: (ENTITY_KINDS_READ as readonly string[]).includes(x?.entity_type) ? x.entity_type : null,
      jurisdiction: clean(x?.jurisdiction, 80), trustType: clean(x?.trust_type, 80),
      addressLine1: clean(x?.address_line1), addressLine2: clean(x?.address_line2), city: clean(x?.city, 120), region: clean(x?.region, 120),
      postalCode: clean(x?.postal_code, 20) ?? (typeof x?.postal_code === "string" && /^\d{5}(-\d{4})?$/.test(x.postal_code.trim()) ? x.postal_code.trim() : null),
      country: clean(x?.country, 80), mailingAddress: clean(x?.mailing_address, 300),
      dateOfBirth: opts.keepBirthDate ? cleanDate(x?.date_of_birth, { birth: true }) : null,
      citizenship: clean(x?.citizenship, 80), amount: cleanAmount(x?.amount), commitment: cleanAmount(x?.commitment),
      investmentDate: cleanDate(x?.investment_date), units: cleanNumber(x?.units, 1e12),
      related: normalizeRelated(x?.related_people, { firstName, lastName }),
    };
  }).filter((i: ExtractedInvestor) => i.firstName || i.lastName || i.entityName || i.email);
  const notes = (Array.isArray(r["notes"]) ? r["notes"] : []).map((n: unknown) => clean(n, 200)).filter((n: string | null): n is string => !!n).slice(0, 8);
  return { documentKind: clean(r["document_kind"], 80) ?? "Document", investors, notes };
}

/** Later documents fill only what earlier ones left blank; owners and signers are added once by name. */
export function mergeInvestorInto(target: ExtractedInvestor, inv: ExtractedInvestor): ExtractedInvestor {
  for (const f of EXTRACT_FIELDS) if (target[f] == null && inv[f] != null) (target as any)[f] = inv[f];
  const rel = [...(target.related ?? [])];
  for (const p of inv.related ?? []) {
    const i = rel.findIndex((o) => o.firstName.toLowerCase() === p.firstName.toLowerCase() && o.lastName.toLowerCase() === p.lastName.toLowerCase());
    if (i < 0) rel.push({ ...p });
    else rel[i] = { ...rel[i]!, email: rel[i]!.email ?? p.email, ownershipPercent: rel[i]!.ownershipPercent ?? p.ownershipPercent, isSigner: rel[i]!.isSigner || p.isSigner };
  }
  target.related = rel;
  return target;
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
    if (!existing) { out.push({ ...inv, related: [...(inv.related ?? [])] }); continue; }
    mergeInvestorInto(existing, inv);
  }
  return out;
}

/** Form keys used by the Add investor form (create-investor.tsx). */
export const FORM_KEYS: Record<ExtractField, string> = {
  firstName: "firstName", middleName: "middleName", lastName: "lastName", preferredName: "preferredName", email: "email", phone: "phone", profileType: "profileType",
  entityName: "entityName", entityType: "entityType", jurisdiction: "jurisdiction", trustType: "trustType",
  addressLine1: "address1", addressLine2: "address2", city: "city", region: "region", postalCode: "postal", country: "country", mailingAddress: "mailing",
  dateOfBirth: "dob", citizenship: "citizenship", amount: "amount", commitment: "commitment", investmentDate: "investmentDate", units: "units",
};

/** Fill only blank form boxes, so anything typed stays. Birth dates fill only for Harmonious. Returns the new values and which boxes changed. */
export function fillBlankFormFields(form: Record<string, string>, inv: ExtractedInvestor, opts: { profileTouched?: boolean; isStaff?: boolean } = {}) {
  const next = { ...form };
  const filled: ExtractField[] = [];
  for (const f of EXTRACT_FIELDS) {
    const v = inv[f];
    if (v == null) continue;
    if (f === "dateOfBirth" && !opts.isStaff) continue;
    const k = FORM_KEYS[f];
    if (f === "profileType") {
      if (!opts.profileTouched && next[k] !== v) { next[k] = v; filled.push(f); }
      continue;
    }
    if (!(next[k] ?? "").trim()) { next[k] = String(v); filled.push(f); }
  }
  return { form: next, filled };
}

/** Owners and signers for the form's Entity / Ownership list, skipping anyone already listed. */
export function relatedRowsToAdd(existing: readonly { firstName: string; lastName: string }[], inv: ExtractedInvestor) {
  const has = (p: { firstName: string; lastName: string }) => existing.some((e) => e.firstName.trim().toLowerCase() === p.firstName.toLowerCase() && e.lastName.trim().toLowerCase() === p.lastName.toLowerCase());
  return (inv.related ?? []).filter((p) => !has(p)).map((p) => ({
    firstName: p.firstName, lastName: p.lastName, email: p.email ?? "", role: p.isSigner && p.role === "beneficial_owner" ? "authorized_signer" : p.role, ownershipPercent: p.ownershipPercent ?? "",
  }));
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
      commitment: i.commitment, phone: i.phone, entity_name: i.entityName, address: addr || null,
    };
    return BULK_COLUMNS.map((c) => csvCell(row[c])).join(",");
  });
  return [BULK_COLUMNS.join(","), ...rows].join("\n");
}

export const FIELD_LABELS: Record<ExtractField, string> = {
  firstName: "first name", middleName: "middle name", lastName: "last name", preferredName: "preferred name", email: "email", phone: "phone", profileType: "investor type",
  entityName: "entity or trust name", entityType: "entity type", jurisdiction: "jurisdiction", trustType: "trust type",
  addressLine1: "address", addressLine2: "address line 2", city: "city", region: "state", postalCode: "postal code", country: "country", mailingAddress: "mailing address",
  dateOfBirth: "date of birth", citizenship: "citizenship", amount: "amount", commitment: "commitment", investmentDate: "investment date", units: "units",
};
