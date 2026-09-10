import { createFileRoute } from "@tanstack/react-router";

import { FundBanking } from "@/components/fund-banking";

export const Route = createFileRoute("/_authenticated/manager/fund-banking/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund Banking — Harmonious" },
      {
        name: "description",
        content:
          "Enter your fund's receiving account, apply for an account through Harmonious, and follow deposits and investor wires.",
      },
      { property: "og:title", content: "Fund Banking — Harmonious" },
      {
        property: "og:description",
        content: "Bank details, bank applications, deposits and wire tracking for your fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerFundBankingPage,
});

function ManagerFundBankingPage() {
  const { fundId } = Route.useParams();
  return <FundBanking fundId={fundId} backTo="manager" />;
}
