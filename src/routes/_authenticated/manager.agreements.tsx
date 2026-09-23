import { createFileRoute } from "@tanstack/react-router";

import { AgreementPreparation } from "@/components/agreement-preparation";
import { AgreementsPipeline } from "@/components/agreements-pipeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/manager/agreements")({
  head: () => ({
    meta: [
      { title: "Agreements — Harmonious fund manager" },
      {
        name: "description",
        content:
          "Prepare fund agreements for signature, choose the required signers and follow every signature through to execution.",
      },
      { property: "og:title", content: "Agreements — Harmonious" },
      {
        property: "og:description",
        content: "Prepare, send and monitor fund agreements without leaving Harmonious.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerAgreements,
});

function ManagerAgreements() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Agreements</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Prepare an agreement for signature and follow it through to execution. Investors only ever
        review and sign — they never place signing fields, and only the signing provider&apos;s own
        confirmation marks an agreement executed.
      </p>

      <Tabs defaultValue="prepare" className="mt-6">
        <TabsList>
          <TabsTrigger value="prepare">Prepare</TabsTrigger>
          <TabsTrigger value="pipeline">Signing progress</TabsTrigger>
        </TabsList>
        <TabsContent value="prepare" className="mt-6">
          <AgreementPreparation />
        </TabsContent>
        <TabsContent value="pipeline" className="mt-6">
          <AgreementsPipeline />
        </TabsContent>
      </Tabs>
    </main>
  );
}
