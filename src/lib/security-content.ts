/**
 * Harmonious-owned security statement. Public copy, so every line here must
 * describe something the product actually does - see the notes on each block.
 * It is NOT a certification, an audit opinion, a legal notice or a promise of
 * a specific outcome, and it must never claim SOC 2, ISO 27001 or GDPR status.
 */

export interface SecuritySection {
  heading: string;
  intro?: string;
  bullets: string[];
}

export interface SecurityStatement {
  eyebrow: string;
  title: string;
  updated: string;
  summary: string;
  sections: SecuritySection[];
  /** What the page deliberately does not claim. */
  disclaimers: string[];
  contact: string;
}

export const SECURITY_STATEMENT: SecurityStatement = {
  eyebrow: "Harmonious / Security & Privacy",
  title: "How Harmonious protects funds, records and money",
  updated: "October 7, 2026",
  summary:
    "A plain-language account of the controls built into Harmonious, written and maintained by Harmonious. It is our own description of how the product behaves - not a certification, an audit opinion or a legal notice.",
  sections: [
    {
      heading: "Who can get in",
      intro:
        "Nobody reaches fund or investor data on a password alone, and nobody gets broad access by default.",
      bullets: [
        "Anyone signing in to the Harmonious staff or client workspace must complete a second step at every sign-in - a passkey (Face ID, Touch ID or Windows Hello) or an authenticator app. Codes are issued under the name \"Harmonious\".",
        "If someone loses their second step, access is restored only after two Harmonious staff independently confirm who that person is.",
        "Identity verification is completed on a person's own account before they can reach investor records, documents or money screens.",
        "Access follows role and scope: a person sees the funds, clients and records they are responsible for. Extra permissions are granted to one named person and are never handed out because of an email domain.",
        "Access can be revoked, suspended or archived at any time, and each account's most recent sign-in is recorded.",
      ],
    },
    {
      heading: "How records are protected from silent change",
      intro:
        "Fund and investor records are treated as official once saved - not as a draft anyone can quietly overwrite.",
      bullets: [
        "Saved fund, investor and client details lock in place. A later change waits until a second Harmonious person approves it, and nobody can approve their own change.",
        "Where separation of duties applies - fee terms, documents, distributions - a different person must sign off before anything takes effect.",
        "Access changes, including changes that were refused, are written to an append-only log that cannot be edited after the fact.",
        "Tax identification numbers are stored encrypted. The app displays only the last four digits.",
      ],
    },
    {
      heading: "Money never moves on its own",
      intro: "Harmonious prepares payment work; people release it.",
      bullets: [
        "Harmonious does not automatically initiate a bank debit, wire, ACH transfer, tax payment or refund.",
        "Payment and distribution files are prepared inside the app and released only after a named person reviews them.",
        "The final approval on a distribution must come from someone other than the person who prepared it.",
      ],
    },
    {
      heading: "Your information and your choices",
      intro: "You can ask us what we hold about you, ask us to fix it, or ask us to remove it.",
      bullets: [
        "From Account -> Privacy you can request a copy of your data, a correction, or deletion.",
        "Requests are answered within 30 days by a person, not an automated job.",
        "Deletion never removes financial, tax, regulatory or legal records we are required to keep - we tell you what was kept and why.",
        "How we collect and use personal information is described in our Privacy Policy.",
        "A list of the service providers we rely on is available by asking support@harmonious.co.",
      ],
    },
    {
      heading: "How long we keep records",
      intro:
        "Every record family has a written retention rule in our Compliance & Controls register. Nothing is deleted automatically - a person reviews each disposition, and a legal or regulatory hold blocks it.",
      bullets: [
        "Tax records (K-1s, filings, workpapers): 7 years after the return is filed.",
        "Fund formation and offering documents (PPM, operating agreement, subscriptions): the life of the fund plus 7 years after dissolution.",
        "Investor identity and verification data: 7 years after the investor relationship ends.",
        "Fund books and accounting records: 7 years after the period they cover.",
        "Signed agreements: 7 years after the agreement ends; the append-only activity history is kept for the life of the platform.",
        "Marketing contacts: until consent is withdrawn, then 3 years as proof of consent.",
      ],
    },
    {
      heading: "What we are working toward",
      intro:
        "We keep a running record of the evidence an outside review would need, and we publish results only once they exist.",
      bullets: [
        "We are preparing for an independent SOC 2 Type I review; no audit report exists yet, so we make no SOC 2 claim.",
        "We have not been assessed against ISO 27001 and make no ISO claim.",
        "GDPR work is tracked as named responsibilities - privacy requests, retention rules, staff training, vendor agreements - with proof attached to each.",
      ],
    },
  ],
  disclaimers: [
    "This page is Harmonious's own statement about how our product works. It is not a certification, an audit opinion, a regulatory filing or legal advice.",
    "Harmonious is not certified SOC 2 or ISO 27001 and does not claim to be. Any such statement would follow only after an outside auditor's report exists.",
    "Our hosting provider publishes its own platform evidence about how the environment is run and monitored at /.well-known/trust.html. That page belongs to the provider, not to Harmonious, and is separate from this one.",
  ],
  contact: "support@harmonious.co",
};
