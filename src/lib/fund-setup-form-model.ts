/** Field layout for the shared Fund Setup form. Each field saves through an existing setup section. */
export type FieldDef = {
  key: string;
  label: string;
  section?: "fund_details" | "fees_team";
  required?: boolean;
  type?: "text" | "date" | "number";
  options?: readonly (readonly [string, string])[];
  disabled?: boolean;
  fixed?: string;
};

const fd = "fund_details" as const;
const ft = "fees_team" as const;

export const ENTITY_TYPES = [["LLC", "LLC"], ["Series LLC", "Series LLC"], ["LP", "LP"], ["Corporation", "Corporation"], ["Trust", "Trust"], ["Other", "Other"]] as const;
export const FORM_D_TYPES = [["506b", "Rule 506(b)"], ["506c", "Rule 506(c)"], ["regcf", "Reg CF"], ["rega", "Reg A"], ["regaplus", "Reg A+"]] as const;

export const FORM_SECTIONS: { id: string; title: string; fields: FieldDef[] }[] = [
  { id: "basic", title: "Basic Details", fields: [
    { key: "legalName", label: "Fund Legal Name", section: fd, required: true },
    { key: "gpName", label: "Fund Manager (entity)", section: fd, required: true },
    { key: "fundType", label: "Fund Type", section: fd, required: true, options: [] },
    { key: "entityType", label: "Entity Type", section: fd, required: true, options: ENTITY_TYPES },
    { key: "regType", label: "Form D Type", section: fd, options: FORM_D_TYPES },
  ] },
  { id: "details", title: "Fund Details", fields: [
    { key: "displayName", label: "Fund name", section: fd, required: true },
    { key: "targetRaise", label: "Raise amount ($)", section: fd, type: "number" },
    { key: "minInvestment", label: "Minimum commitment ($)", section: fd, type: "number", required: true },
    { key: "formationDate", label: "Formation date", section: fd, type: "date" },
    { key: "offeringOpenDate", label: "Open date", section: fd, type: "date" },
    { key: "offeringCloseDate", label: "Close Date", section: fd, type: "date" },
    { key: "arbitrationCity", label: "Arbitration city (Subscription Agreement)", section: fd },
    { key: "arbitrationState", label: "Arbitration state (Subscription Agreement)", section: fd },
  ] },
  { id: "jurisdiction", title: "Jurisdiction", fields: [
    { key: "country", label: "Country", disabled: true, fixed: "United States" },
    { key: "jurisdiction", label: "State", section: fd, required: true },
    { key: "registeredAgent", label: "Registered agent", section: fd },
    { key: "addressLine1", label: "Address line 1", section: fd },
    { key: "addressLine2", label: "Address line 2", section: fd },
    { key: "addressCity", label: "City", section: fd },
    { key: "addressState", label: "State (address)", section: fd },
    { key: "addressZip", label: "ZIP code", section: fd },
  ] },
  { id: "offering", title: "Offering", fields: [
    { key: "rollingCloses", label: "Rolling closes", section: fd, options: [["yes", "Yes"], ["no", "No"]] },
  ] },
  { id: "fees", title: "Fees & Terms", fields: [
    { key: "managementFeePercent", label: "Management fee (%)", section: ft, type: "number" },
    { key: "managementFeeFrequency", label: "Management fee charged", section: ft, options: [["annual", "Per year"], ["per_capital_call", "Per capital call"], ["one_time", "One time"]] },
    { key: "carryPercent", label: "Carried interest (%)", section: ft, type: "number" },
    { key: "preferredReturnPercent", label: "Preferred return (%)", section: ft, type: "number" },
  ] },
];

const SECTION_OF = new Map(FORM_SECTIONS.flatMap((s) => s.fields).filter((f) => f.section).map((f) => [f.key, f.section!]));

/** Group changed, non-empty values by the save section they belong to. */
export function changedBySection(vals: Record<string, string>, prior: Record<string, string>) {
  const out: Record<string, Record<string, string>> = {};
  for (const [k, raw] of Object.entries(vals)) {
    const sec = SECTION_OF.get(k);
    const val = (raw ?? "").trim();
    if (!sec || !val || val === (prior[k] ?? "")) continue;
    (out[sec] ??= {})[k] = val;
  }
  return out;
}

/** Display rows for one fund class in the Setup summary card (display only). */
export function classSummaryRows(c: {
  name: string;
  managementFee?: { ratePercent: number | null; basis?: string | null; frequency?: string | null; paymentTerms?: string | null } | null;
  carry?: { ratePercent: number | null; applicability?: string | null } | null;
  preferredReturnPercent?: number | null;
  minInvestmentCents?: number | null;
  maxInvestmentCents?: number | null;
  otherDifferences?: string | null;
}): { title: string; range: string; rows: [string, string][] } {
  const money = (cents: number) => { const d = cents / 100; return d >= 1000 && d % 1000 === 0 ? `$${d / 1000}K` : `$${d.toLocaleString("en-US")}`; };
  const min = c.minInvestmentCents ?? null, max = c.maxInvestmentCents ?? null;
  const range = min != null && max != null ? `${money(min)} to under ${money(max)}` : min != null ? `${money(min)} and up` : max != null ? `Under ${money(max)}` : "Any amount";
  const f = c.managementFee;
  const freq: Record<string, string> = { annual: "per year", quarterly: "per quarter", per_capital_call: "per capital call", one_time: "one time" };
  const basis = f?.basis ? ` on ${f.basis.replace(/_/g, " ")}` : "";
  const fee = f?.ratePercent != null ? `${f.ratePercent}%${f.frequency ? ` ${freq[f.frequency] ?? f.frequency.replace(/_/g, " ")}` : ""}${basis}${f.paymentTerms ? `, ${f.paymentTerms}` : ""}` : "None";
  const carry = c.carry?.ratePercent != null && c.carry.ratePercent > 0 ? `${c.carry.ratePercent}%` : c.carry?.applicability ? "Tiered profit sharing" : "None";
  const pref = c.preferredReturnPercent != null && c.preferredReturnPercent > 0 ? `${c.preferredReturnPercent}%` : "None";
  const rows: [string, string][] = [["Investment range", range], ["Management fee", fee], ["Carried interest", carry], ["Preferred return", pref]];
  if (c.carry?.applicability) rows.push(["Profit sharing", c.carry.applicability]);
  return { title: c.name, range, rows };
}
