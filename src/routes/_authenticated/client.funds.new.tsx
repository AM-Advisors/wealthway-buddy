import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useClientPortal } from "@/components/client-portal-context";
import { FundRequestEngine } from "@/components/fund-request-engine";

export const Route = createFileRoute("/_authenticated/client/funds/new")({
  validateSearch: (s) => z.object({ draft: z.string().uuid().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Launch a new fund or SPV | Harmonious" },
      { name: "description", content: "Tell Harmonious everything needed to set up your new fund or SPV." },
      { property: "og:title", content: "Launch a new fund or SPV | Harmonious" },
      { property: "og:description", content: "A guided form that follows Harmonious Fund Setup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewFundRequest,
});

function NewFundRequest() {
  const { draft } = Route.useSearch();
  const { data, clientId } = useClientPortal();
  const id = clientId ?? ((data?.client as any)?.id as string | undefined) ?? null;
  return <FundRequestEngine clientId={id} draft={draft} mode="client" />;
}
