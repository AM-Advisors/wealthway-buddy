/**
 * Harmonious-owned security statement. Public copy, so every line here must
 * describe something the product actually does - see the notes on each block.
 * It is NOT a certification, an audit opinion, a legal notice or a promise of
 * a specific outcome, and it must never claim SOC 2, ISO 27001 or GDPR status.
 */

export interface SecuritySection {
  heading: string;
  /** Trust Center section key; published Trust Center items with this key are appended. */
  key: string;
  intro?: string;
  bullets: string[];
}

export interface SecurityStatement {
  eyebrow: string;
  title: string;
  updated: string;
  summary: string;
  /** Short verified facts shown at the top of the page. */
  highlights: { title: string; body: string }[];
  sections: SecuritySection[];
  /** What the page deliberately does not claim. */
  disclaimers: string[];
  contact: string;
  /** Address published for security disclosure, matching /.well-known/security.txt. */
  security_contact: string;
}

export const SECURITY_STATEMENT: SecurityStatement = {
  eyebrow: "Harmonious / Security & Privacy",
  title: "Harmonious Data Security",
  updated: "October 23, 2026",
  summary:
    "A plain-language account of the controls built into Harmonious, written and maintained by Harmonious. It is our own description of how the product behaves - not a certification, an audit opinion or a legal notice.",
  highlights: [
    { title: "Encrypted connections", body: "Every Harmonious web address uses HTTPS with TLS 1.2 or 1.3, and older versions are refused." },
    { title: "Protected access", body: "Two-step authentication and record-scoped permissions protect workspace access." },
    { title: "Recorded approvals", body: "Sensitive workflows use review controls and retain a history of decisions." },
    { title: "People release money", body: "Harmonious never automatically starts a wire, ACH transfer, tax payment or refund." },
  ],
  sections: [
    {
      heading: "Identity & Access", key: "identity_access",
      intro:
        "Workspace access is protected by two-step authentication and permissions tied to a person's role and assigned records.",
      bullets: [
        "Staff and client workspaces use authenticator-based two-step sign-in. Additional checks protect sensitive actions such as access to tax documents.",
        "If someone loses their second step, access is restored only after two Harmonious staff independently confirm who that person is.",
        "Identity verification is tied to the person's own account. Qualifying identity checks under review may allow limited workspace access; banking, funding and money actions remain blocked until verification is fully approved.",
        "Access follows role and scope: a person sees the funds, clients and records they are responsible for. Extra permissions are granted to one named person and are never handed out because of an email domain.",
        "Access can be revoked, suspended or archived at any time, and each account's most recent sign-in is recorded.",
      ],
    },
    {
      heading: "Data Protection", key: "data_protection",
      intro:
        "Fund and investor records are treated as official once saved - not as a draft anyone can quietly overwrite.",
      bullets: [
        "Protected saved records use controlled change requests rather than silent overwrites. Signed agreements retain their original versions and history.",
        "Where separation of duties applies - fee terms, documents, distributions - a different person must sign off before anything takes effect.",
        "An authorized Super Admin may use an allowed self-approval exception only with a permanently logged written reason. This does not permit self-granted access or changes to their own signing authority.",
        "Access changes, including changes that were refused, are written to an append-only log that cannot be edited after the fact.",
        "Tax identification numbers are stored encrypted. The app displays only the last four digits.",
      ],
    },
    {
      heading: "Encryption", key: "encryption",
      intro: "Information is protected while it travels to Harmonious and when the most sensitive details are stored.",
      bullets: [
        "All Harmonious web addresses use HTTPS with a valid certificate. Connections support TLS 1.3 and TLS 1.2; TLS 1.1 and older are refused.",
        "Browsers are instructed to always use a secure connection with Harmonious (HTTP Strict Transport Security), including on subdomains.",
        "Tax identification numbers are stored encrypted, and screens show only the last four digits.",
        "The most sensitive identifiers used for entity formation are kept in separate encrypted storage that can be opened only by the server step that needs them.",
      ],
    },
    {
      heading: "Application Security", key: "application_security",
      intro: "Protections are enforced by Harmonious servers, not only by what a screen shows or hides.",
      bullets: [
        "Protected fund, investor and client requests are authorized on the server against the person's role and relevant record scope. Sharing a screen or changing web addresses does not grant authority.",
        "Signed-in pages carry a personal watermark and limit copying, and protection events are recorded. No browser can fully prevent screen recording, so these are deterrence and traceability measures.",
        "The historical tax-document access workflow uses additional authentication checks and records allowed and refused downloads.",
        "Sign-in and session activity is recorded so unusual access can be investigated.",
      ],
    },
    {
      heading: "Money Movement Controls", key: "money_movement",
      intro: "Harmonious prepares payment work; people release it.",
      bullets: [
        "Harmonious does not automatically initiate a bank debit, wire, ACH transfer, tax payment or refund.",
        "Payment and distribution files are prepared inside the app and released only after a named person reviews them.",
        "Distribution workflows separate preparation and approval, subject only to an explicitly authorized, reason-logged Super Admin exception. Approval does not initiate a transfer.",
      ],
    },
    {
      heading: "Bank Connections", key: "bank_connections",
      intro:
        "Connecting a bank account is optional. Clients can upload wire instructions and bank statements instead. If you do connect, access is read-only.",
      bullets: [
        "Before the bank sign-in window opens, you must be signed in with two-step verification (an authenticator app).",
        "You also check a consent box that links to our Privacy Policy and our connection partner's privacy policy. We record who agreed, when, and which version, and we check that record before the connection starts.",
        "Your bank login details go straight to our connection partner and your bank. Harmonious never sees or stores them.",
        "The connection access key is kept only on our servers, in restricted storage. It never reaches your browser.",
        "We use the connection to read account details, balances and deposits so payments can be matched. We never use it to move money, and we never sell this data.",
        "You can disconnect at any time from Banking. Bank-connection data is kept while you're connected. When you disconnect or ask us to remove it, we delete it, unless a legal or regulatory hold applies. A person reviews and logs every deletion.",
        "Our written Information Security Policy covers bank connections and is reviewed every year. Ask support@harmonious.co for a copy.",
      ],
    },
    {
      heading: "Privacy", key: "privacy",
      intro: "You can ask us what we hold about you, ask us to fix it, or ask us to remove it.",
      bullets: [
        "From Account -> Privacy you can request a copy of your data, a correction, or deletion.",
        "Privacy requests open a staff review task with a 30-day response target; fulfillment is handled by a person, not an automatic deletion job.",
        "Deletion never removes financial, tax, regulatory or legal records we are required to keep - we tell you what was kept and why.",
        "How we collect and use personal information is described in our Privacy Policy.",
        "A list of the service providers we rely on is available by asking support@harmonious.co.",
      ],
    },
    {
      heading: "How long we keep records", key: "retention",
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
      heading: "Cookies and your consent", key: "cookies",
      intro:
        "Our public pages ask before using any optional cookies. You can change your choice at any time with the Cookie settings button below or in the footer.",
      bullets: [
        "Strictly necessary cookies keep the site working and secure and are always on.",
        "Preferences, Analytics and Marketing cookies stay off until you turn them on.",
        "Rejecting optional cookies is as easy as accepting them, and your choice is saved only in your browser.",
        "We do not currently run analytics or advertising trackers on our public pages.",
      ],
    },
  ],
  disclaimers: [
    "This page is Harmonious's own statement about how our product works. It is not a certification, an audit opinion, a regulatory filing or legal advice.",
    "Harmonious is not certified SOC 2 or ISO 27001 and does not claim to be. Any such statement would follow only after an outside auditor's report exists.",
    "Our hosting provider publishes its own platform evidence about how the environment is run and monitored at /.well-known/trust.html. That page belongs to the provider, not to Harmonious, and is separate from this one.",
  ],
  contact: "support@harmonious.co",
  security_contact: "legal@harmonious.co",
};

/**
 * Trust Center architecture. Sections without built-in copy appear only once
 * Harmonious publishes an approved item for them in the internal center.
 */
export const TRUST_SECTIONS: { key: string; heading: string }[] = [
  { key: "overview", heading: "Overview" },
  { key: "data_protection", heading: "Data Protection" },
  { key: "infrastructure", heading: "Infrastructure & Cloud Security" },
  { key: "identity_access", heading: "Identity & Access" },
  { key: "application_security", heading: "Application Security" },
  { key: "money_movement", heading: "Money Movement Controls" },
  { key: "encryption", heading: "Encryption" },
  { key: "business_continuity", heading: "Business Continuity" },
  { key: "bank_connections", heading: "Bank Connections" },
  { key: "privacy", heading: "Privacy" },
  { key: "retention", heading: "How long we keep records" },
  { key: "cookies", heading: "Cookies and your consent" },
  { key: "vendor_risk", heading: "Vendor Risk" },
];
