/** Client-safe field list shared by the migration screen and the server functions. */
export const MIGRATION_FIELDS = [
  { key: "holderName", label: "Shareholder name", required: true },
  { key: "holderEmail", label: "Email" },
  { key: "holderType", label: "Holder type" },
  { key: "securityType", label: "Security type", required: true },
  { key: "securityClass", label: "Share class" },
  { key: "label", label: "Certificate / label" },
  { key: "quantity", label: "Quantity", required: true },
  { key: "issueDate", label: "Issue date" },
  { key: "pricePerShare", label: "Price per share" },
  { key: "exercisePrice", label: "Exercise price" },
  { key: "vestingStart", label: "Vesting start" },
  { key: "cliffMonths", label: "Cliff (months)" },
  { key: "durationMonths", label: "Vesting length (months)" },
  { key: "frequency", label: "Vesting frequency" },
  { key: "authorizedShares", label: "Authorised shares for this class" },
  { key: "roundName", label: "Funding round / financing" },
  { key: "roundDate", label: "Round date" },
  { key: "roundPricePerShare", label: "Round price per share" },
  { key: "investmentAmount", label: "Amount invested" },
] as const;

export type MigrationFieldKey = (typeof MIGRATION_FIELDS)[number]["key"];
