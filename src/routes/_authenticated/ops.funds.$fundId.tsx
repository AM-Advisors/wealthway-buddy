import { createFileRoute, useParams } from "@tanstack/react-router";

import { OperationsFund } from "@/components/operations-board";

export const Route = createFileRoute("/_authenticated/ops/funds/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund formation — Harmonious operations" },
      {
        name: "description",
        content: "Banking, EIN, Form SS-4 and tax documents held for one fund.",
      },
      { property: "og:title", content: "Fund formation — Harmonious operations" },
      {
        property: "og:description",
        content: "Everything the operations team holds for a single fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperationsFundRoute,
});

function OperationsFundRoute() {
  const { fundId } = useParams({ from: "/_authenticated/ops/funds/$fundId" });
  return <OperationsFund fundId={fundId} />;
}
