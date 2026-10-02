/**
 * Public-site wording for the Harmonious service offering. Mirrors the in-app
 * services list (src/lib/service-packages.ts); update both together.
 */
export const INCLUDED_WITH_EVERY_FUND = [
  ["Capital account tracking", "Every investor's contributions, allocations and balance, kept current."],
  ["Capital account statements", "Statements for each investor, ready to share."],
  ["Wire-instruction management", "Verified fund wire and ACH instructions, with every change approved and logged."],
  ["Deadline tracking", "Form D, Blue Sky, franchise fees and tax dates on one regulatory calendar."],
] as const;

export const INVESTOR_ONBOARDING = {
  title: "Investor Onboarding",
  summary: "Included with every SPV. An add-on for other funds.",
  items: [
    "KYC and KYB",
    "AML and sanctions screening",
    "Beneficial owner screening",
    "W-9 / W-8 collection",
    "Investor records",
    "Investor inquiries",
  ],
} as const;

export const TAX_SERVICE = {
  title: "Tax",
  summary: "One tax offering for the fund.",
  items: [
    "Federal partnership return",
    "State partnership returns",
    "Schedule K-1 coordination",
    "Form 1042-S coordination",
  ],
} as const;

export const FUND_TABS = [
  "To dos", "Fund Details", "Team", "Investors", "Documents", "Banking", "Taxes", "Assets", "Closes", "Regulatory",
] as const;
