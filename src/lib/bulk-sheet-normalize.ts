/** Turns spreadsheet rows with loose headers into the bulk-add CSV columns. Pure, browser-safe. */
const ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "first", "firstname", "given_name"],
  last_name: ["last_name", "last", "lastname", "surname", "family_name"],
  email: ["email", "email_address", "e_mail", "investor_email"],
  profile_type: ["profile_type", "investor_type", "type", "investing_as", "entity_type"],
  amount: ["amount", "investment", "investment_amount", "subscription_amount", "amount_invested", "invested", "capital"],
  commitment: ["commitment", "commitment_amount", "committed"],
  phone: ["phone", "phone_number", "mobile", "cell"],
  entity_name: ["entity_name", "entity", "investing_entity", "legal_name", "company", "trust_name"],
  address: ["address", "mailing_address", "street_address", "street"],
};
const NAME = ["name", "full_name", "investor", "investor_name", "lp_name", "lp"];
const key = (h: string) => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const cell = (v: unknown) => { const s = String(v ?? "").trim(); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function rowsToBulkCsv(rows: unknown[][]): string {
  // Header = first row that has an email-ish or name-ish column.
  const hi = rows.findIndex((r) => r.some((c) => { const k = key(String(c ?? "")); return ALIASES['email']!.includes(k) || NAME.includes(k) || ALIASES['first_name']!.includes(k); }));
  if (hi < 0) throw new Error("Couldn't find a header row with names or emails.");
  const head = rows[hi]!.map((c) => key(String(c ?? "")));
  const idx: Record<string, number> = {};
  for (const [col, al] of Object.entries(ALIASES)) { const i = head.findIndex((h) => al.includes(h)); if (i >= 0) idx[col] = i; }
  const nameI = head.findIndex((h) => NAME.includes(h));
  const cols = Object.keys(ALIASES);
  const out = [cols.join(",")];
  for (const r of rows.slice(hi + 1)) {
    if (!r.some((c) => String(c ?? "").trim())) continue;
    const v: Record<string, string> = {};
    for (const c of cols) v[c] = idx[c] != null ? String(r[idx[c]!] ?? "").trim() : "";
    if (!v['first_name'] && !v['last_name'] && nameI >= 0) {
      const parts = String(r[nameI] ?? "").trim().split(/\s+/);
      v['first_name'] = parts.shift() ?? ""; v['last_name'] = parts.join(" ");
    }
    v['amount'] = v['amount']!.replace(/[$,\s]/g, ""); v['commitment'] = v['commitment']!.replace(/[$,\s]/g, "");
    out.push(cols.map((c) => cell(v[c])).join(","));
  }
  return out.join("\n");
}
