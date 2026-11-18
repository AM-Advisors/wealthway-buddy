/** Pure rules: match Wix staging investors to a fund's Harmonious investors and fill only blank contact fields. */
import { parseAddressParts } from "@/lib/address";

export type WixInv = { wixId: string; fullName: string | null; entityName: string | null; email: string | null; details: Record<string, unknown> };
export type HarmInv = { onboardingId: string; personId: string; firstName: string | null; lastName: string | null; profileName: string | null; person: Record<string, unknown> };
export type FieldFill = { field: string; label: string; value: string };
export type SyncRow = { onboardingId: string; personId: string; investor: string; wixId: string; fills: FieldFill[] };

const key = (s: unknown) => String(s ?? "").toLowerCase().replace(/\b(llc|lp|l\.p\.|inc|corp|corporation|ltd|the)\b/g, "").replace(/[^a-z0-9]/g, "");
const blank = (v: unknown) => v == null || String(v).trim() === "";

export function wixContact(w: WixInv) {
  const d = w.details ?? {};
  const email = String(w.email || d["investorsEmail"] || "").trim();
  const digits = String(d["investorsPhone"] ?? "").replace(/\D/g, "");
  const phone = digits.length >= 10 ? digits : "";
  const raw = String(d["physicalAddress"] || d["mailingAddress"] || "").trim();
  const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  const country = /^(usa|us|united states( of america)?)$/i.test(last) ? "United States" : "";
  const a = parseAddressParts(country ? tokens.slice(0, -1).join(", ") : raw);
  return { email, phone, line1: a.addressLine1, line2: a.addressLine2, city: a.addressCity, region: a.addressState, postal: a.addressZip, country };
}

/** One Wix row per Harmonious investor, only when the match is unambiguous (email, exact person name, or entity name). */
export function matchInvestors(harm: HarmInv[], wix: WixInv[]): Map<string, WixInv> {
  const out = new Map<string, WixInv>();
  const used = new Set<string>();
  const uniq = (list: WixInv[]) => (list.length === 1 && !used.has(list[0]!.wixId) ? list[0]! : null);
  for (const h of harm) {
    const email = String(h.person["email"] ?? "").toLowerCase();
    const name = key(`${h.firstName ?? ""}${h.lastName ?? ""}`);
    const prof = key(h.profileName);
    const hit = (email && uniq(wix.filter((w) => wixContact(w).email.toLowerCase() === email)))
      || (prof && uniq(wix.filter((w) => w.entityName && key(w.entityName) === prof)))
      || (name && uniq(wix.filter((w) => !w.entityName && key(w.fullName) === name)))
      || (prof && uniq(wix.filter((w) => !w.entityName && key(w.fullName) === prof)));
    if (hit) { out.set(h.onboardingId, hit); used.add(hit.wixId); }
  }
  return out;
}

const FIELDS: [string, string, keyof ReturnType<typeof wixContact>][] = [
  ["email", "Email", "email"], ["phone", "Phone", "phone"], ["address_line1", "Address", "line1"], ["address_line2", "Address line 2", "line2"],
  ["city", "City", "city"], ["region", "State / region", "region"], ["postal_code", "Postal code", "postal"], ["country", "Country", "country"],
];

/** Blank-only fills; an existing Harmonious value is never replaced. Address parts fill only when the whole address is empty. */
export function planSync(harm: HarmInv[], wix: WixInv[]): { rows: SyncRow[]; unmatchedHarmonious: string[]; unmatchedWix: string[] } {
  const m = matchInvestors(harm, wix);
  const rows: SyncRow[] = [];
  for (const h of harm) {
    const w = m.get(h.onboardingId); if (!w) continue;
    const c = wixContact(w);
    const addrEmpty = ["address_line1", "city", "region", "postal_code"].every((f) => blank(h.person[f]));
    const fills = FIELDS.filter(([f, , k]) => c[k] && blank(h.person[f]) && (!f.startsWith("address") && !["city", "region", "postal_code"].includes(f) || addrEmpty))
      .map(([f, label, k]) => ({ field: f, label, value: c[k] }));
    rows.push({ onboardingId: h.onboardingId, personId: h.personId, investor: h.profileName || `${h.firstName ?? ""} ${h.lastName ?? ""}`.trim() || "Investor", wixId: w.wixId, fills });
  }
  const matchedWix = new Set([...m.values()].map((w) => w.wixId));
  return {
    rows,
    unmatchedHarmonious: harm.filter((h) => !m.has(h.onboardingId)).map((h) => h.profileName || `${h.firstName ?? ""} ${h.lastName ?? ""}`.trim()),
    unmatchedWix: wix.filter((w) => !matchedWix.has(w.wixId)).map((w) => w.entityName || w.fullName || "(unnamed)"),
  };
}
