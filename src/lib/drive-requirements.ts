/** Required fund documents an imported Drive file can be assigned to (client-safe). */
export const DRIVE_REQUIREMENTS = [
  { key: "ein_letter", label: "EIN letter (CP 575 / 147C)", required: true },
  { key: "wire_instructions", label: "Wire instructions", required: true },
  { key: "ppm", label: "PPM / offering memorandum", required: true },
  { key: "operating_agreement", label: "Operating / LP agreement", required: true },
  { key: "subscription_agreement", label: "Subscription agreement", required: true },
  { key: "formation_certificate", label: "Certificate of formation", required: true },
  { key: "lloa", label: "LLOA (letter of authorization)", required: true },
  { key: "investor_information", label: "Investor information", required: true },
  { key: "investor_kyc_form", label: "Investor KYC / questionnaire", required: false },
  { key: "w9", label: "W-9", required: false },
  { key: "side_letter", label: "Side letter", required: false },
  { key: "other", label: "Other", required: false },
] as const;
export type DriveRequirementKey = (typeof DRIVE_REQUIREMENTS)[number]["key"] | "none";
export const requirementLabel = (k: string | null | undefined) => DRIVE_REQUIREMENTS.find((r) => r.key === k)?.label ?? null;
