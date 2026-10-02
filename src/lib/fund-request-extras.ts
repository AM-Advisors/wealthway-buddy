/**
 * Pure reference data for the client "Launch a new fund or SPV" request:
 * state formation filing guide, asset information fields and partner banks.
 * Filing links/fees are a Harmonious-maintained guide; clients confirm on the state site.
 */

export type FormationGuide = { office: string; url: string; filings: { entity: string; form: string; fee: string }[]; note?: string };

export const FORMATION_GUIDES: Record<string, FormationGuide> = {
  Delaware: {
    office: "Delaware Division of Corporations",
    url: "https://corp.delaware.gov/corpforms/",
    filings: [
      { entity: "LLC", form: "Certificate of Formation (LLC)", fee: "$110" },
      { entity: "Series LLC", form: "Certificate of Formation with series provisions (LLC)", fee: "$110" },
      { entity: "LP", form: "Certificate of Limited Partnership", fee: "$200" },
      { entity: "GP", form: "Statement of Partnership Existence (optional)", fee: "$200" },
    ],
  },
  Wyoming: {
    office: "Wyoming Secretary of State — Business Division",
    url: "https://sos.wyo.gov/Business/Default.aspx",
    filings: [
      { entity: "LLC", form: "Articles of Organization (LLC)", fee: "$100" },
      { entity: "Series LLC", form: "Articles of Organization (LLC) with series provisions", fee: "$100" },
      { entity: "LP", form: "Certificate of Limited Partnership", fee: "$100" },
      { entity: "GP", form: "Statement of Partnership Authority (optional)", fee: "Varies" },
    ],
  },
  Nevada: {
    office: "Nevada Secretary of State — SilverFlume",
    url: "https://www.nvsilverflume.gov/",
    filings: [
      { entity: "LLC", form: "Articles of Organization (LLC) + Initial List + Business License", fee: "$75 + list/license fees" },
      { entity: "Series LLC", form: "Articles of Organization (Series LLC)", fee: "$75 + list/license fees" },
      { entity: "LP", form: "Certificate of Limited Partnership", fee: "$75 + list/license fees" },
      { entity: "GP", form: "No state formation filing required", fee: "—" },
    ],
  },
  Texas: {
    office: "Texas Secretary of State — SOSDirect",
    url: "https://www.sos.state.tx.us/corp/forms_boc.shtml",
    filings: [
      { entity: "LLC", form: "Form 205 — Certificate of Formation (LLC)", fee: "$300" },
      { entity: "Series LLC", form: "Form 205 — Certificate of Formation (LLC) with series provisions", fee: "$300" },
      { entity: "LP", form: "Form 207 — Certificate of Formation (LP)", fee: "$750" },
      { entity: "GP", form: "No state formation filing required (assumed name may apply)", fee: "—" },
    ],
  },
  "New York": {
    office: "New York Department of State — Division of Corporations",
    url: "https://dos.ny.gov/forms-and-fees-division-corporations",
    filings: [
      { entity: "LLC", form: "Articles of Organization (LLC) — publication required", fee: "$200 + publication" },
      { entity: "Series LLC", form: "New York does not form series LLCs — choose another state", fee: "—" },
      { entity: "LP", form: "Certificate of Limited Partnership — publication required", fee: "$200 + publication" },
      { entity: "GP", form: "Certificate of Assumed Name if not using partners' names", fee: "Varies" },
    ],
  },
};

export const formationGuideFor = (jurisdiction: string, entity: string) => {
  const g = FORMATION_GUIDES[jurisdiction];
  if (!g) return null;
  return { ...g, filing: g.filings.find((f) => f.entity === entity) ?? null };
};

export const ASSET_TYPES = ["Business / startup", "Real estate", "Fund interest", "Secondary shares", "Debt / credit", "Other"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_FIELDS: Record<AssetType, { key: string; label: string; required?: boolean; long?: boolean }[]> = {
  "Business / startup": [
    { key: "legal_name", label: "Company legal name", required: true },
    { key: "ein", label: "Company EIN" },
    { key: "website", label: "Website" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "social", label: "Other social media (X, Instagram, etc.)" },
    { key: "round", label: "Round / security (e.g. Seed SAFE, Series A preferred)" },
    { key: "valuation", label: "Valuation or cap" },
    { key: "cap_table_link", label: "Cap table link (Carta, Pulley, etc.)" },
  ],
  "Real estate": [
    { key: "property_name", label: "Property name", required: true },
    { key: "address", label: "Property address", required: true },
    { key: "property_type", label: "Property type (multifamily, industrial, etc.)" },
    { key: "purchase_price", label: "Purchase price" },
    { key: "sponsor", label: "Sponsor / operator" },
  ],
  "Fund interest": [
    { key: "fund_name", label: "Underlying fund name", required: true },
    { key: "manager", label: "Underlying fund manager" },
    { key: "commitment", label: "Commitment size" },
    { key: "website", label: "Website" },
  ],
  "Secondary shares": [
    { key: "legal_name", label: "Company legal name", required: true },
    { key: "seller", label: "Seller" },
    { key: "share_class", label: "Share class" },
    { key: "price_per_share", label: "Price per share" },
    { key: "website", label: "Website" },
  ],
  "Debt / credit": [
    { key: "borrower", label: "Borrower legal name", required: true },
    { key: "facility", label: "Facility / note type" },
    { key: "principal", label: "Principal amount" },
    { key: "rate", label: "Interest rate" },
    { key: "maturity", label: "Maturity" },
  ],
  Other: [
    { key: "description", label: "Describe the asset", required: true, long: true },
  ],
};

export const ASSET_DOC_KINDS = ["Cap table", "Purchase agreement", "Term sheet", "Pitch deck", "Other asset document"];

export const PARTNER_BANKS = [
  { value: "mercury", label: "Mercury" },
  { value: "texas_capital", label: "Texas Capital Bank" },
  { value: "customers", label: "Customers Bank" },
] as const;
export type PartnerBank = (typeof PARTNER_BANKS)[number]["value"];
export const bankLabel = (v: string) => PARTNER_BANKS.find((b) => b.value === v)?.label ?? v;
