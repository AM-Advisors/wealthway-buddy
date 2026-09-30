import { createFileRoute } from "@tanstack/react-router";

import { StatementReviewBoard } from "@/components/statement-review-board";

export const Route = createFileRoute("/_authenticated/ops/statements")({
  head: () => ({
    meta: [
      { title: "Statements & reviews — Harmonious" },
      { name: "description", content: "Approve investor capital account statements and client financial reviews before release." },
      { property: "og:title", content: "Statements & reviews — Harmonious" },
      { property: "og:description", content: "Second-person approval for capital account statements and financial review memos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StatementReviewBoard,
});
