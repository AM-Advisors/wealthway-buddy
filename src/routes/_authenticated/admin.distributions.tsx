import { createFileRoute } from "@tanstack/react-router";

import { ActivityPanel } from "@/components/activity-panel";
import { DistributionsWorkspace } from "@/components/distributions-workspace";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/distributions")({
  head: () => ({
    meta: [
      { title: "Distributions and payments | Harmonious" },
      {
        name: "description",
        content:
          "Propose, approve, release and reconcile investor distributions, withholding and outbound payments with a complete audit trail.",
      },
      { property: "og:title", content: "Distributions and payments | Harmonious" },
      {
        property: "og:description",
        content:
          "Outbound money moves only after verified destinations, two approvals, bank confirmation and posted accounting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DistributionsPage,
});

function DistributionsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Distributions and payments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Each investor's share is calculated from the fund's approved economics, withholding is
        determined from their tax documentation, and a payment is only treated as made once the bank
        confirms it and the accounting posts.
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
