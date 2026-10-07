import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { AccountIdentityQueue } from "@/components/account-identity-queue";
import { SC_SECTIONS, SecurityComplianceCenter, type ScSection } from "@/components/security-compliance-center";

const keys = SC_SECTIONS.map((s) => s[0]) as [ScSection, ...ScSection[]];

export const Route = createFileRoute("/_authenticated/ops/security-compliance")({
  validateSearch: (s) => z.object({ section: z.enum(keys).optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Security & Compliance Center - Harmonious Operations" },
      { name: "description", content: "Harmonious internal control library, frameworks, evidence, risks, policies, audits and Trust Center publishing." },
      { property: "og:title", content: "Security & Compliance Center - Harmonious Operations" },
      { property: "og:description", content: "Internal governance, risk and compliance workspace for Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { section } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <div>
      {(section ?? "overview") === "overview" ? <div className="px-4 pt-6 sm:px-6"><AccountIdentityQueue /></div> : null}
      <SecurityComplianceCenter section={section ?? "overview"} onSection={(s) => navigate({ search: { section: s } })} />
    </div>
  );
}
