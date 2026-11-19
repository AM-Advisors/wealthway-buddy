import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage } from "@/components/legal-document-page";
import { KYC_KYB_POLICY } from "@/lib/kyc-kyb-policy-content";
import { seoLinks, seoMeta } from "@/lib/seo";

const TITLE = "KYC, KYB & AML Policy | Harmonious";
const DESCRIPTION =
  "How Harmonious verifies investors and fund users: identity checks for individuals, verification of companies, trusts and beneficial owners, and anti-money-laundering screening.";

export const Route = createFileRoute("/kyc-aml")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      ...seoMeta("/kyc-aml"),
    ],
    links: seoLinks("/kyc-aml"),
  }),
  component: () => <LegalDocumentPage doc={KYC_KYB_POLICY} />,
});
