import { createFileRoute, redirect } from "@tanstack/react-router";

/** Fund banking now lives inside the manager's fund workspace; keep old links working. */
export const Route = createFileRoute("/_authenticated/manager/fund-banking/$fundId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/manager/fund/$fundId/banking", params: { fundId: params.fundId } });
  },
  head: () => ({ meta: [
    { title: "Fund banking | Harmonious" },
    { name: "description", content: "Bank details, deposits and wire tracking for your fund." },
    { property: "og:title", content: "Fund banking | Harmonious" },
    { property: "og:description", content: "Bank details, deposits and wire tracking for your fund." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});
