import { createFileRoute } from "@tanstack/react-router";

import { ActivityPanel } from "@/components/activity-panel";
import { PaymentsBoard } from "@/components/payments-board";
import { RaisePaymentCard } from "@/components/raise-payment-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/money")({
  head: () => ({
    meta: [
      { title: "Wires and distributions | Harmonious" },
      {
        name: "description",
        content:
          "Raise, verify and dual-approve fund wires and investor distributions, with supporting paperwork and a full audit trail.",
      },
      { property: "og:title", content: "Wires and distributions | Harmonious" },
      {
        property: "og:description",
        content:
          "Money movement gated by each client's statement of work, with two approvals and a complete record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MoneyMovement,
});

function MoneyMovement() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Wires and distributions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Harmonious facilitates payments on written instruction from the client. It does not hold
        client or investor money as a bank, custodian, escrow agent or trustee. Every movement is
        checked against the client's active statement of work, verified, cleared by compliance and
        approved by two authorised people.
      </p>

      <Tabs defaultValue="wires" className="mt-6">
        <TabsList>
          <TabsTrigger value="wires">Wires</TabsTrigger>
          <TabsTrigger value="distributions">Distributions</TabsTrigger>
          <TabsTrigger value="activity">Audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="wires" className="mt-6 space-y-6">
          <RaisePaymentCard kind="wire" />
          <PaymentsBoard purposes={["expense", "fee", "transfer", "other"]} />
        </TabsContent>

        <TabsContent value="distributions" className="mt-6 space-y-6">
          <RaisePaymentCard kind="distribution" />
          <PaymentsBoard purposes={["distribution", "return_of_capital"]} />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivityPanel
            areas={["payment"]}
            title="Money movement history"
            description="Who raised, checked, approved, paused or rejected each payment, when, and what changed."
            limit={100}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
