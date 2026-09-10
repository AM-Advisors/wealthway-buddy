import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ClientPricingBoard } from "@/components/client-pricing-board";
import { HoldsBoard } from "@/components/holds-board";
import { PricingCatalogBoard } from "@/components/pricing-catalog-board";
import { ProvidersBoard } from "@/components/providers-board";
import { ServiceRequestsBoard } from "@/components/service-requests-board";
import { SowEditor } from "@/components/sow-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPricingBoard } from "@/lib/contracts.functions";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing and agreements — Harmonious" },
      {
        name: "description",
        content:
          "Edit the Harmonious rate card, contracted client rates and statements of work without a code change.",
      },
      { property: "og:title", content: "Pricing and agreements — Harmonious" },
      {
        property: "og:description",
        content: "Rate card versions, contracted client rates and engagement terms in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingConsole,
});

function PricingConsole() {
  const load = useServerFn(getPricingBoard);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pricing-board"],
    queryFn: () => load(),
    retry: false,
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading pricing and agreements…</div>;
  }
  if (isError || !data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {(error as any)?.message ?? "This area isn't available to you."}
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing and agreements</h1>
        <p className="text-sm text-muted-foreground">
          {data.canManage
            ? "Change fees and engagement terms here. Every change is recorded with who made it."
            : "Read-only. Changing fees or engagement terms needs legal, compliance, finance, client success or admin authority."}
        </p>
      </header>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Standard rate card</TabsTrigger>
          <TabsTrigger value="clients">Client rates</TabsTrigger>
          <TabsTrigger value="sows">Statements of work</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="pt-4">
          <PricingCatalogBoard
            versions={data.versions}
            catalog={data.catalog}
            canManage={data.canManage}
          />
        </TabsContent>
        <TabsContent value="clients" className="pt-4">
          <ClientPricingBoard
            clients={data.clients}
            clientPricing={data.clientPricing}
            sows={data.sows}
            versions={data.versions}
            canManage={data.canManage}
          />
        </TabsContent>
        <TabsContent value="sows" className="pt-4">
          <SowEditor
            clients={data.clients}
            sows={data.sows}
            funds={data.funds}
            canManage={data.canManage}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
