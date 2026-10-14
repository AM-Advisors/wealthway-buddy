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
  ] },
  { id: "jurisdiction", title: "Jurisdiction", fields: [
    { key: "country", label: "Country", disabled: true, fixed: "United States" },
    { key: "jurisdiction", label: "State", section: fd, required: true },
    { key: "principalAddress", label: "Principal address", section: fd },
  ] },
  { id: "offering", title: "Offering", fields: [
    { key: "rollingCloses", label: "Rolling closes", section: fd, options: [["yes", "Yes"], ["no", "No"]] },
  ] },
  { id: "fees", title: "Fees & Terms", fields: [
    { key: "managementFeePercent", label: "Management fee (% per year)", section: ft, type: "number" },
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
