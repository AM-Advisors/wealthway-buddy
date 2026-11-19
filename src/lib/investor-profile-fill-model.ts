/**
 * Completing an existing investor's profile from what the AI read in their documents.
 * Pure rules shared by the folder imports. Nothing typed or recorded is overwritten:
 *  - blank contact, address, entity and investment details are filled directly (logged),
 *  - anything that differs, plus names, email, birth date and citizenship, becomes a
 *    suggestion a Harmonious reviewer accepts or rejects,
 *  - once the investor has their own login, or signing/funding has started, everything is a suggestion.
 * Tax ID, account and document numbers never appear here.
 */
import type { ExtractedInvestor, ExtractedRelated } from "@/lib/investor-doc-extract-model";

export type FillTable = "persons" | "investment_profiles" | "investor_onboardings";
export type FillItem = { table: FillTable; field: string; value: unknown; label: string };
export type CurrentRecord = {
  person: Record<string, unknown>;
  profile: { profile_type: string | null; legal_name: string | null; details: Record<string, unknown> | null } | null;
  investment: Record<string, unknown>;
  relatedNames: { firstName: string; lastName: string }[];
  /** The person signed in and owns their details. */
  claimed: boolean;
  /** Before signing or funding. */
  editWindowOpen: boolean;
};
export type FillPlan = { fill: FillItem[]; suggest: FillItem[]; details: Record<string, string>; related: ExtractedRelated[] };

const blank = (v: unknown) => v == null || (typeof v === "string" && !v.trim()) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);
const norm = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/\s+/g, " ").trim().toLowerCase();
const same = (a: unknown, b: unknown) => norm(a) === norm(b);
const toCents = (s: string | null) => { if (!s) return null; const n = Math.round(Number(s) * 100); return Number.isFinite(n) && n > 0 ? n : null; };
const ENTITY_DB = new Set(["llc", "corporation", "partnership", "family_office", "foundation", "other_entity", "entity"]);

/** Decide what fills directly, what goes to review, and which owners/signers to add. */
export function planProfileFill(cur: CurrentRecord, inv: ExtractedInvestor): FillPlan {
  const direct = !cur.claimed && cur.editWindowOpen;
  const fill: FillItem[] = [], suggest: FillItem[] = [];
  const consider = (table: FillTable, field: string, value: unknown, label: string, current: unknown, mode: "fill" | "review") => {
    if (value == null || value === "") return;
    if (!blank(current) && same(current, value)) return;
    if (direct && mode === "fill" && blank(current)) fill.push({ table, field, value, label });
    else suggest.push({ table, field, value, label });
  };
  const p = cur.person;

  // Identity: always reviewed.
  consider("persons", "legal_first_name", inv.firstName, "first name", p["legal_first_name"], "review");
  consider("persons", "legal_last_name", inv.lastName, "last name", p["legal_last_name"], "review");
  consider("persons", "email", inv.email, "email", p["email"], "review");
  consider("persons", "date_of_birth", inv.dateOfBirth, "date of birth", p["date_of_birth"], "review");
  consider("persons", "citizenship_country", inv.citizenship, "citizenship", p["citizenship_country"], "review");
  // Contact details: filled when blank.
  consider("persons", "legal_middle_name", inv.middleName, "middle name", p["legal_middle_name"], "fill");
  consider("persons", "preferred_name", inv.preferredName, "preferred name", p["preferred_name"], "fill");
  consider("persons", "phone", inv.phone, "phone", p["phone"], "fill");
  consider("persons", "mailing_address", inv.mailingAddress ? { line1: inv.mailingAddress } : null, "mailing address", p["mailing_address"], "fill");
  // Address as one unit: filled only when the record has no address, so two addresses never mix.
  const ADDR: [string, keyof ExtractedInvestor, string][] = [
    ["address_line1", "addressLine1", "address"], ["address_line2", "addressLine2", "address line 2"], ["city", "city", "city"],
    ["region", "region", "state"], ["postal_code", "postalCode", "postal code"], ["country", "country", "country"],
  ];
  const noAddress = ADDR.every(([f]) => blank(p[f]));
  for (const [f, k, label] of ADDR) consider("persons", f, inv[k], label, p[f], noAddress ? "fill" : "review");

  // Investing party.
  const type = String(cur.profile?.profile_type ?? "");
  const isEntity = ENTITY_DB.has(type), isTrust = type === "trust";
  const details: Record<string, string> = {};
  if (cur.profile && (isEntity || isTrust)) {
    consider("investment_profiles", "legal_name", inv.entityName, "legal name", cur.profile.legal_name, "fill");
    const d = cur.profile.details ?? {};
    const want: [string, string | null][] = [["jurisdiction", inv.jurisdiction], ...(isTrust ? [["trustType", inv.trustType] as [string, string | null]] : [])];
    if (direct) for (const [k, v] of want) if (v && blank(d[k])) details[k] = v;
  }

  // Investment details: filled when blank, differences reviewed.
  const i = cur.investment;
  consider("investor_onboardings", "requested_amount_cents", toCents(inv.amount), "investment amount", i["requested_amount_cents"], "fill");
  consider("investor_onboardings", "commitment_amount_cents", toCents(inv.commitment), "commitment", i["commitment_amount_cents"], "fill");
  consider("investor_onboardings", "investment_date", inv.investmentDate, "investment date", i["investment_date"], "fill");
  consider("investor_onboardings", "unit_count", inv.units ? Number(inv.units) : null, "units", i["unit_count"], "fill");

  // Owners and signers: added once, only for entities, trusts and joint investors, only before signing.
  const named = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) => same(a.firstName, b.firstName) && same(a.lastName, b.lastName);
  const self = { firstName: String(p["legal_first_name"] ?? ""), lastName: String(p["legal_last_name"] ?? "") };
  const related = direct && (isEntity || isTrust || type === "joint")
    ? (inv.related ?? []).filter((r) => !named(r, self) && !cur.relatedNames.some((e) => named(r, e)) && (type !== "joint" || r.role === "joint_owner"))
    : [];
  return { fill, suggest, details, related };
}

/** One plain sentence for the reviewer. */
export function fillSummary(r: { filled: string[]; suggested: string[]; related: number; underReview?: number }): string {
  const parts: string[] = [];
  if (r.filled.length) parts.push(`Filled in ${r.filled.join(", ")}`);
  if (r.related) parts.push(`added ${r.related} owner${r.related === 1 ? "" : "s"} or signer${r.related === 1 ? "" : "s"}`);
  if (r.suggested.length) parts.push(`${r.suggested.length} detail${r.suggested.length === 1 ? "" : "s"} sent to review (${r.suggested.join(", ")})`);
  if (!parts.length) return "The profile already has everything the documents show.";
  const s = parts.join("; ");
  return `${s[0]!.toUpperCase()}${s.slice(1)}.`;
}
