import { createFileRoute } from "@tanstack/react-router";

import { FundBanking } from "@/components/fund-banking";

export const Route = createFileRoute("/_authenticated/admin/fund-banking/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund Banking — Harmonious Admin" },
      {
        name: "description",
        content:
          "Enter a fund's receiving account, request help opening one, and follow deposits and investor wires.",
      },
      { property: "og:title", content: "Fund Banking — Harmonious Admin" },
      {
        property: "og:description",
        content: "Bank details, bank applications, deposits and wire tracking for one fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFundBankingPage,
});

function AdminFundBankingPage() {
  const { fundId } = Route.useParams();
  return <FundBanking fundId={fundId} backTo="admin" />;
}
