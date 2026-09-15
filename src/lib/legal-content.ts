/**
 * Single source of truth for the public legal text.
 *
 * The same content is rendered on /privacy and /terms and published into
 * `policy_documents`, so the page a person reads and the document they accept
 * at sign-in can never drift apart.
 */

export interface LegalBlock {
  /** Optional sub-heading above the block. */
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  /** Human-readable effective date shown at the top of the page. */
  updated: string;
  /** ISO date used for the published policy version. */
  effectiveDate: string;
  version: number;
  summary: string;
  blocks: LegalBlock[];
}

const COMPANY = "Harmonious Capital Administration LLC";

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  updated: "September 14, 2026",
  effectiveDate: "2026-09-14",
  version: 2,
  summary:
    "How Harmonious Capital Administration LLC collects, uses, shares, stores and protects personal information on our websites and through our services.",
  blocks: [
    {
      paragraphs: [
        `This Privacy Policy describes how ${COMPANY}, for itself or on behalf of any of its wholly owned subsidiaries (collectively "${COMPANY}", "We", or "Us"), collects and uses the personal information you provide or that is generated on our websites, portals or mobile applications (the "Site") or in connection with our services (the "Services"). It also describes options that may be available to you regarding the use of, your access to, and updating or correcting your personal information. Note that this Privacy Policy does not apply to any third-party websites or services, including those you reach through links we have provided on the Site. We encourage you to request and review the privacy policies of any third party prior to disclosing information to such a party.`,
        `In connection with the Site, ${COMPANY} may collect and process personal information that you provide to us or that pertains to your use of the Site ("Site User Information"). ${COMPANY}, whose principal office location is 400 N Ervay Street, Dallas, Texas 75202, United States of America, is the "Data Controller" of Site User Information for purposes of European or other applicable law. Separate from Site User Information, ${COMPANY} collects and otherwise processes personal information in the course of providing administration, technology, onboarding, reporting, payment-facilitation, recordkeeping, compliance-support and regulatory-support services to users ("Service User Information"), but such processing is performed under the direction of its users.`,
        `In the normal course of the Services, we transfer Site User Information and Service User Information to individuals as directed by users of the Services, and to third parties that help or are necessary for us to provide our Services. Transfers to such third parties are further addressed in the service agreements with our clients.`,
      ],
    },
    {
      heading: "Site User Information",
      paragraphs: [
        "In connection with the operation of the Site or providing Services, we may collect and use the following Site User Information about you.",
        "Information you provide: we may ask you to provide us with certain Personally Identifiable Information (PII) and Non-Public Personal Information (NPPI) by using our Site or by corresponding with us by phone or e-mail concerning the Site, or by using interactive features that we may include on the Site for the purpose of receiving and responding to your comments, inquiries, or expressions of interest in our products and services, or providing services.",
        "Personally Identifiable Information (PII) and Non-Public Personal Information (NPPI) includes, but is not limited to: full name, facial biometrics, date of birth, social security number, tax ID, nationality, passport, national identity card, driver license, gender, marital status, signature, name of employer, address of employer, business nature of employer, occupation, residential address, residential phone number, personal mobile phone number, personal e-mail address, business address, business mobile phone number, business phone number, business e-mail address, legal representative or authorised signatory, business scope, financial situation, certificate of incorporation, certificate of incumbency, memorandum and articles of incorporation, bank account information, source of funds, source of wealth and annual income.",
      ],
    },
    {
      heading: "Service User Information",
      paragraphs: ["Where you use our Services, we process the following Service User Information on behalf of you:"],
      bullets: [
        "Transaction history",
        "Anticipated transaction volume",
        "Positions",
        "Account statements",
        "Information received as part of the AML screening process: criminal background; Politically Exposed Person (PEP) status; global sanctions (OFAC, UN, HMT, EU and DFAT); adverse media; watchlists (Interpol, federal and state government agencies)",
      ],
    },
    {
      heading: "Cookies and similar technologies",
      paragraphs: [
        "When you visit our Site, we and our third-party partners, including analytics providers such as Google Analytics, collect information by automated means, such as the use of cookies, web beacons and web server logs. The information collected in this manner includes IP address, browser characteristics, device IDs and characteristics, operating system version, language preferences, referring URLs, and information about the usage of our Site and emails. We may process this information to determine how many users have visited particular web pages, viewed particular videos, or opened messages or alerts, and we may also use such information to improve the performance of the Site and to prevent fraud. In some cases, our third-party partners may process information collected by such cookies. Under EU and other laws, if and where applicable, the legal basis for the processing of cookie data necessary for the functioning of the Site is our legitimate interest in providing the Site and our Services; for other cookie data, we process that data with your consent.",
        "As indicated above, we, like many other website operators, currently use Google Analytics to collect and process certain Site usage data. To learn more about Google Analytics and how to opt out, please visit https://policies.google.com/technologies/partner-sites.",
        "Google may assert the right to collect and combine information collected on the Site using its Google Analytics cookie with other information about your online activities over time, on other devices, and on other websites or apps, if those websites and apps use or share data with the same partners. You may be able to change a web browser's settings to block and delete cookies when you access the Site through that web browser. However, if you do that, the Site may not work properly; also, we will still receive basic information (such as the last URL visited) when you navigate to the Site.",
        "We do not rent, sell, or share \"personal information\" as defined by California Civil Code §1798.83 about you that we collect on the Site with other people or unaffiliated companies for their direct marketing purposes.",
      ],
    },
    {
      heading: "Cookies and service providers we use",
      bullets: [
        "Satschel — compliance verification for KYC/AML, accreditation verification and liveness testing. Privacy notice: https://simplici.io/privacy-notice",
        "Legal Inc — registered agent provider. Privacy policy: https://legalinc.com/privacypolicy/",
        "Google — usage analytics for this Site. Privacy policy: https://policies.google.com/technologies/partner-sites",
        "Stripe — card payments. Stripe uses a cookie to remember who you are and to enable the website to process payments without storing card information on its own servers. Privacy policy: https://stripe.com/privacy",
        "Airtable — data and workflow syncing. Privacy policy: https://www.airtable.com/privacy",
        "HubSpot — CRM and reporting. Privacy policy: https://legal.hubspot.com/privacy-policy",
        "Plaid — read-only bank account verification and transaction matching where you choose to link an account. Privacy policy: https://plaid.com/legal/",
      ],
    },
    {
      heading: "Use of your personal information",
      paragraphs: [
        "Under European Union (EU) and other laws, if and where applicable, the legal basis for the processing of your personal information is:",
      ],
      bullets: [
        "To provide and maintain our Services, including monitoring the usage of our Services.",
        "To manage your account: the personal data you provide gives you access to the functionality of the Services available to you as a registered user.",
        "To contact you: through emails, telephone calls, SMS or other equivalent forms of electronic communication, including security updates, when necessary or reasonable for their implementation.",
        "To protect you: we rely on the use of personal data to protect our Services against cybersecurity issues such as spam, phishing and Distributed Denial of Service (DDoS) attacks.",
        "To protect us: we are required to comply with all applicable legal and regulatory requirements relevant to our provision of Services.",
        "To provide you with news, special offers and general information about other goods, services and events that we offer that are similar to those you have already purchased or enquired about, unless you have opted not to receive such information.",
        "To manage your requests: we attend to and manage your requests to us on an ongoing basis.",
        "For other purposes: such as data analysis, identifying usage trends, determining the effectiveness of our promotional campaigns, and evaluating and improving our Services and your experience.",
      ],
    },
    {
      heading: "Sharing of data",
      paragraphs: [
        `We do not sell or otherwise share personal information about you, except as described in this Privacy Policy. We may share personal information with third parties who perform services for us or on our behalf, and we may share Site User Information and Service User Information with third-party distributors and other business partners to enable them to provide you with ${COMPANY} Services. These third parties are not authorised by ${COMPANY} to use or disclose your personal information except as necessary to perform services to or on behalf of ${COMPANY} or to comply with legal requirements, and they are subject to confidentiality and non-disclosure obligations in our agreements with them to protect your personal information.`,
        "Except where disclosure of your personal information is required by law or requested by you, we will generally require any third party which receives, or has access to, your personal information to protect it and to use it only to carry out the services they are performing for you or for us, unless otherwise required or permitted by law.",
        "If you are located in the EU, the following also applies: we have concluded data processing agreements with each relevant service provider in accordance with the EU General Data Protection Regulation. Beyond that, we only share or disclose your personal information to the extent required to provide the Services or to sell or transfer the relevant business or assets, either on the basis of our legitimate interests or with your prior express consent.",
        "You should note that you are not obliged to give your personal information to us. If you choose not to do so, we may not be able to provide our Services, or your access to our Services may be limited. We may share your personal information in the following situations:",
      ],
      bullets: [
        "Receiving and sending text messages: we use Twilio's services to receive and send text messages from and to you. Twilio terms of service: https://www.twilio.com/legal/tos. Messaging policy: https://www.twilio.com/legal/messaging-policy",
        "Anti-bot service: we use the hCaptcha anti-bot service provided by Intuition Machines, Inc. (\"IMI\") to check whether data entered on our website has been entered by a human or an automated program. hCaptcha evaluates information such as IP address, time spent on the site and mouse movements, and forwards that data to IMI. Processing is based on Art. 6(1)(f) GDPR: our legitimate interest in protecting the site from abusive automated crawling and spam. Terms: https://hcaptcha.com/terms. Privacy policy: https://hcaptcha.com/privacy/",
        "For service monitoring: we may share your personal information with service providers to monitor and analyse the use of our Services.",
        "For fraud prevention: personal data will be furnished to third-party service providers for identity verification, criminal background checks and fraud prevention services.",
        "For AML screening: personal data will be furnished to third-party service providers to screen for criminal background, PEP status, global sanctions (OFAC, UN, HMT, EU and DFAT), adverse media and watchlists (Interpol, federal and state government agencies).",
        `For business transfers: we may share or transfer your personal data in connection with, or during negotiations of, any merger, sale of ${COMPANY} assets, financing, or acquisition of all or a portion of our business to another company.`,
        "With affiliates: we may share your information with our affiliates, in which case we will require those affiliates to honour this Privacy Policy.",
        "With business partners: we may share your information with our business partners to offer you certain products, services or promotions.",
        "With regulators and law enforcement: we may share your personal information with the appropriate regulators, any financial dispute resolution scheme to which we subscribe, law enforcement bodies, regulatory agencies, courts, arbitration bodies and dispute resolution schemes, both in the jurisdiction where we are incorporated and internationally, as may be required by law.",
        "With other users: when you share personal information or otherwise interact in public areas with other users, such information may be viewed by those users.",
      ],
    },
    {
      heading: "Storage, transfer and retention",
      paragraphs: [
        "This Site is operated from, and Site User Information and Service User Information is stored in, the United States of America. We store Site User Information and Service User Information in cloud infrastructure located in the United States of America.",
        `Your information, including personal information, is processed at ${COMPANY} operating offices and in any other places where the parties involved in the processing are located. This means the information may be transferred to, and maintained on, computers located outside of the jurisdiction where you reside, and the data protection laws with which ${COMPANY} complies may differ from those in your jurisdiction. Your consent to this Privacy Policy followed by your submission of such personal data represents your agreement to that transfer.`,
        "We will take all steps reasonably necessary to ensure that your personal information is treated securely and in accordance with this Privacy Policy, and no transfer of personal information will take place to an organisation or a country unless there are adequate controls in place, including the security of personal information.",
        "We will retain your personal information only for as long as is necessary for the purposes set out in this Privacy Policy. We will retain and use your personal information to the extent necessary to comply with our regulatory and legal obligations (for example, applicable anti-money laundering and counter-terrorist financing regulations), resolve disputes, and enforce our legal agreements and policies.",
        "We will also retain site usage information for internal analysis purposes. Site usage information is generally retained for a shorter period, except where the information is used to strengthen security or improve the functionality of our Services, or where we are legally obliged to retain it for longer.",
        "We maintain Site User Information and Service User Information for as long as needed for the business purposes for which it is collected, and in keeping with our record retention policies. In general, personal information relating to you is held for at least five years, as required by the regulators, after we cease providing you with our Services.",
      ],
    },
    {
      heading: "Security",
      paragraphs: [
        `${COMPANY} maintains administrative, technical and physical safeguards (including technical and organisational measures) designed to protect personal information against accidental, unlawful or unauthorised destruction, loss, alteration, access, disclosure or use.`,
        "We require that our service providers implement and maintain appropriate security practices and procedures. Nevertheless, please be aware that internet transmissions are never completely private or secure. If you have any questions about the security of your personal information, you can contact us at support@harmonious.co.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        "Certain jurisdictions impose specific legal requirements and data subject rights with respect to personal information, and we will comply with restrictions and any requests you submit as required by applicable law. For example, you may have the right to review, correct and delete the personal information we hold about you, or to consent or withdraw consent to certain uses or sharing of personal information. When you make a request, we may require that you provide information and follow procedures so that we can validate the request before responding to it. We will respond within the time period required by applicable law. However, we may not always be able to comply fully with your request, and we will notify you in that event. As permitted by applicable law, we may charge a reasonable fee to help cover the cost of responding to your request, and we will inform you of the fee before completing it.",
      ],
    },
    {
      heading: "For California residents",
      paragraphs: [
        "If you are a California resident, you may have certain rights in relation to our processing of Site User Information as to which we are a \"business\" under the California Consumer Privacy Act (\"CCPA\"). Note that we do not \"sell\" personal information as that term is defined by the CCPA. Under the CCPA, California residents have, with respect to Site User Information:",
      ],
      bullets: [
        "The right to request more information about our data collection and sales practices in connection with your personal information.",
        "The right to request a copy of the specific personal information collected about you during the 12 months before your request. You may make such a request twice in a 12-month period, and we will respond within 45 days.",
        "The right to request that personal information be deleted (with exceptions).",
        "The right to request that your personal information not be sold to third parties.",
        "The right not to be discriminated against because you exercise any of these rights.",
      ],
    },
    {
      heading: "For European Economic Area data subjects",
      paragraphs: [
        "If you are located in the EEA you have certain rights in relation to our processing of Site User Information and registration information as to which we are a \"controller\" under the EU General Data Protection Regulation (\"GDPR\"), as follows:",
      ],
      bullets: [
        "Right to information: we will provide you with information about how we process your personal information. This Privacy Policy is designed in part to fulfil this obligation.",
        "Right to access: you may request that we confirm whether we process personal information concerning you and, if so, give you access to that information and more detail about the associated processing activity.",
        "Right to data portability: where processing is automated and the legal basis is consent or performance of a contract, you may request a subset of your personal information in a structured, commonly used and machine-readable format, or ask us to send it directly to another controller.",
        "Right to rectification: if the personal information we process about you is inaccurate or incomplete, you may ask us to rectify or complete it.",
        "Right to erasure: you may request deletion where the processing is based on consent and that consent is withdrawn; where you object and there are no overriding legitimate interests; where the information was unlawfully processed; or where erasure is required to comply with a legal obligation. The right of erasure does not apply where further retention is necessary for compliance with legal or regulatory obligations, or for the establishment, exercise or defence of legal claims.",
        "Right to restriction: you may request that we temporarily restrict processing in certain situations, for example if you contest the accuracy of your personal information.",
        "Right to objection: in certain circumstances you may object to continued processing. We will only continue if there are compelling legitimate grounds that override your interests, rights and freedoms, or the processing is necessary to establish, enforce or defend legal claims.",
        "Right to lodge a complaint: we prefer to resolve data protection concerns directly with you, but you have the right to submit a complaint to a supervisory authority in the EEA country where you reside, work, or suspect an infringement has occurred.",
      ],
    },
    {
      heading: "Contact us",
      paragraphs: [
        "It is our policy and intention to comply with all applicable legal requirements in a given jurisdiction with respect to privacy and data protection. If you would like to assert any legal rights as a data subject, or have questions, comments or concerns regarding this Privacy Policy or our practices, please contact us at support@harmonious.co. To process certain requests, we will need to collect information from you so that we can verify your identity.",
        "If you would like us to update or correct any information you have provided, or you have a complaint about how your personal information has been used, please contact us in the first instance. If we cannot resolve your complaint to your satisfaction, you may complain to the competent authority, who may investigate your complaint further.",
      ],
    },
    {
      heading: "Updates to this Privacy Policy",
      paragraphs: [
        "We may update this Privacy Policy from time to time. We will notify you of material changes by email or through a prominent notice in the portal before the change takes effect, and we will update the date shown at the top of this policy. Where you use the Harmonious portal, you will be asked to review and accept the updated policy the next time you sign in.",
      ],
    },
    {
      heading: "Links to other websites",
      paragraphs: [
        "Our Services may contain links to other websites that are not operated by us. If you click on a third-party link you will be directed to that third party's site, and we strongly advise you to review the privacy policy of every site you visit. We have no control over, and assume no responsibility for, the content, privacy policies or practices of any third-party sites or services.",
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Terms of Service",
  updated: "September 14, 2026",
  effectiveDate: "2026-09-14",
  version: 2,
  summary:
    "The terms that govern use of the Harmonious portal, how services are scoped through the Master Service Agreement and each Statement of Work, and the limits of Harmonious's role.",
  blocks: [
    {
      paragraphs: [
        `These Terms of Service ("Terms") govern your access to and use of the Harmonious portal, websites and related applications (the "Platform") operated by ${COMPANY} ("Harmonious", "we", "us"). By creating an account, signing in, or using the Platform you agree to these Terms. If you are accepting on behalf of an entity, you confirm you are authorised to bind that entity.`,
      ],
    },
    {
      heading: "1. Scope of services: the MSA and each Statement of Work",
      paragraphs: [
        "Every client engagement is governed by a Master Service Agreement (\"MSA\") together with one or more Statements of Work (\"SOW\"). Each SOW controls the services provided, their scope, the fees, the deliverables, the timing and the operational terms that apply to them. These Terms govern use of the Platform itself and do not expand the services Harmonious provides.",
        "Where the Platform displays a service that is not included in your active scope, that service is not provided and cannot be initiated until a new or amended SOW is signed and activated. You may request additional services through the Platform; a request becomes a service only once it has been quoted, signed and activated.",
        "If these Terms conflict with your MSA or an SOW, the MSA and the applicable SOW control for the services described in them.",
      ],
    },
    {
      heading: "2. What Harmonious is, and what it is not",
      paragraphs: [
        "Harmonious is an administrative, technology, onboarding, reporting, payment-facilitation, recordkeeping, compliance-support and regulatory-support provider.",
        "Harmonious does not act as an investment adviser, broker-dealer, placement agent, custodian, transfer agent, escrow agent, trustee, general partner, fund manager, fiduciary, compliance officer, valuation agent, auditor, accountant, tax preparer or legal counsel, unless that role is expressly included in a specific signed SOW. Nothing in the Platform is investment, legal, accounting or tax advice, an offer to sell securities, or a solicitation of an offer to buy securities.",
        "Decisions about offerings, investors, valuations, distributions and filings remain with the client and its own advisers. Documents and templates made available through the Platform are a starting point for your counsel and are not a substitute for legal advice.",
      ],
    },
    {
      heading: "3. Accounts, access and security",
      paragraphs: [
        "Access to the Platform is granted to named individuals. You are responsible for keeping sign-in credentials confidential, for the activity carried out under your account, and for telling us promptly if you believe an account has been compromised or a person should no longer have access.",
        "You agree not to share accounts, attempt to access data belonging to another client, interfere with the operation or security of the Platform, or use it to store or transmit unlawful material. We may suspend access where we reasonably believe these Terms have been breached or where continued access presents a security, legal or regulatory risk.",
        "Roles and permissions in the Platform reflect the authority recorded for your organisation. Certain actions — including approving fees and authorising payment instructions — are restricted to people holding the relevant authority.",
      ],
    },
    {
      heading: "4. Accepting these Terms and later updates",
      paragraphs: [
        "Everyone who signs in to the Platform is asked to read and accept the current Privacy Policy, these Terms and the other platform documents before continuing. Acceptance is recorded with your name, the version accepted and the date and time.",
        "When we publish a new version of a document, you will be asked to review and accept it the next time you sign in. Continued use of the Platform requires acceptance of the current versions.",
      ],
    },
    {
      heading: "5. Client information and responsibilities",
      paragraphs: [
        "You are responsible for the accuracy, completeness and lawfulness of the information, documents and instructions you provide, and for obtaining any consents needed before sending us personal information about other people, including investors and beneficial owners.",
        "Harmonious relies on the information supplied by you and by your investors. We are not responsible for outcomes that follow from information that is inaccurate, incomplete, out of date, or supplied late, or for delays caused by outstanding items on a client-responsibility checklist.",
        "You will cooperate with identity verification, anti-money-laundering screening, accreditation verification and similar checks, and you will not ask us to proceed with a step while a compliance hold applies.",
      ],
    },
    {
      heading: "6. Electronic records and signatures",
      paragraphs: [
        "You consent to receive agreements, notices, statements, invoices, tax records and other documents electronically, and you agree that electronic signatures captured through the Platform are binding and have the same effect as handwritten signatures. You may request a paper copy of any document we are required to provide.",
      ],
    },
    {
      heading: "7. Fees, invoicing and payment",
      paragraphs: [
        "Fees are set out in your SOW and the pricing schedule agreed with Harmonious, or in an activated service request or rate proposal you have signed. Invoices issued through the Platform reflect those agreed rates and any agreed pass-through expenses.",
        "Invoices are payable by the due date shown on the invoice. Where you report a payment through the Platform, the invoice is marked paid only once Harmonious has matched the funds received. Harmonious facilitates payments and maintains the records; it does not act as a custodian, escrow agent or bank, and it does not hold client funds other than in the manner described in the applicable SOW.",
        "We may suspend delivery of services where invoices remain unpaid after notice, subject to the terms of the MSA.",
      ],
    },
    {
      heading: "8. Money movement controls",
      paragraphs: [
        "Payment instructions raised through the Platform are subject to Harmonious's verification and approval controls, including beneficiary verification, callback confirmation, compliance checks and approval by two separate authorised people. Harmonious may decline or delay an instruction that does not clear those controls, that falls outside your active scope, or that is subject to a compliance hold.",
      ],
    },
    {
      heading: "9. Confidentiality and data protection",
      paragraphs: [
        "Each party will keep the other's confidential information confidential and use it only to perform its obligations. Harmonious processes personal information as described in the Privacy Policy and, where it processes information on your behalf, under your direction and the terms of the MSA.",
        "Records are retained in line with our record retention policy and applicable law, including after an engagement ends. On termination, data export and record retention are handled through the offboarding process described in the MSA and the applicable SOW.",
      ],
    },
    {
      heading: "10. Third-party providers",
      paragraphs: [
        "Some services depend on third-party providers, including identity verification, banking, payment, registered agent, filing and document providers. Those providers act under their own terms, and Harmonious is not responsible for their acts or omissions beyond the standard of care set out in the MSA.",
      ],
    },
    {
      heading: "11. Platform availability and changes",
      paragraphs: [
        "We aim to keep the Platform available and secure, but it is provided on an \"as is\" and \"as available\" basis and may be interrupted for maintenance, upgrades or events beyond our reasonable control. We may change, add or remove Platform features, provided that we do not reduce the services agreed in an active SOW without following the change-of-scope process.",
      ],
    },
    {
      heading: "12. Intellectual property",
      paragraphs: [
        "The Platform, its software, design and content are owned by Harmonious or its licensors, and you receive a non-exclusive, non-transferable right to use them for the duration of your engagement. Your own data, documents and records remain yours.",
      ],
    },
    {
      heading: "13. Limitation of liability",
      paragraphs: [
        "To the fullest extent permitted by law, and except as otherwise stated in the MSA, neither party is liable for indirect, incidental, special or consequential losses, or for loss of profit, revenue or anticipated savings. The liability caps, exclusions and indemnities set out in the MSA apply to your use of the Platform.",
      ],
    },
    {
      heading: "14. Suspension and termination",
      paragraphs: [
        "Access to the Platform continues for as long as your engagement is active. Termination follows the notice period and process set out in your MSA and SOW, including settlement of outstanding invoices, data export and retention of records Harmonious is required to keep. We may suspend or terminate access immediately where required by law or regulation, or where continued access presents a serious security or legal risk.",
      ],
    },
    {
      heading: "15. Governing law",
      paragraphs: [
        "These Terms are governed by the laws of the State of Texas, without regard to its conflict of laws rules, and the dispute resolution provisions of your MSA apply to any dispute arising from them.",
      ],
    },
    {
      heading: "16. Contact",
      paragraphs: [
        `Questions about these Terms can be sent to support@harmonious.co, or by post to ${COMPANY}, 400 N Ervay Street, Dallas, Texas 75202, United States of America.`,
      ],
    },
  ],
};

/** Flattens a document into the plain text stored on the accepted policy version. */
export function legalPlainText(doc: LegalDocument): string {
  const parts: string[] = [`${doc.title} — last updated ${doc.updated}`, ""];
  for (const block of doc.blocks) {
    if (block.heading) parts.push(block.heading);
    for (const p of block.paragraphs ?? []) parts.push(p);
    for (const b of block.bullets ?? []) parts.push(`• ${b}`);
    parts.push("");
  }
  return parts.join("\n").trim();
}

/* ------------------------------------------------------- cap table service */

export const CAP_TABLE_PRIVACY: LegalDocument = {
  title: "CapTable Privacy Notice",
  updated: "September 15, 2026",
  effectiveDate: "2026-09-15",
  version: 1,
  summary:
    "How Harmonious handles company, shareholder and share-ownership information you record in the CapTable service.",
  blocks: [
    {
      paragraphs: [
        `This notice supplements the ${COMPANY} Privacy Policy and applies specifically to the CapTable service (the "Service"), which records your company's stakeholders, share holdings, transfers, certificates and shareholder access. Where this notice and the general Privacy Policy differ, this notice governs for the Service.`,
      ],
    },
    {
      heading: "1. Information recorded in the Service",
      bullets: [
        "Company information: legal name, entity type, jurisdiction and date of formation, authorized shares, par value, fiscal year end and the signatory who issues certificates.",
        "Stakeholder information: name, email address, stakeholder type and any tax or entity reference you choose to record.",
        "Holding information: share class, quantity, issue date, price paid, vesting or restriction notes, lineage of transferred shares and cancelled or replaced certificates.",
        "Access information: shareholder portal invitations, private view links, the times those links are used, and the certificate files you or Harmonious generate or upload.",
      ],
    },
    {
      heading: "2. Where the information comes from",
      paragraphs: [
        "Most information is entered or uploaded by your authorized users, including spreadsheet imports. Some is generated by the Service, such as certificate numbers, verification codes and ownership calculations. Harmonious staff only enter or correct information at your request or as part of the support described in your Statement of Work.",
      ],
    },
    {
      heading: "3. How the information is used",
      bullets: [
        "To maintain your cap table and produce ownership figures, certificates and shareholder views.",
        "To send shareholder invitations and certificate notifications to the email addresses you provide.",
        "To keep an audit record of who made each change and when, which we retain even after a record is cancelled or replaced.",
        "To support, secure and improve the Service, and to meet our own recordkeeping and legal obligations.",
      ],
      paragraphs: [
        "Harmonious does not sell cap table information, does not use it for advertising, and does not use it to train third-party artificial-intelligence models.",
      ],
    },
    {
      heading: "4. Who can see your cap table",
      bullets: [
        "Your authorized portal users, as permitted by their role on your account.",
        "A shareholder, limited to their own holdings and certificates, through a portal invitation or an expiring private link you issue.",
        "Harmonious staff with a support or administrative need, subject to internal access controls and audit logging.",
        "Service providers that host or transmit the Service on our behalf, under written confidentiality terms.",
        "Other parties only on your written instruction, or where we are legally required to disclose.",
      ],
    },
    {
      heading: "5. Accuracy and your responsibility",
      paragraphs: [
        "You remain responsible for the accuracy and completeness of the records you enter. Harmonious records what you provide; it does not independently verify share issuances, board or shareholder approvals, securities-law compliance, valuations or tax positions, and the Service is not legal, tax or accounting advice.",
      ],
    },
    {
      heading: "6. Retention",
      paragraphs: [
        "Cap table records, certificates and their audit history are retained for the life of your engagement and for the retention period set out in your agreement or required by law. Cancelled certificates and superseded holdings are retained rather than deleted, so ownership history stays intact.",
      ],
    },
    {
      heading: "7. Your choices",
      paragraphs: [
        "You can correct records in the Service at any time, revoke a shareholder's access or a private link, and request an export of your cap table. Requests about personal information can be sent to support@harmonious.co.",
      ],
    },
    {
      heading: "8. Contact",
      paragraphs: [
        `Questions about this notice can be sent to support@harmonious.co, or by post to ${COMPANY}, 400 N Ervay Street, Dallas, Texas 75202, United States of America.`,
      ],
    },
  ],
};

export const CAP_TABLE_TERMS: LegalDocument = {
  title: "CapTable Terms of Service",
  updated: "September 15, 2026",
  effectiveDate: "2026-09-15",
  version: 1,
  summary:
    "The terms for using the Harmonious CapTable service: what it does, what it does not do, your responsibilities as a founder, certificates, shareholder access, fees and limits of liability.",
  blocks: [
    {
      paragraphs: [
        `These terms govern use of the CapTable service (the "Service") provided by ${COMPANY} ("Harmonious"). They supplement, and do not replace, the Master Service Agreement and the Statement of Work that govern your engagement. Where a Statement of Work expressly says otherwise, the Statement of Work controls.`,
      ],
    },
    {
      heading: "1. What the Service is",
      paragraphs: [
        "The Service is a recordkeeping and technology tool. It stores the stakeholders, share holdings, transfers and certificates you record, calculates ownership from those records, generates certificates, and gives shareholders a read-only view of their own position.",
      ],
    },
    {
      heading: "2. What the Service is not",
      paragraphs: [
        "Harmonious is not your transfer agent, registrar, escrow agent, custodian, auditor, accountant, tax preparer, valuation agent, broker-dealer, placement agent, investment adviser or legal counsel, and does not act as an officer, director or fiduciary of your company, unless a signed Statement of Work expressly includes that role. Nothing in the Service issues securities, approves a transfer as a matter of corporate law, or constitutes legal, tax, accounting or investment advice.",
      ],
    },
    {
      heading: "3. Your responsibilities",
      bullets: [
        "Providing complete and accurate company, stakeholder and holding information, including any spreadsheet you import.",
        "Obtaining every board, shareholder, contractual and regulatory approval required before you record an issuance, transfer or cancellation.",
        "Naming an authorized signatory for certificates and keeping that appointment current.",
        "Controlling who on your team has portal access and which shareholders receive invitations or private links.",
        "Having your own counsel review your cap table and certificates before you rely on them for a financing, sale or filing.",
      ],
    },
    {
      heading: "4. Setup before you can record shares",
      paragraphs: [
        "You must complete CapTable setup — company details, authorized shares, certificate signatory and the acknowledgement of these terms — before shares, imports or transfers can be recorded. This applies whether you use the portal or any other route into the Service.",
      ],
    },
    {
      heading: "5. Certificates",
      paragraphs: [
        "Certificates are generated from the records you enter and are numbered and dated by the Service. A certificate is issued only after your authorized signatory signs it. A certificate evidences what your records say; it does not create, validate or transfer ownership by itself. Cancelled and replaced certificates are retained in the record with their history.",
      ],
    },
    {
      heading: "6. Transfers",
      paragraphs: [
        "A transfer takes effect in the record only once an authorized signatory on your account approves it. Harmonious does not approve transfers on your behalf and does not review them for securities-law, right-of-first-refusal or contractual restrictions.",
      ],
    },
    {
      heading: "7. Shareholder access",
      paragraphs: [
        "Invitations and private links you issue give the recipient access to their own holdings and certificates. You are responsible for who you send them to and for revoking access that is no longer appropriate. Private links expire and can be revoked at any time.",
      ],
    },
    {
      heading: "8. Plans and fees",
      paragraphs: [
        "The Service is offered in plan tiers. Your plan, its stakeholder limits and its fees are set by your active Statement of Work and the applicable rate card, and are invoiced under those terms. Features outside your plan display as out of scope until a change of scope is agreed and signed.",
      ],
    },
    {
      heading: "9. Data, confidentiality and export",
      paragraphs: [
        "Your cap table data is your confidential information. Harmonious uses it to run and support the Service and keeps it under the confidentiality, security and retention terms of your agreement. You may request an export of your records at any time during the engagement and on termination.",
      ],
    },
    {
      heading: "10. Suspension and termination",
      paragraphs: [
        "Access to the Service may be suspended for non-payment, for a compliance hold, or where continued use would breach law or your agreement. On termination, access ends as set out in the offboarding terms of your agreement, and records are exported and retained as required there.",
      ],
    },
    {
      heading: "11. Limitation of liability",
      paragraphs: [
        "To the fullest extent permitted by law, Harmonious is not liable for indirect, incidental, special or consequential loss, or for loss arising from inaccurate or incomplete information you recorded, from approvals you failed to obtain, or from reliance on the Service in place of professional advice. Liability is otherwise limited as set out in the Master Service Agreement.",
      ],
    },
    {
      heading: "12. Changes to these terms",
      paragraphs: [
        "We may publish an updated version of these terms. When we do, authorized users are asked to accept the new version before they can continue using the Service, and each acceptance is recorded with the name typed, the version and the date.",
      ],
    },
    {
      heading: "13. Contact",
      paragraphs: [
        `Questions about these terms can be sent to support@harmonious.co, or by post to ${COMPANY}, 400 N Ervay Street, Dallas, Texas 75202, United States of America.`,
      ],
    },
  ],
};
