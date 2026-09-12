import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ClientDashboard } from "@/components/client-dashboard";
import { useClientPortal } from "@/components/client-portal-context";
import { getClientRecords } from "@/lib/client-records.functions";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/client/")({
  head: () => ({
    meta: [
      { title: "Portal overview — Harmonious" },
      {
        name: "description",
        content:
          "Your funds, pending requests, approved fees, invoices and payments with Harmonious at a glance.",
      },
      { property: "og:title", content: "Portal overview — Harmonious" },
      {
        property: "og:description",
        content: "Fund status, pending requests, approved fees and payments in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientOverviewPage,
});

function ClientOverviewPage() {
  const { data, clientId } = useClientPortal();
  const loadRecords = useServerFn(getClientRecords);
  const activeClientId = clientId ?? ((data?.client as any)?.id as string | undefined) ?? null;
  const { data: records } = useQuery({
    queryKey: ["client-records", activeClientId],
    queryFn: () => loadRecords({ data: { clientId: activeClientId } }),
    retry: false,
  });

  const funds = (data?.funds ?? []) as any[];
  const invoices = (data?.invoices ?? []) as any[];
  const payments = (data?.payments ?? []) as any[];
  const openInvoices = invoices.filter((i: any) => i.status === "issued");
  const paymentsInProgress = payments.filter(
    (p: any) =>
      !["settled", "completed", "cancelled", "canceled", "rejected"].includes(String(p.status)),
  ).length;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
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

      <div className="mt-6">
        <ClientDashboard
          funds={funds}
          invoices={invoices}
          payments={payments}
          wireRequests={(data?.wireRequests ?? []) as any[]}
          serviceRequests={((data as any)?.serviceRequests ?? []) as any[]}
          services={(data?.services ?? []) as any[]}
          sows={(data?.sows ?? []) as any[]}
          signedDocuments={(records?.signedDocuments ?? []) as any[]}
          statements={(records?.statements ?? []) as any[]}
        />
      </div>
    </div>
  );
}
