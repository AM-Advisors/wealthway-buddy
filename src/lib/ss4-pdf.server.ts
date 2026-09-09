import { PDFDocument } from "pdf-lib";
import { SS4_FORM_BASE64 } from "./ss4-form-base64.server";

/**
 * Fills the official IRS Form SS-4 (Application for Employer Identification Number).
 * Field names in the government PDF are opaque (f1_2, c1_3[4] ...), so the maps below
 * record which printed line each one belongs to. Verified against a rendered proof.
 */

export interface Ss4Data {
  legal_name?: string;
  trade_name?: string;
  care_of?: string;
  mailing_street?: string;
  mailing_city_state_zip?: string;
  street_address?: string;
  street_city_state_zip?: string;
  county_state?: string;
  responsible_party_name?: string;
  responsible_party_tin?: string;
  is_llc?: boolean;
  llc_members?: string;
  llc_us_organized?: boolean;
  entity_kind?: string;
  entity_detail?: string;
  state_incorporated?: string;
  reason?: string;
  reason_detail?: string;
  date_started?: string;
  closing_month?: string;
  employees_agricultural?: string;
  employees_household?: string;
  employees_other?: string;
  first_wages_date?: string;
  principal_activity?: string;
  principal_activity_other?: string;
  principal_line?: string;
  previous_ein_applied?: boolean;
  previous_ein?: string;
  designee_name?: string;
  designee_phone?: string;
  designee_address?: string;
  designee_fax?: string;
  applicant_name_title?: string;
  applicant_phone?: string;
  applicant_fax?: string;
}

/** Line 9a — Type of entity. */
export const SS4_ENTITY_KINDS = [
  { value: "sole_proprietor", label: "Sole proprietor", box: 0 },
  { value: "partnership", label: "Partnership", box: 2 },
  { value: "corporation", label: "Corporation", box: 4, detail: "Form number to be filed" },
  { value: "personal_service_corp", label: "Personal service corporation", box: 6 },
  { value: "trust", label: "Trust", box: 5, detail: "TIN of grantor" },
  { value: "estate", label: "Estate", box: 1, detail: "SSN of decedent" },
  { value: "other", label: "Other", box: 15, detail: "Describe the entity" },
] as const;

/** Line 10 — Reason for applying. */
export const SS4_REASONS = [
  { value: "started_business", label: "Started a new business", box: 0, detail: "Type of business" },
  { value: "banking_purpose", label: "Banking purpose", box: 8, detail: "Purpose" },
  { value: "hired_employees", label: "Hired employees", box: 3 },
  { value: "compliance", label: "Compliance with IRS withholding regulations", box: 5 },
  { value: "changed_type", label: "Changed type of organization", box: 1, detail: "New type" },
  { value: "purchased_business", label: "Purchased a going business", box: 2 },
  { value: "created_trust", label: "Created a trust", box: 4, detail: "Type of trust" },
  { value: "created_pension", label: "Created a pension plan", box: 6, detail: "Type of plan" },
  { value: "other", label: "Other", box: 7, detail: "Reason" },
] as const;

/** Line 16 — Principal activity. */
export const SS4_ACTIVITIES = [
  { value: "finance_insurance", label: "Finance & insurance", box: 10 },
  { value: "real_estate", label: "Real estate", box: 8 },
  { value: "rental_leasing", label: "Rental & leasing", box: 3 },
  { value: "health_care", label: "Health care & social assistance", box: 0 },
  { value: "construction", label: "Construction", box: 2 },
  { value: "manufacturing", label: "Manufacturing", box: 9 },
  { value: "transportation", label: "Transportation & warehousing", box: 4 },
  { value: "accommodation_food", label: "Accommodation & food service", box: 5 },
  { value: "retail", label: "Retail", box: 7 },
  { value: "wholesale_agent", label: "Wholesale — agent/broker", box: 1 },
  { value: "wholesale_other", label: "Wholesale — other", box: 6 },
  { value: "other", label: "Other", box: 11, detail: true },
] as const;

/** Text fields, keyed by the numeric suffix in the IRS field name (f1_<n>). */
const TEXT_LINES: Array<[number, keyof Ss4Data]> = [
  [2, "legal_name"],
  [3, "trade_name"],
  [4, "care_of"],
  [5, "mailing_street"],
  [6, "mailing_city_state_zip"],
  [7, "street_address"],
  [8, "street_city_state_zip"],
  [9, "county_state"],
  [10, "responsible_party_name"],
  [11, "responsible_party_tin"],
  [12, "llc_members"],
  [21, "state_incorporated"],
  [31, "date_started"],
  [32, "closing_month"],
  [33, "employees_agricultural"],
  [34, "employees_household"],
  [35, "employees_other"],
  [36, "first_wages_date"],
  [37, "principal_activity_other"],
  [38, "principal_line"],
  [39, "previous_ein"],
  [40, "designee_name"],
  [41, "designee_phone"],
  [42, "designee_address"],
  [43, "designee_fax"],
  [44, "applicant_name_title"],
  [45, "applicant_phone"],
  [46, "applicant_fax"],
];

/** Where an entity-kind detail is typed (line 9a). */
const ENTITY_DETAIL_FIELD: Record<string, number> = {
  sole_proprietor: 13,
  estate: 14,
  corporation: 16,
  trust: 17,
  other: 19,
};

/** Where a reason detail is typed (line 10). */
const REASON_DETAIL_FIELD: Record<string, number> = {
  banking_purpose: 24,
  started_business: 25,
  changed_type: 27,
  created_trust: 28,
  created_pension: 29,
  other: 30,
};

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBase64(input: string): Uint8Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function fillSs4Pdf(data: Ss4Data): Promise<Uint8Array> {
  const doc = await PDFDocument.load(decodeBase64(SS4_FORM_BASE64));
  const form = doc.getForm();

  const textByLine = new Map<number, any>();
  const checkByGroup = new Map<string, any>();
  for (const field of form.getFields()) {
    const name = field.getName();
    const text = name.match(/\.f1_(\d+)\[0\]$/);
    if (text) {
      textByLine.set(Number(text[1]), field);
      continue;
    }
    const box = name.match(/\.(c1_\d+)\[(\d+)\]$/);
    if (box) checkByGroup.set(`${box[1]}:${box[2]}`, field);
  }

  const setText = (line: number, value: unknown) => {
    const field = textByLine.get(line);
    const text = clean(value);
    if (!field || !text) return;
    try {
      field.setText(text);
      field.setFontSize(9);
    } catch {
      /* value does not fit the government field; leave it blank for hand entry */
    }
  };

  const check = (group: string, index: number) => {
    const field = checkByGroup.get(`${group}:${index}`);
    try {
      field?.check();
    } catch {
      /* ignore */
    }
  };

  for (const [line, key] of TEXT_LINES) setText(line, data[key]);

  // Line 8a / 8c — limited liability company
  if (data.is_llc) {
    check("c1_1", 0);
    check("c1_2", data.llc_us_organized === false ? 1 : 0);
  } else {
    check("c1_1", 1);
  }

  // Line 9a — type of entity
  const entity = SS4_ENTITY_KINDS.find((k) => k.value === data.entity_kind);
  if (entity) {
    check("c1_3", entity.box);
    const detailLine = ENTITY_DETAIL_FIELD[entity.value];
    if (detailLine) setText(detailLine, data.entity_detail);
  }

  // Line 10 — reason for applying
  const reason = SS4_REASONS.find((r) => r.value === data.reason);
  if (reason) {
    check("c1_4", reason.box);
    const detailLine = REASON_DETAIL_FIELD[reason.value];
    if (detailLine) setText(detailLine, data.reason_detail);
  }

  // Line 16 — principal activity
  const activity = SS4_ACTIVITIES.find((a) => a.value === data.principal_activity);
  if (activity) check("c1_6", activity.box);

  // Line 18 — has the entity applied before
  check("c1_7", data.previous_ein_applied ? 0 : 1);

  form.flatten();
  return doc.save();
}
