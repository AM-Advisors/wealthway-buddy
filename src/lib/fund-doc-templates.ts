/**
 * Starter document templates for the fund Documents tab. Draft wording only,
 * always marked for counsel review. Generating a template saves an unsigned
 * draft; it never sends, signs or files anything.
 */
export const STARTER_NOTICE = "Starter template - have counsel review before use.";

export type TemplateField = { key: string; label: string; placeholder?: string };
export type DocTemplate = { key: string; title: string; category: "fund_document" | "side_letter" | "agreement"; fields: TemplateField[]; body: string };

const common: TemplateField[] = [
  { key: "fund", label: "Fund legal name" },
  { key: "manager", label: "Manager / GP name" },
  { key: "date", label: "Effective date", placeholder: "2026-01-01" },
];
const investor: TemplateField = { key: "investor", label: "Investor / counterparty name" };

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    key: "fund_summary", title: "Fund terms summary", category: "fund_document",
    fields: [...common, { key: "target", label: "Target raise" }, { key: "minimum", label: "Minimum investment" }, { key: "mgmt", label: "Management fee" }, { key: "carry", label: "Carried interest" }],
    body: `FUND TERMS SUMMARY\n\nFund: {{fund}}\nManager: {{manager}}\nDate: {{date}}\n\nTarget raise: {{target}}\nMinimum investment: {{minimum}}\nManagement fee: {{mgmt}}\nCarried interest: {{carry}}\n\nThis summary is for discussion only. The fund's governing documents control.`,
  },
  {
    key: "sl_management_fee", title: "Side letter - management fee", category: "side_letter",
    fields: [...common, investor, { key: "rate", label: "Agreed management fee rate", placeholder: "1.5%" }],
    body: `SIDE LETTER - MANAGEMENT FEE\n\nDate: {{date}}\nBetween {{fund}} (acting through {{manager}}) and {{investor}}.\n\nNotwithstanding the fund's governing documents, the management fee charged to {{investor}} will be {{rate}} per year, calculated on the same basis as all other investors.\n\nAll other terms of the governing documents remain unchanged.`,
  },
  {
    key: "sl_carry", title: "Side letter - carried interest", category: "side_letter",
    fields: [...common, investor, { key: "rate", label: "Agreed carried interest", placeholder: "15%" }],
    body: `SIDE LETTER - CARRIED INTEREST\n\nDate: {{date}}\nBetween {{fund}} (acting through {{manager}}) and {{investor}}.\n\nThe carried interest applied to distributions to {{investor}} will be {{rate}}.\n\nAll other terms of the governing documents remain unchanged.`,
  },
  {
    key: "sl_minimum", title: "Side letter - minimum investment", category: "side_letter",
    fields: [...common, investor, { key: "minimum", label: "Agreed minimum", placeholder: "$25,000" }],
    body: `SIDE LETTER - MINIMUM INVESTMENT\n\nDate: {{date}}\nBetween {{fund}} (acting through {{manager}}) and {{investor}}.\n\nThe manager agrees to accept a capital commitment from {{investor}} of not less than {{minimum}}, notwithstanding the stated minimum.\n\nAll other terms of the governing documents remain unchanged.`,
  },
  {
    key: "sl_information_rights", title: "Side letter - information rights", category: "side_letter",
    fields: [...common, investor, { key: "rights", label: "Information to be provided", placeholder: "Quarterly financial statements within 60 days of quarter end" }],
    body: `SIDE LETTER - INFORMATION RIGHTS\n\nDate: {{date}}\nBetween {{fund}} (acting through {{manager}}) and {{investor}}.\n\nThe manager will provide {{investor}} with: {{rights}}.\n\n{{investor}} will keep all information received confidential. All other terms of the governing documents remain unchanged.`,
  },
  {
    key: "nda", title: "Non-disclosure agreement", category: "agreement",
    fields: [...common, investor, { key: "term", label: "Confidentiality period", placeholder: "2 years" }],
    body: `MUTUAL NON-DISCLOSURE AGREEMENT\n\nDate: {{date}}\nParties: {{fund}} (through {{manager}}) and {{investor}}.\n\n1. Each party may share confidential information to evaluate a possible investment.\n2. The receiving party will use it only for that purpose and protect it with reasonable care.\n3. Information that is public, already known, or independently developed is excluded.\n4. These obligations last {{term}} from the date above.\n5. On request, confidential information will be returned or destroyed.`,
  },
  {
    key: "non_compete", title: "Non-compete agreement", category: "agreement",
    fields: [...common, investor, { key: "term", label: "Restricted period", placeholder: "12 months" }, { key: "area", label: "Restricted area / activity" }],
    body: `NON-COMPETE AGREEMENT\n\nDate: {{date}}\nParties: {{fund}} (through {{manager}}) and {{investor}}.\n\nFor {{term}} after the date above, {{investor}} agrees not to engage in: {{area}}.\n\nEnforceability of non-compete terms varies by state and some states prohibit them. Counsel must confirm this agreement is permitted before use.`,
  },
];

export function renderTemplate(key: string, values: Record<string, string>) {
  const t = DOC_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error("Unknown template.");
  const body = t.body.replace(/\{\{(\w+)\}\}/g, (_, k) => (values[k]?.trim() ? values[k]!.trim() : `[${k}]`));
  return { title: t.title, category: t.category, body: `${STARTER_NOTICE}\n\n${body}` };
}

export const TEAM_ROLES = [
  { value: "gp", label: "Manager / GP" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Team member" },
  { value: "counsel", label: "Counsel" },
  { value: "auditor", label: "Auditor" },
  { value: "tax_preparer", label: "Tax preparer" },
  { value: "accountant", label: "Accountant" },
] as const;

export const TEAM_PERMISSIONS = [
  { value: "authorized_signatory", label: "Authorized signatory" },
  { value: "view", label: "View fund" },
  { value: "edit", label: "Edit fund details" },
  { value: "documents", label: "Manage documents" },
  { value: "banking", label: "Banking & books" },
  { value: "investors", label: "Manage investors" },
] as const;

export const LEDGER_CATEGORIES = [
  "Capital contribution", "Investment purchase", "Management fee", "Legal fees", "Accounting & tax", "Bank fees",
  "Formation & filing", "Broker/Dealer fee", "Distribution", "Interest income", "Other income", "Other expense",
];
