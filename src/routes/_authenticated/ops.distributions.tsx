import { createFileRoute } from "@tanstack/react-router";

import { ActivityPanel } from "@/components/activity-panel";
import { DistributionsWorkspace } from "@/components/distributions-workspace";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/ops/distributions")({
  head: () => ({
    meta: [
      { title: "Distributions and payments — Harmonious operations" },
      {
        name: "description",
        content:
          "Prepare, review, approve, send and reconcile fund distributions, withholding and outbound payments.",
      },
      { property: "og:title", content: "Distributions and payments — Harmonious operations" },
      {
        property: "og:description",
        content:
          "Outbound money moves only after verified destinations, two approvals, bank confirmation and posted accounting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpsDistributions,
});

function OpsDistributions() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Distributions and payments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Part of capital and banking. Each investor's share comes from the fund's approved economics,
        withholding comes from their tax documentation, and a payment counts as made only once the
        bank confirms it and the accounting posts.
      </p>

      <Tabs defaultValue="workspace" className="mt-6">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="activity">Audit trail</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="mt-6">
          <DistributionsWorkspace />
        </TabsContent>
        <TabsContent value="activity" className="mt-6">
          <ActivityPanel
            areas={["payment"]}
            title="Distribution history"
            description="Who proposed, approved, released, reconciled and posted each payment, and when."
            limit={100}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
