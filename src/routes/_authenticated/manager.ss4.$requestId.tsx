import { createFileRoute } from "@tanstack/react-router";

import { Ss4SignView } from "@/components/ss4-request";

export const Route = createFileRoute("/_authenticated/manager/ss4/$requestId")({
  head: () => ({
    meta: [
      { title: "Sign Form SS-4 - Harmonious" },
      { name: "description", content: "Review your fund's prefilled IRS Form SS-4 and sign it." },
      { property: "og:title", content: "Sign Form SS-4 - Harmonious" },
      { property: "og:description", content: "Review and sign your fund's EIN application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { requestId } = Route.useParams();
  return <Ss4SignView requestId={requestId} />;
}
