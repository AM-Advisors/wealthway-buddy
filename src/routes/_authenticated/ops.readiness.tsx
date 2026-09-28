import { createFileRoute } from "@tanstack/react-router";

import { ReadinessQueue } from "@/components/investment-readiness";

export const Route = createFileRoute("/_authenticated/ops/readiness")({
  head: () => ({
    meta: [
      { title: "Investment readiness queue — Harmonious Operations" },
      { name: "description", content: "Open investment readiness work, by owner and age." },
      { property: "og:title", content: "Investment readiness queue — Harmonious Operations" },
      { property: "og:description", content: "What each investment is waiting on, and who owns it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="p-6"><ReadinessQueue /></div>
  ),
});
