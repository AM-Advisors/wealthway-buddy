import { createFileRoute, useParams } from "@tanstack/react-router";

import { SideLetterRegistry } from "@/components/side-letter-registry";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/side-letters")({
  head: () => ({
    meta: [
      { title: "Side letters — Harmonious" },
      { name: "description", content: "Per-investor side letter registry: terms, MFN review, expiry and approvals." },
      { property: "og:title", content: "Side letters — Harmonious" },
      { property: "og:description", content: "Investor side letter terms with maker-checker approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { fundId } = useParams({ from: "/_authenticated/manager/fund/$fundId/side-letters" });
  return <SideLetterRegistry fundId={fundId} />;
}
