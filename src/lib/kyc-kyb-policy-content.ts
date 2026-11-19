import type { LegalDocument } from "@/lib/legal-content";

/**
 * Public KYC, KYB & AML policy and procedures (/kyc-aml). Public copy: every
 * line must describe a control the product actually runs. Never name outside
 * providers, never claim continuous monitoring, fixed rescreening schedules,
 * automatic deletion or that every check applies to every fund.
 */
export const KYC_KYB_POLICY: LegalDocument = {
  title: "KYC, KYB & AML Policy and Procedures",
  updated: "November 19, 2026",
  effectiveDate: "2026-11-19",
  version: 1,
  summary:
    "How Harmonious verifies the people and organizations that use our platform and invest in the funds we administer: identity checks for individuals (KYC), checks for companies and trusts (KYB), and anti-money-laundering screening (AML).",
  blocks: [
    {
      heading: "Purpose and scope",
      paragraphs: [
        "Harmonious Capital Administration LLC provides fund administration, SPV and investor onboarding services. As part of those services we help the funds we administer know who their investors are, and we keep a record of how each check was done.",
        "This policy applies to everyone who signs in to Harmonious, to each investing party (an individual, joint account, company or trust), and to the people who own or control an investing company or trust. The exact checks an investment needs follow the fund's offering settings, which the fund manager confirms.",
        "Each fund manager remains responsible for the fund's own legal obligations and for deciding whether to admit an investor. Harmonious prepares, runs and records the checks described here; it does not give legal advice.",
      ],
    },
    {
      heading: "Identity verification for individuals (KYC)",
      paragraphs: [
        "Everyone who accesses the Harmonious platform must complete KYC on themselves. This includes fund managers, client team members, signers, preparers, advisors and anyone else acting for an investor or a fund. Access stays closed until their own identity check is complete.",
        "Every investor must also complete KYC on themselves. A person's own check never stands in for anyone else, and someone acting for an investor cannot complete the investor's check for them.",
        "For each identity check we ask for:",
      ],
      bullets: [
        "Full legal name, date of birth, citizenship and residential address.",
        "A Social Security number or other tax identification number. It is stored encrypted and screens show only the last four digits.",
        "A current government-issued photo ID.",
        "A live selfie, matched against the photo on the ID.",
        "For joint accounts, the same details for the second account holder.",
      ],
    },
    {
      paragraphs: [
        "Identity checks are carried out by an independent verification service. The result is recorded as approved, under review, declined or pending. If a check cannot be completed or an ID has expired, the person is asked to try again with a clear, current ID.",
        "A sign-in account identifies the person using the portal. It is kept separate from the investing party, so a person can sign in and act for a company, trust or joint account without becoming that investor.",
      ],
    },
    {
      heading: "Verification of companies and trusts (KYB)",
      paragraphs: ["When a company, partnership, LLC or trust invests, we verify the organization and the people behind it:"],
      bullets: [
        "Legal name, place and date of formation, and its tax identification number (EIN).",
        "Formation documents, or the trust agreement for a trust.",
        "Each beneficial owner who owns 25% or more.",
        "The person who controls the organization, and each authorized signer.",
        "For trusts, the trustees and the grantor.",
      ],
    },
    {
      paragraphs: [
        "Each owner, controller and signer we record completes their own individual identity check. An organization's verification is not complete while a required person is missing or not yet verified.",
        "For foundations and other nonprofit entities, we review governing documents, the EIN and the recorded control persons instead of ownership percentages.",
      ],
    },
    {
      heading: "Anti-money-laundering screening (AML)",
      paragraphs: [
        "Individuals and organizations are screened against sanctions lists (including the U.S. Treasury OFAC lists), politically exposed person (PEP) lists, watchlists and adverse media.",
      ],
      bullets: [
        "A possible match is never cleared automatically. A trained reviewer compares the details and records a written explanation before it can be cleared.",
        "A confirmed or high-risk match cannot be approved through routine review.",
        "Screening details are kept private to authorized Harmonious reviewers. Fund managers see the status of a check, not the underlying screening details.",
      ],
    },
    {
      heading: "Source of funds, source of wealth and risk rating",
      paragraphs: [
        "Where it applies, we may ask where the money for an investment comes from (source of funds) and how the investor built their wealth (source of wealth). Authorized reviewers can record a low, medium or high risk rating with a written reason, along with a date for the next review: within 36 months for low, 24 months for medium and 12 months for high risk.",
      ],
    },
    {
      heading: "When checks are required",
      bullets: [
        "Sign-in: a person verifies their identity before they can use the portal. While a qualifying check is still under review, limited setup may be allowed.",
        "Signing: subscription documents can be signed only when the required checks allow it. A declined check or an unresolved match stops signing.",
        "Funding and admission: funding, banking and money actions stay blocked until required verification is complete. The fund manager decides on admission.",
        "These rules are enforced by Harmonious servers, not only by what a screen shows.",
      ],
    },
    {
      heading: "Earlier checks and manual entry",
      paragraphs: [
        "If a person or organization was already verified elsewhere, authorized staff may record that earlier result. It goes to review and is approved by a different reviewer than the person who entered it. Nobody may approve their own verification. Any exception requires a recorded written reason. Full ID numbers entered this way are stored encrypted.",
      ],
    },
    {
      heading: "Review, records and retention",
      bullets: [
        "Each decision records who made it, when, and why. History is kept, not overwritten.",
        "Access to verification records follows a person's role and the records they are responsible for.",
        "Investor identity and verification records are kept for 7 years after the investor relationship ends. Nothing is deleted automatically: a person reviews each disposal, and a legal or regulatory hold blocks it.",
      ],
    },
    {
      heading: "Your information and questions",
      paragraphs: [
        "How we collect, use and protect personal information is described in our Privacy Policy (harmonious.co/privacy), and our security controls are described at harmonious.co/data-security.",
        "Questions about this policy can be sent to support@harmonious.co. We review this policy at least once a year and update it when our procedures change.",
      ],
    },
  ],
};
