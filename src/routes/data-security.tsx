import { createFileRoute } from "@tanstack/react-router";

import { SecurityCenterPage } from "@/components/security-center-page";
import { seoLinks, seoMeta } from "@/lib/seo";
import { getPublishedTrustItems } from "@/lib/trust-center-public.functions";

const TITLE = "Data Security & Privacy - Harmonious";
const DESCRIPTION =
  "How Harmonious protects funds, records and money: two-step sign-in, scoped access, locked records, and payment work that only people can release.";

export const Route = createFileRoute("/data-security")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      ...seoMeta("/data-security"),
    ],
    links: seoLinks("/data-security"),
  }),
  loader: () => getPublishedTrustItems(),
  errorComponent: () => <SecurityCenterPage items={[]} />,
  notFoundComponent: () => <SecurityCenterPage items={[]} />,
  component: Page,
});

function Page() {
  const { items } = Route.useLoaderData();
  return <SecurityCenterPage items={items} />;
}
