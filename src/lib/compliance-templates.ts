export type ComplianceTemplateItem = {
  key: string;
  label: string;
  category: string;
  sort_order: number;
};

const CORE: ComplianceTemplateItem[] = [
  { key: "ein_ss4", label: "EIN — Form SS-4 filed and number received", category: "Formation", sort_order: 10 },
  { key: "form_d", label: "Form D — initial notice filing with the SEC", category: "Federal", sort_order: 20 },
  {
    key: "form_d_amendment",
    label: "Form D — annual amendment",
    category: "Federal",
    sort_order: 30,
  },
  {
    key: "blue_sky",
    label: "Blue Sky — state notice filings",
    category: "State",
    sort_order: 40,
  },
  {
    key: "form_8940",
    label: "Form 8940 — miscellaneous determination request",
    category: "Federal",
    sort_order: 50,
  },
  {
    key: "form_8946",
    label: "Form 8946 — PTIN application for a foreign preparer",
    category: "Federal",
    sort_order: 60,
  },
];

const REG_CF: ComplianceTemplateItem[] = [
  { key: "form_c", label: "Form C — offering statement", category: "Federal", sort_order: 70 },
  { key: "form_c_ar", label: "Form C-AR — annual report", category: "Federal", sort_order: 80 },
];

const REG_A: ComplianceTemplateItem[] = [
  { key: "form_1a", label: "Form 1-A — offering circular", category: "Federal", sort_order: 70 },
  { key: "form_1k", label: "Form 1-K — annual report", category: "Federal", sort_order: 80 },
  { key: "form_1sa", label: "Form 1-SA — semi-annual report", category: "Federal", sort_order: 90 },
  { key: "form_1u", label: "Form 1-U — current report", category: "Federal", sort_order: 100 },
];

export function complianceTemplate(regType?: string | null): ComplianceTemplateItem[] {
  const extra = regType === "regcf" ? REG_CF : regType === "rega" || regType === "regaplus" ? REG_A : [];
  return [...CORE, ...extra];
}
