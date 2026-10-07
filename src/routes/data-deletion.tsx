import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage } from "@/components/legal-document-page";
import type { LegalDocument } from "@/lib/legal-content";

const DESCRIPTION =
  "How to request deletion of personal information held by Harmonious, including data received through Facebook, Instagram or other Meta services.";

const DOC: LegalDocument = {
  title: "User Data Deletion",
  updated: "October 7, 2026",
  effectiveDate: "2026-10-07",
  version: 1,
  summary:
    "Harmonious Capital Administration LLC (“Harmonious,” “we,” “us,” or “our”) respects your privacy and provides users with the ability to request deletion of personal information associated with their use of Harmonious services, including information received through Facebook, Instagram, or other Meta services.",
  blocks: [
    {
      heading: "Request Deletion of Your Data",
      paragraphs: [
        "To request deletion of your personal information associated with Harmonious, send an email to info@harmoniouscapitaladmin.com with the subject line “User Data Deletion Request.” Include:",
      ],
      bullets: [
        "Your full name",
        "The email address associated with your Harmonious account",
        "If applicable, the Facebook or Instagram account associated with your Harmonious account",
        "A statement requesting deletion of your personal information",
      ],
    },
    { paragraphs: ["Harmonious may request additional information reasonably necessary to verify your identity before processing a deletion request."] },
    {
      heading: "Facebook and Instagram Data",
      paragraphs: [
        "If you connected Facebook or Instagram to Harmonious, you may also remove Harmonious' access through your Facebook or Instagram account settings.",
        "When we receive a valid deletion request, Harmonious will delete or de-identify personal information associated with the applicable account unless we are required or permitted to retain the information under applicable law, regulation, contractual obligation, fraud-prevention requirements, security requirements, or record-retention requirements.",
        "This may include legal and regulatory obligations applicable to financial services, fund administration, tax, accounting, anti-money laundering, know-your-customer, sanctions screening, or other regulated activities.",
        "Removing Harmonious' access to your Facebook or Instagram account does not necessarily delete information that Harmonious is legally required to retain.",
      ],
    },
    {
      heading: "What We May Delete",
      paragraphs: ["Depending on your relationship with Harmonious and applicable legal requirements, deletion may include:"],
      bullets: [
        "Facebook or Instagram identifiers associated with your Harmonious account",
        "Meta access tokens and connection credentials",
        "Social media integration records",
        "Profile information received through Meta",
        "Application authorization records",
        "Other personal information that is no longer required to provide services or satisfy legal or regulatory obligations",
      ],
    },
    {
      heading: "Processing Your Request",
      paragraphs: [
        "We will review and process verified deletion requests in accordance with applicable privacy laws and our legal and regulatory obligations.",
        "If some information cannot be deleted because Harmonious is legally required to retain it, we may restrict its use to the purposes for which retention is required.",
      ],
    },
    {
      heading: "Privacy Policy",
      paragraphs: ["For additional information about how Harmonious collects, uses, stores, and protects personal information, please review our Privacy Policy at https://www.harmonious.co/privacy-policy."],
    },
    {
      heading: "Contact",
      paragraphs: ["Harmonious Capital Administration LLC, 400 N. Ervay Street, Dallas, Texas 75202, United States", "Email: info@harmoniouscapitaladmin.com"],
    },
  ],
};

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "User Data Deletion | Harmonious" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "User Data Deletion | Harmonious" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalDocumentPage doc={DOC} />,
});
