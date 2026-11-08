import { createFileRoute } from "@tanstack/react-router";

import { ClosingDesk } from "@/components/manager-closing-desk";

export const Route = createFileRoute("/_authenticated/manager/closing")({
  head: () => ({
    meta: [
      { title: "Closing Desk | Harmonious" },
      {
        name: "description",
        content:
          "Confirm each investor's commitment is fully funded, set the closing date and publish the final documents to their portal.",
      },
      { property: "og:title", content: "Closing Desk | Harmonious" },
      {
        property: "og:description",
        content: "Confirm funding, set closing dates and share final documents with investors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ClosingDesk />,
});
