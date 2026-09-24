/**
 * Central help-content registry. Components reference a help_key; text lives
 * here (defaults) and can be overridden by published rows in the database.
 * Explains what a term means in Harmonious — never legal, tax or investment advice.
 */
export type HelpEntry = {
  help_key: string;
  title: string;
  short_description: string;
  long_description?: string | undefined;
  learn_more_url?: string | undefined;
  /** Selection needs a professional determination — show the review note. */
  professional?: boolean | undefined;
  version: number;
};

const e = (help_key: string, title: string, short_description: string, long_description?: string, professional?: boolean): HelpEntry => ({
  help_key, title, short_description, long_description, professional, version: 1,
});

export const DEFAULT_HELP: Record<string, HelpEntry> = Object.fromEntries(
  [
    e("vc_fund", "VC Fund", "A pooled fund that invests in early-stage and growth companies.", "In Harmonious, a VC Fund is set up with fund economics such as target size, investment period, management fee and carried interest, and usually draws capital through capital calls."),
    e("pe_fund", "PE Fund", "A pooled fund that acquires or invests in established private companies.", "Private equity funds in Harmonious use similar fund economics to VC funds, plus acquisition or investment strategy details."),
    e("hedge_fund", "Hedge Fund", "A pooled fund that typically trades liquid assets and allows periodic subscriptions and redemptions.", "Hedge funds in Harmonious track NAV, subscription and redemption terms, liquidity terms and performance allocation."),
    e("spv", "SPV", "A special purpose vehicle generally created for a specific investment or transaction.", "An SPV pools investors into one vehicle for a single deal. Its setup in Harmonious is shorter and focused on that transaction."),
    e("gp", "GP", "The general partner — the entity that manages the fund and makes its decisions."),
    e("management_company", "Management Company", "The company that employs the investment team and usually receives the management fee."),
    e("fund_manager", "Fund Manager", "A person with authority to manage a specific fund in Harmonious. Access is granted fund by fund."),
    e("investment_profile", "Investment Profile", "The legal party that invests — for example you individually, jointly, or through an LLC, trust or IRA.", "Your login account is never the investing party. Each Investment Profile keeps its own identity, tax and signing details."),
    e("506b", "506(b)", "A Regulation D offering exemption that generally prohibits general solicitation.", undefined, true),
    e("506c", "506(c)", "A Regulation D offering exemption that permits general solicitation when all investors are verified accredited investors.", undefined, true),
    e("accredited_investor", "Accredited Investor", "An investor who meets SEC income, net-worth or professional criteria.", undefined, true),
    e("qualified_purchaser", "Qualified Purchaser", "A higher investor standard, generally based on investments owned, used by certain fund structures.", undefined, true),
    e("qualified_client", "Qualified Client", "An SEC standard that determines whether an adviser may charge performance-based fees to a client.", undefined, true),
    e("carried_interest", "Carried Interest", "The manager's share of fund profits, usually after investors receive their capital back."),
    e("promote", "Promote", "The sponsor's share of profits in a real estate deal above agreed return thresholds."),
    e("management_fee", "Management Fee", "An annual fee paid to the manager, usually a percentage of committed or invested capital."),
    e("capital_call", "Capital Call", "A request for investors to contribute part of their commitment to the fund."),
    e("nav", "NAV", "Net asset value — the fund's assets minus liabilities, often calculated per unit or share."),
    e("subscription", "Subscription", "An investor's agreement to invest in the fund, and the documents used to do it."),
    e("redemption", "Redemption", "An investor withdrawing some or all of their investment, under the fund's liquidity terms."),
    e("kyc", "KYC", "Know Your Customer — confirming the identity of a person."),
    e("kyb", "KYB", "Know Your Business — confirming the identity and ownership of an entity."),
    e("aml", "AML", "Anti-money-laundering screening against sanctions and watch lists."),
    e("beneficial_owner", "Beneficial Owner", "A person who ultimately owns or controls an entity."),
    e("form_d", "Form D", "A notice filed with the SEC after the first sale in a Regulation D offering."),
    e("blue_sky", "Blue Sky", "State securities notice filings that may be required where investors live."),
    e("sow", "SOW", "Statement of Work — describes the specific services, fees and funds for an engagement."),
    e("msa", "MSA", "Master Service Agreement — the general terms of your relationship with Harmonious."),
    e("applicable_services", "Applicable Services", "The Harmonious services that apply to this fund or entity. They are confirmed in a SOW before work starts."),
    e("pricing_basis", "Pricing basis", "How a service is priced — for example fixed, per investor, per event or tiered by capital raised."),
    e("tax_forms", "Tax forms", "Forms such as W-9 or W-8 that record an investor's tax status."),
    e("authorized_shares", "Authorized Shares", "The maximum number of shares the company's charter allows it to issue."),
    e("outstanding_shares", "Issued & Outstanding", "Shares actually issued and currently held, from finalized transactions. Options, warrants, SAFEs and notes are not included."),
    e("fully_diluted", "Fully Diluted", "Outstanding shares plus every option, warrant, SAFE, note or other instrument that could become shares."),
    e("security_class", "Security Class", "A category of security, such as Common or Series A Preferred, with its own rights."),
    e("preferred_stock", "Preferred Stock", "Shares with rights ahead of common stock, such as a liquidation preference.", undefined, true),
    e("common_stock", "Common Stock", "The basic class of ownership, usually held by founders and employees."),
    e("option", "Option", "A right to buy shares later at a fixed exercise price, often subject to vesting."),
    e("warrant", "Warrant", "A right, usually given to an investor or lender, to buy shares at a set price."),
    e("safe", "SAFE", "A Simple Agreement for Future Equity — converts into shares at a later financing.", undefined, true),
    e("convertible_note", "Convertible Note", "A loan that can convert into shares, usually at a later financing.", undefined, true),
    e("stakeholder", "Stakeholder", "A person or entity recorded on the cap table. Being a stakeholder does not mean owning anything — ownership comes only from issued securities."),
    e("issuance", "Issuance", "The company creating new securities and giving them to a stakeholder."),
    e("transfer", "Transfer", "Securities moving from one stakeholder to another. Total ownership does not change."),
    e("exercise", "Exercise", "An option or warrant holder buying the shares their instrument allows."),
    e("conversion", "Conversion", "One security becoming another — for example a SAFE or preferred share turning into shares."),
    e("reversal", "Reversal", "A new entry that cancels the effect of a finalized transaction. The original stays in the ledger."),
    e("as_of_date", "As-of Date", "Shows ownership using only finalized transactions effective on or before that date."),
  ].map((x) => [x.help_key, x]),
);

export function resolveHelp(key: string, published: readonly Partial<HelpEntry>[] = []): HelpEntry | null {
  const db = published.find((p) => p.help_key === key);
  const base = DEFAULT_HELP[key];
  if (!db && !base) return null;
  return { ...(base ?? { help_key: key, title: key, short_description: "", version: 1 }), ...(db ?? {}) } as HelpEntry;
}

/** Advice guard used by tests: help text must not recommend choices. */
export const ADVICE_PATTERN = /\b(you should (choose|select|pick|use)|we recommend|best option|you must elect)\b/i;
