/** Form D intelligence + research categorisation. Pure; no I/O. */
export type FormD = {
  accession: string; cik: string; issuer: string; form_type: string; is_amendment: boolean; filed_at: string | null;
  industry: string | null; fund_type: string | null; state: string | null; exemptions: string[];
  total_offering: number | null; offering_indefinite: boolean; total_sold: number | null; investors: number | null;
  total_remaining?: number | null; remaining_indefinite?: boolean;
};

const pick = (x: string, t: string) => x.match(new RegExp(`<${t}>\\s*([\\s\\S]*?)\\s*</${t}>`))?.[1]?.trim() ?? null;
const num = (s: string | null) => (s == null || s === "" || !/^-?\d+(\.\d+)?$/.test(s) ? null : Number(s));

/** EDGAR atom title: "D/A - Issuer Name (0001234567) (Filer)". */
export function parseAtomTitle(title: string) {
  const m = title.match(/^(D(?:\/A)?)\s+-\s+(.+?)\s+\((\d{10})\)/);
  return m ? { form_type: m[1]!, issuer: m[2]!, cik: m[3]! } : null;
}

/** Parses the official primary_doc.xml. Amounts stay null when not disclosed. */
export function parseFormDXml(xml: string) {
  const sales = pick(xml, "offeringSalesAmounts") ?? "";
  const totalRaw = pick(sales, "totalOfferingAmount");
  const ex = pick(xml, "federalExemptionsExclusions") ?? "";
  return {
    industry: pick(xml, "industryGroupType"),
    fund_type: pick(xml, "investmentFundType"),
    state: pick(pick(xml, "issuerAddress") ?? "", "stateOrCountry"),
    exemptions: [...ex.matchAll(/<item>\s*([^<]+?)\s*<\/item>/g)].map((m) => m[1]!),
    total_offering: num(totalRaw),
    offering_indefinite: /indefinite/i.test(totalRaw ?? ""),
    total_sold: num(pick(sales, "totalAmountSold")),
    total_remaining: num(pick(sales, "totalRemaining")),
    remaining_indefinite: /indefinite/i.test(pick(sales, "totalRemaining") ?? ""),
    investors: num(pick(pick(xml, "investors") ?? "", "totalNumberAlreadyInvested")),
    is_amendment: pick(xml, "isAmendment") === "true",
  };
}

export const EXEMPTION_LABEL: Record<string, string> = {
  "06b": "Rule 506(b)", "06c": "Rule 506(c)", "04": "Rule 504", "3C": "Investment Company Act 3(c)",
  "3C.1": "3(c)(1)", "3C.7": "3(c)(7)", "4a5": "Section 4(a)(5)",
};

/** Promote to the main feed only when meaningful. New filings only; amounts are as reported, never "raised". */
export const NEWSWORTHY_OFFERING = 250_000_000;
export const NEWSWORTHY_SOLD = 100_000_000;
export function newsworthiness(f: Pick<FormD, "is_amendment" | "total_offering" | "total_sold" | "industry">): { newsworthy: boolean; reason: string | null } {
  if (f.is_amendment) return { newsworthy: false, reason: null };
  if ((f.total_sold ?? 0) >= NEWSWORTHY_SOLD) return { newsworthy: true, reason: `Reported amount sold of ${usd(f.total_sold!)} or more` };
  if ((f.total_offering ?? 0) >= NEWSWORTHY_OFFERING) return { newsworthy: true, reason: `Reported total offering amount of ${usd(f.total_offering!)}` };
  return { newsworthy: false, reason: null };
}

export const usd = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;

export function issuerCategory(f: Pick<FormD, "industry" | "fund_type">) {
  if (f.industry === "Pooled Investment Fund") return f.fund_type ? `Fund — ${f.fund_type}` : "Fund — other";
  return f.industry ? `Operating company — ${f.industry}` : "Not disclosed";
}

/** Latest filing per issuer, with prior filings kept as history (nothing dropped). */
export function dedupeByIssuer<T extends Pick<FormD, "cik" | "filed_at">>(rows: T[]) {
  const by = new Map<string, T[]>();
  for (const r of rows) by.set(r.cik, [...(by.get(r.cik) ?? []), r]);
  return [...by.values()].map((list) => {
    const s = [...list].sort((a, b) => String(b.filed_at).localeCompare(String(a.filed_at)));
    return { latest: s[0]!, history: s.slice(1) };
  });
}

/** Weekly digest: every number is computed from the filings themselves. */
export function weeklyDigest(rows: FormD[]) {
  const group = (k: (f: FormD) => string) => {
    const m = new Map<string, { count: number; offering: number; sold: number }>();
    for (const f of rows) {
      const key = k(f), g = m.get(key) ?? { count: 0, offering: 0, sold: 0 };
      g.count++; g.offering += f.total_offering ?? 0; g.sold += f.total_sold ?? 0; m.set(key, g);
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count);
  };
  const newOnes = rows.filter((f) => !f.is_amendment);
  const disclosedOffer = newOnes.filter((f) => f.total_offering != null);
  // Amendments restate cumulative totals, so sums use new filings only to avoid double counting.
  const disclosedSold = newOnes.filter((f) => f.total_sold != null);
  const funds = rows.filter((f) => f.industry === "Pooled Investment Fund");
  const issuers = new Set(rows.map((f) => f.cik)).size;
  const patterns: string[] = [];
  if (rows.length) {
    patterns.push(`${rows.length} Form D filings from ${issuers} issuers: ${newOnes.length} new notices and ${rows.length - newOnes.length} amendments.`);
    patterns.push(`${funds.length} (${Math.round((funds.length / rows.length) * 100)}%) were pooled investment funds.`);
    if (disclosedOffer.length) patterns.push(`Reported total offering amounts sum to ${usd(disclosedOffer.reduce((s, f) => s + (f.total_offering ?? 0), 0))} across ${disclosedOffer.length} new filings that disclosed one (the size each issuer reported it is offering — not completed fundraising).`);
    if (disclosedSold.length) patterns.push(`Reported amounts sold sum to ${usd(disclosedSold.reduce((s, f) => s + (f.total_sold ?? 0), 0))} across ${disclosedSold.length} new filings, as self-reported by the issuers on Form D — not independently verified cash proceeds (amendments excluded to avoid double counting).`);
    const ex = group((f) => (f.exemptions.includes("06c") ? "Rule 506(c)" : f.exemptions.includes("06b") ? "Rule 506(b)" : "Other/none"))[0];
    if (ex) patterns.push(`Most common exemption: ${ex.key} (${ex.count} filings).`);
  }
  return {
    total: rows.length, issuers, newCount: newOnes.length, amendments: rows.length - newOnes.length, patterns,
    byDate: group((f) => (f.filed_at ?? "").slice(0, 10) || "Unknown"),
    byIndustry: group((f) => f.industry ?? "Not disclosed"),
    byCategory: group(issuerCategory),
    byState: group((f) => f.state ?? "Not disclosed"),
    byExemption: group((f) => f.exemptions.filter((e) => EXEMPTION_LABEL[e]).map((e) => EXEMPTION_LABEL[e]).join(" + ") || "Not disclosed"),
    byType: group((f) => (f.is_amendment ? "Amendment" : "New filing")),
    bySize: group((f) => f.total_offering == null ? (f.offering_indefinite ? "Indefinite" : "Not disclosed") : f.total_offering < 1e6 ? "Under $1M" : f.total_offering < 1e7 ? "$1M–$10M" : f.total_offering < 1e8 ? "$10M–$100M" : "$100M+"),
  };
}

/* ---------- research categories & freshness ---------- */
export const CATEGORIES = { breaking: "Breaking news", regulatory: "Regulatory developments", private_market: "Private-market intelligence", form_d: "Form D intelligence", evergreen: "Evergreen educational" } as const;
export type Category = keyof typeof CATEGORIES;
const PM = /\b(ipo|initial public offering|acquisition|merger|venture|secondary|private equity|private credit|spv|fundrais|startup|tender offer)\b/i;
const REG = /\b(rule|regulation|proposed|final rule|guidance|notice|comment|amendment|exemption|enforcement|charges|settle)\b/i;

export function categorize(s: { source_key: string; headline: string; summary?: string | null; published_at: string | null }, now = new Date()): Category {
  if (s.source_key === "sec_form_d") return "form_d";
  const ageDays = s.published_at ? (now.getTime() - new Date(s.published_at).getTime()) / 86400000 : Infinity;
  const text = `${s.headline} ${s.summary ?? ""}`;
  if (ageDays > 30) return "evergreen";
  if (PM.test(text)) return "private_market";
  if (s.source_key.startsWith("fr_") || REG.test(text)) return ageDays <= 2 && s.source_key === "sec_press" ? "breaking" : "regulatory";
  return ageDays <= 2 ? "breaking" : "evergreen";
}

/** Warn when an older development could be presented as current. Uses publication date, never retrieval date. */
export function freshnessWarning(publishedAt: string | null, now = new Date()): string | null {
  if (!publishedAt) return "Original publication date unknown — confirm before presenting as current.";
  const d = Math.floor((now.getTime() - new Date(publishedAt).getTime()) / 86400000);
  return d > 14 ? `Published ${d} days ago — don't present as current news.` : null;
}

/** Keep routine filings from dominating: Form D stories only rank in the main feed when promoted. */
export function mainFeed<T extends { category: string | null; promoted: boolean }>(rows: T[]) {
  return rows.filter((r) => r.category !== "form_d" || r.promoted);
}

/** SEC field meanings, used for every displayed amount. */
export const FORMD_FIELD = {
  total_offering: { label: "Total offering amount", note: "Issuer-reported size of the offering (Form D Item 13). Not completed fundraising." },
  total_sold: { label: "Total amount sold", note: "Issuer-reported amount sold to date (Item 13). Not independently verified cash proceeds." },
  total_remaining: { label: "Total remaining to be sold", note: "Issuer-reported remainder of the offering (Item 13)." },
} as const;
export function fmtFormDAmount(v: number | null | undefined, indefinite?: boolean) {
  return v != null ? usd(v) : indefinite ? "Indefinite" : "Not disclosed";
}
