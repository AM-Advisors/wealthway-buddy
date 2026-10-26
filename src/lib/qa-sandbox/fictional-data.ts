/**
 * Fictional QA sandbox data. Every name, email, fund and bank detail here is
 * invented for click-through testing only. Nothing in this module may ever
 * reference a real client, investor, fund, account number or email domain
 * used by Harmonious.
 */

export const QA_FUND_ID = "qa000000-0000-4000-8000-000000000001";
export const QA_FUND_NAME = "Fablewood Ventures I LP";
export const QA_MANAGER_NAME = "Jordan Vale";
export const QA_MANAGER_EMAIL = "jordan.vale@fablewood.example";

export type QaPerson = {
  personId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  inFund: boolean;
  profiles: { id: string; type: string; legalName: string | null }[];
};

/** Fictional people the investor search can match against. */
export const QA_PEOPLE: QaPerson[] = [
  {
    personId: "qa-person-0001",
    email: "casey.alden@example.com",
    firstName: "Casey",
    lastName: "Alden",
    inFund: true,
    profiles: [{ id: "qa-profile-0001", type: "individual", legalName: null }],
  },
  {
    personId: "qa-person-0002",
    email: "r.mcallister@example.com",
    firstName: "Robin",
    lastName: "McAllister",
    inFund: false,
    profiles: [
      { id: "qa-profile-0002", type: "individual", legalName: null },
      { id: "qa-profile-0003", type: "entity", legalName: "McAllister Family Holdings LLC" },
    ],
  },
  {
    personId: "qa-person-0003",
    email: null,
    firstName: "Sam",
    lastName: "Okafor",
    inFund: false,
    profiles: [{ id: "qa-profile-0004", type: "entity", legalName: "Okafor Capital Partners LP" }],
  },
];

/** Fictional bank details returned by the "fill from connected bank" action. */
export const QA_BANK_PREFILL = {
  bank_name: "First Fictional Bank",
  bank_address: "100 Make Believe Way, Suite 200, Austin, TX 78701",
  account_name: "Fablewood Ventures I LP",
  account_number: "000123456789",
  routing_number: "111000025",
  swift: "",
};

export const QA_WIRE_REQUIRED_FIELDS = ["bank_name", "account_name", "account_number", "routing_number"] as const;
