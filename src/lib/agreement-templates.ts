/**
 * Standard Harmonious contract language.
 *
 * The Statement of Work body is assembled from these templates when a new fund
 * or SPV is requested, and the Master Services Agreement is published from the
 * section list below. Clients never edit this language directly — they approve
 * a section or raise a change request against it.
 */

export const HARMONIOUS_LEGAL_NAME = "Harmonious Capital Administration";

export type SowSectionKey =
  | "fund_information"
  | "services"
  | "pricing"
  | "responsibilities"
  | "terms"
  | "msa";

export const SOW_SECTION_ORDER: { key: SowSectionKey; no: string; title: string }[] = [
  { key: "fund_information", no: "1", title: "Fund information" },
  { key: "services", no: "2", title: "Services" },
  { key: "pricing", no: "3", title: "Pricing" },
  { key: "responsibilities", no: "4", title: "Responsibilities" },
  { key: "terms", no: "5", title: "Terms" },
  { key: "msa", no: "6", title: "Governing master services agreement" },
];

export type FundFacts = {
  clientName: string;
  fundName: string;
  entityType?: string | null | undefined;
  jurisdiction?: string | null | undefined;
  fundType?: string | null | undefined;
  targetRaiseCents?: number | null | undefined;
  expectedInvestors?: number | null | undefined;
  expectedInvestments?: string | null | undefined;
  expectedLaunchDate?: string | null | undefined;
  contactName?: string | null | undefined;
  contactEmail?: string | null | undefined;
  effectiveDate: string;
  msaVersion: string;
  pricingVersion: string;
  services: { label: string; description?: string | null }[];
  noticeDays: number;
};

const money = (cents?: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function buildSowSections(facts: FundFacts) {
  const serviceList = facts.services.length
    ? facts.services.map((s) => `• ${s.label}${s.description ? ` — ${s.description}` : ""}`).join("\n")
    : "• Fund administration";

  const bodies: Record<SowSectionKey, string> = {
    fund_information: [
      `This Statement of Work is entered into between ${facts.clientName} (the "Client") and ${HARMONIOUS_LEGAL_NAME} ("Harmonious") and is governed by the Master Services Agreement between the parties, version ${facts.msaVersion}.`,
      "",
      `Fund or vehicle: ${facts.fundName}`,
      `Entity type: ${facts.entityType || "To be confirmed"}`,
      `Jurisdiction of formation: ${facts.jurisdiction || "To be confirmed"}`,
      `Vehicle type: ${facts.fundType || "To be confirmed"}`,
      `Target raise: ${money(facts.targetRaiseCents)}`,
      `Expected investors: ${facts.expectedInvestors ?? "To be confirmed"}`,
      `Expected investments: ${facts.expectedInvestments || "To be confirmed"}`,
      `Expected launch: ${facts.expectedLaunchDate || "To be confirmed"}`,
      `Primary contact: ${facts.contactName || "To be confirmed"}${facts.contactEmail ? ` (${facts.contactEmail})` : ""}`,
      `Effective date: ${facts.effectiveDate}`,
    ].join("\n"),

    services: [
      "Harmonious will provide the following administrative, technology, onboarding, reporting, payment-facilitation, recordkeeping and compliance-support services for the vehicle named above:",
      "",
      serviceList,
      "",
      "Harmonious acts solely as an administrative and technology service provider. Nothing in this Statement of Work appoints Harmonious as an investment adviser, broker-dealer, placement agent, custodian, transfer agent, escrow agent, trustee, general partner, fund manager, fiduciary, compliance officer, valuation agent, auditor, accountant, tax preparer or legal counsel, unless a service to that effect is expressly listed above.",
      "",
      "Services not listed above are not included in the Client's active scope and may be requested in writing through the portal.",
    ].join("\n"),

    pricing: [
      `Fees for this engagement are set from the Harmonious ${facts.pricingVersion} pricing schedule, as itemised in the pricing summary attached to and forming part of this Statement of Work.`,
      "",
      "The fees applicable to this engagement are fixed at execution. A later change to the Harmonious published pricing schedule does not alter the fees for this vehicle; any change to these fees must be agreed in writing by both parties through an amendment.",
      "",
      "Pass-through amounts (including state, Blue Sky, regulatory and third-party provider charges) are billed at cost and are additional to the fees shown.",
      "",
      "Invoices are issued through the Harmonious portal and are due within fifteen (15) days of issue unless stated otherwise in the agreed changes to this Statement of Work.",
    ].join("\n"),

    responsibilities: [
      "Client responsibilities:",
      "• Provide complete and accurate fund, entity, investor and banking information, and keep it current.",
      "• Appoint and instruct its own legal counsel, tax preparer, auditor and any other professional advisers.",
      "• Review and approve all filings, statements, reports and payment instructions prepared with Harmonious support before they are relied upon or submitted.",
      "• Issue written instruction for any movement of money; Harmonious facilitates payments against Client instruction and does not hold, custody or escrow Client or investor funds.",
      "",
      "Harmonious responsibilities:",
      "• Perform the listed services with reasonable care and in accordance with the Master Services Agreement.",
      "• Maintain the books, records and audit trail for the services performed.",
      "• Coordinate with the Client's named third-party providers where a service depends on them, without assuming their professional role.",
      "• Notify the Client of items requiring its decision, approval or signature.",
    ].join("\n"),

    terms: [
      `Term: this Statement of Work begins on ${facts.effectiveDate} and continues until terminated in accordance with the Master Services Agreement.`,
      "",
      `Termination: either party may terminate this Statement of Work on ${facts.noticeDays} days' written notice. Fees accrued through the termination date, and reasonable wind-down and record-transfer costs, remain payable.`,
      "",
      "Records: Harmonious will retain the records created under this Statement of Work in accordance with its published retention schedule and will provide an export of Client data on request following termination.",
      "",
      "Order of precedence: the Master Services Agreement governs. Where this Statement of Work conflicts with it, this Statement of Work controls for this engagement only, and only to the extent of the conflict.",
      "",
      "Amendment: this Statement of Work may be amended only by a written amendment executed by both parties.",
    ].join("\n"),

    msa: [
      `This Statement of Work is issued under, and incorporates, the Master Services Agreement between ${facts.clientName} and ${HARMONIOUS_LEGAL_NAME}, version ${facts.msaVersion}.`,
      "",
      "The Master Services Agreement governs the overall relationship, including confidentiality, data and security, third-party providers, representations, indemnification, limitation of liability, term and termination, dispute resolution and general terms.",
      "",
      "Executing this Statement of Work does not require the Client to re-execute the Master Services Agreement. A new Master Services Agreement is executed only when Harmonious issues a new version.",
    ].join("\n"),
  };

  return SOW_SECTION_ORDER.map((s, index) => ({
    key: s.key,
    section_no: s.no,
    title: s.title,
    body: bodies[s.key],
    sort_order: index,
  }));
}

/** The twelve standard Master Services Agreement sections. */
export const MSA_SECTIONS: { no: string; title: string; body: string }[] = [
  {
    no: "1",
    title: "Services framework",
    body: `${HARMONIOUS_LEGAL_NAME} provides administrative, technology, onboarding, reporting, payment-facilitation, recordkeeping, compliance-support and regulatory-support services. Each engagement is described in a Statement of Work executed under this Agreement. Only services expressly listed in an active Statement of Work are within scope. Harmonious does not act as an investment adviser, broker-dealer, placement agent, custodian, transfer agent, escrow agent, trustee, general partner, fund manager, fiduciary, compliance officer, valuation agent, auditor, accountant, tax preparer or legal counsel unless a Statement of Work expressly says so.`,
  },
  {
    no: "2",
    title: "Client responsibilities",
    body: `The Client is responsible for the accuracy and completeness of the information it provides, for appointing and instructing its own professional advisers, for reviewing and approving all filings, statements and payment instructions before reliance or submission, and for issuing written instruction for any movement of money.`,
  },
  {
    no: "3",
    title: "Fees and payment",
    body: `Fees are set out in the applicable Statement of Work and its attached pricing schedule. Fees for an executed engagement are fixed and are not changed by a later revision to the Harmonious published pricing schedule. Invoices are due within fifteen (15) days of issue. Pass-through costs are billed at cost. Late amounts may accrue interest at the lower of 1.5% per month or the maximum permitted by law.`,
  },
  {
    no: "4",
    title: "Confidentiality",
    body: `Each party will keep the other's confidential information in confidence, use it only to perform this Agreement, and protect it with no less than reasonable care. Confidentiality obligations survive termination for three (3) years, and indefinitely for trade secrets and investor personal data.`,
  },
  {
    no: "5",
    title: "Data and security",
    body: `Harmonious maintains administrative, technical and physical safeguards appropriate to the sensitivity of the data it processes, restricts access on a need-to-know basis, encrypts data in transit and at rest, logs access to investor records, and will notify the Client without undue delay of any confirmed security incident affecting Client data. The Client remains the controller of its investor data.`,
  },
  {
    no: "6",
    title: "Third-party providers",
    body: `Certain services depend on third parties, including banks, verification vendors, registered agents, regulators, auditors and tax preparers. Harmonious coordinates with those providers but does not assume their professional role, guarantee their timing, or accept liability for their acts or omissions. Where the Client names a provider, the Client is responsible for that relationship.`,
  },
  {
    no: "7",
    title: "Representations",
    body: `Each party represents that it is duly organised and in good standing, that it has authority to enter into this Agreement, and that its performance will comply with applicable law. The Client represents that its offering is conducted in reliance on a valid exemption and that it has obtained its own legal and tax advice.`,
  },
  {
    no: "8",
    title: "Indemnification",
    body: `The Client will indemnify Harmonious against claims arising from the Client's offering, its instructions, its investor relationships, or information it supplied. Harmonious will indemnify the Client against claims arising from Harmonious's gross negligence, wilful misconduct or breach of its confidentiality obligations.`,
  },
  {
    no: "9",
    title: "Limitation of liability",
    body: `Neither party is liable for indirect, incidental, special, consequential or punitive damages. Except for confidentiality breaches, indemnity obligations, and gross negligence or wilful misconduct, each party's aggregate liability is limited to the fees paid under the applicable Statement of Work in the twelve (12) months preceding the claim.`,
  },
  {
    no: "10",
    title: "Term and termination",
    body: `This Agreement continues until terminated. Either party may terminate this Agreement or any Statement of Work on the notice period stated in that Statement of Work, or sixty (60) days where none is stated. Termination does not affect accrued fees, wind-down costs, or obligations that by their nature survive. On termination Harmonious will provide an export of Client data and retain records per its retention schedule.`,
  },
  {
    no: "11",
    title: "Dispute resolution",
    body: `The parties will first attempt to resolve any dispute through good-faith discussion between senior representatives for thirty (30) days. Unresolved disputes are settled by binding arbitration before a single arbitrator under the Commercial Arbitration Rules of the American Arbitration Association. Either party may seek injunctive relief in court to protect confidential information.`,
  },
  {
    no: "12",
    title: "General terms",
    body: `This Agreement, together with each Statement of Work, is the entire agreement between the parties. Amendments must be in writing and signed by both parties. Neither party may assign this Agreement without consent, except to a successor in interest. If a provision is unenforceable, the remainder stays in force. Notices are given through the Harmonious portal and to the contact addresses on record.`,
  },
];
