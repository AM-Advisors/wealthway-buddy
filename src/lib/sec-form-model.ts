/** Pure SEC helpers for the fund Compliance tab. Record/prepare only; nothing files. */
export const EFD_URL = "https://www.edgarfiling.sec.gov";
export const normalizeCik = (v: string) => { const d = v.replace(/\D/g, ""); return d.length >= 1 && d.length <= 10 ? d.padStart(10, "0") : null; };
export const isAccession = (v: string) => /^\d{10}-\d{2}-\d{6}$/.test(v.trim());
export const isCcc = (v: string) => /^[A-Za-z0-9@#*$]{8}$/.test(v.trim());
export const edgarCompanyUrl = (cik: string) => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`;
export const edgarFilingUrl = (cik: string, accession: string) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/`;

export type RegType = "506b" | "506c" | "regcf" | "rega" | "regaplus";
export const REG_LABEL: Record<RegType, string> = { "506b": "Rule 506(b)", "506c": "Rule 506(c)", regcf: "Regulation CF", rega: "Regulation A (Tier 1)", regaplus: "Regulation A (Tier 2)" };
/** Forms for each regulation: first entry is the initial filing. */
export const FORMS_FOR: Record<RegType, string[]> = {
  "506b": ["Form D", "Form D/A"], "506c": ["Form D", "Form D/A"],
  regcf: ["Form C", "Form C/A", "Form C-U", "Form C-AR"],
  rega: ["Form 1-A", "Form 1-A/A"], regaplus: ["Form 1-A", "Form 1-A/A", "Form 1-K"],
};
export const ALL_FORMS = Array.from(new Set(Object.values(FORMS_FOR).flat()));

export type PrepFacts = { name?: string | null; cik?: string | null; address?: string | null; state?: string | null; entityType?: string | null; dateFormed?: string | null; regType?: string | null; maxOfferingCents?: number | null; firstSaleOn?: string | null; signer?: string | null; soldCents: number; investors: number; accredited: number };
/** Which form to prepare next and what's still missing. */
export function prepareFiling(f: PrepFacts, filedForms: string[]) {
  const reg = (f.regType ?? "") as RegType;
  const forms = FORMS_FOR[reg] ?? ["Form D", "Form D/A"];
  const form = filedForms.includes(forms[0]!) ? forms[1]! : forms[0]!;
  const missing: string[] = [];
  if (!f.name) missing.push("Legal name");
  if (!f.cik) missing.push("CIK");
  if (!f.address) missing.push("Principal address");
  if (!f.state) missing.push("State of formation");
  if (!f.entityType) missing.push("Entity type");
  if (!f.dateFormed) missing.push("Date formed");
  if (!FORMS_FOR[reg]) missing.push("Offering regulation");
  if (f.maxOfferingCents == null) missing.push("Total offering amount");
  if (!f.firstSaleOn) missing.push("Date of first sale");
  if (!f.signer) missing.push("Signer");
  return { form, regulation: REG_LABEL[reg] ?? "Not recorded", missing };
}
