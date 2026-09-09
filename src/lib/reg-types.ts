export const REG_TYPES = [
  {
    value: "506b",
    short: "Reg D 506(b)",
    label: "Reg D 506(b) — private, no general solicitation",
    description: "Private placement. No advertising; investors self-certify accreditation.",
  },
  {
    value: "506c",
    short: "Reg D 506(c)",
    label: "Reg D 506(c) — publicly marketed",
    description: "You may advertise, but every investor's accreditation must be verified.",
  },
  {
    value: "regcf",
    short: "Reg CF",
    label: "Reg CF — crowdfunding",
    description: "Regulation Crowdfunding offering filed on Form C through a funding portal.",
  },
  {
    value: "rega",
    short: "Reg A Tier 1",
    label: "Reg A Tier 1",
    description: "Regulation A offering up to $20M, with state review.",
  },
  {
    value: "regaplus",
    short: "Reg A+ Tier 2",
    label: "Reg A+ Tier 2",
    description: "Regulation A+ offering up to $75M, with ongoing SEC reporting.",
  },
] as const;

export type RegTypeValue = (typeof REG_TYPES)[number]["value"];

export const REG_TYPE_VALUES = REG_TYPES.map((r) => r.value) as unknown as [
  RegTypeValue,
  ...RegTypeValue[],
];

export function regTypeEntry(value?: string | null) {
  return REG_TYPES.find((r) => r.value === value) ?? REG_TYPES[0];
}

/** Short badge label, e.g. "Reg D 506(c)". */
export function regTypeLabel(value?: string | null) {
  return regTypeEntry(value).short;
}

/** Long label used in dropdowns and legal copy. */
export function regTypeLongLabel(value?: string | null) {
  return regTypeEntry(value).label;
}

export function regTypeDescription(value?: string | null) {
  return regTypeEntry(value).description;
}

/** Only 506(c) requires third-party verified accreditation. */
export function requiresVerifiedAccreditation(value?: string | null) {
  return value === "506c";
}

/** Only 506(b) asks how the investor knows the fund. */
export function requiresPreExistingRelationship(value?: string | null) {
  return (value ?? "506b") === "506b";
}
