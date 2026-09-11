import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { ClientIntakeGate } from "@/components/client-intake-gate";
import { ClientSowPanel } from "@/components/client-sow-panel";
import { ClientDashboard } from "@/components/client-dashboard";
import { getClientPortal } from "@/lib/client-portal.functions";
import { ClientInvoicesPanel } from "@/components/client-invoices-panel";
import { ClientPaymentsPanel } from "@/components/client-payments-panel";
import { ClientWireRequestsPanel } from "@/components/client-wire-requests-panel";
import { MyServiceRequests } from "@/components/service-request-signing";
import { ClientOffboardingPanel } from "@/components/client-offboarding-panel";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/client")({
  head: () => ({
    meta: [
      { title: "Client Portal — Harmonious" },
      {
        name: "description",
        content:
          "Your Harmonious client portal: the funds we administer for you, your statement of work, what it covers, your invoices and approved payments.",
      },
      { property: "og:title", content: "Client Portal — Harmonious" },
      {
        property: "og:description",
        content: "Funds, statement of work, invoices and approved payments in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientPortalPage,
});

function ClientPortalPage() {
  return (
    <ClientIntakeGate>
      <ClientPortal />
    </ClientIntakeGate>
  );
}

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US") : "—";

const PAYMENT_LABEL: Record<string, string> = {
  approved: "Approved",
  sent: "Sent",
  released: "Released",
  settled: "Settled",
  completed: "Completed",
};

function ClientPortal() {
  const load = useServerFn(getClientPortal);
  const [clientId, setClientId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-portal", clientId],
    queryFn: () => load({ data: { clientId } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading your engagement…</p>
      </main>
    );
  }

  if (!data?.client) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl">Client portal</h1>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">No client engagement linked yet</CardTitle>
            <CardDescription>
              This portal shows the funds, agreement, invoices and approved payments for a
              Harmonious client. Your sign-in isn't attached to one yet — ask your Harmonious
              contact to add you.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const client = data.client as any;
  const clients = (data.clients ?? []) as any[];
  const funds = (data.funds ?? []) as any[];
  const sows = (data.sows ?? []) as any[];
  const services = (data.services ?? []) as any[];
  const payments = (data.payments ?? []) as any[];
  const openInvoices = (data.invoices ?? []).filter((i: any) => i.status === "issued");
  const paymentsInProgress = payments.filter(
    (p: any) => !["settled", "completed", "cancelled", "canceled", "rejected"].includes(String(p.status)),
  ).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{client.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Harmonious engagement: the funds we administer for you, what your agreement covers,
            your invoices and payments already approved.
          </p>
        </div>
        {clients.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {clients.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={c.id === client.id ? "default" : "outline"}
                onClick={() => setClientId(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Funds</CardDescription>
            <CardTitle className="text-2xl">{funds.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Invoices awaiting payment</CardDescription>
            <CardTitle className="text-2xl">{openInvoices.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Payments in progress</CardDescription>
            <CardTitle className="text-2xl">{paymentsInProgress}</CardTitle>
          </CardHeader>
        </Card>

      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="funds">Funds</TabsTrigger>
          <TabsTrigger value="agreement">Agreement &amp; scope</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="wires">Wire requests</TabsTrigger>

        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <ClientDashboard
            funds={funds}
            invoices={(data.invoices ?? []) as any[]}
            payments={payments as any[]}
            wireRequests={(data.wireRequests ?? []) as any[]}
            serviceRequests={((data as any).serviceRequests ?? []) as any[]}
            services={services as any[]}
          />
        </TabsContent>

        <TabsContent value="funds" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funds we administer for you</CardTitle>
              <CardDescription>
                Harmonious provides administration, technology, onboarding, reporting, payment
                facilitation and recordkeeping support for these funds.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {funds.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No funds are attached to your engagement yet.
                </p>
              )}
              {funds.map((f) => (
                <div key={f.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.legal_entity_name ? `${f.legal_entity_name} · ` : ""}
                        {f.reg_type ? `Reg D ${f.reg_type}` : "Exemption not recorded"}
                        {f.target_raise_cents
                          ? ` · target ${money(Number(f.target_raise_cents))}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant={f.is_open ? "default" : "secondary"}>
                      {f.is_open ? "Open" : "Closed"}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agreement" className="mt-6 space-y-6">
          <ClientSowPanel sows={sows as any} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Included in your scope</CardTitle>
              <CardDescription>
                Anything not listed here isn't currently included in your active scope. You can ask
                for it below and Harmonious will confirm the fee and paperwork first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {services.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No services are recorded against your scope yet.
                </p>
              )}
              {services.map((s: any) => (
                <div key={`${s.key}-${s.offeringId ?? "client"}`} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{s.name}</p>
                  {s.description && (
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.offeringId ? "Fund-specific" : "Applies across your engagement"}
                    {s.effectiveDate ? ` · from ${date(s.effectiveDate)}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <MyServiceRequests />
          <ClientOffboardingPanel />
        </TabsContent>

        <TabsContent value="invoices" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button asChild size="sm">
              <Link to="/client/invoices">View and pay invoices</Link>
            </Button>
          </div>
          <ClientInvoicesPanel />
          {(data.invoices ?? []).length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Invoices</CardTitle>
                <CardDescription>
                  Nothing has been invoiced yet. Issued invoices appear here for your approval.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <ClientPaymentsPanel payments={payments} />
        </TabsContent>

        <TabsContent value="wires" className="mt-6">
          <ClientWireRequestsPanel
            requests={(data.wireRequests ?? []) as any[]}
            funds={funds}
            canRequest={!!(data as any).canRequestWire}
          />
        </TabsContent>
      </Tabs>


      <p className="mt-8 text-xs text-muted-foreground">
        Harmonious provides administrative, technology, onboarding, reporting, payment-facilitation,
        recordkeeping and compliance-support services under your master service agreement and
        statements of work. Harmonious is not your investment adviser, broker-dealer, custodian,
        transfer agent, escrow agent, auditor, accountant, tax preparer or legal counsel unless a
        statement of work expressly says so.
      </p>
    </main>
  );
}
