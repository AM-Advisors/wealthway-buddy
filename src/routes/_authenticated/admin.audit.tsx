import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AuditLogTable } from "@/components/audit-log-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listAuditFunds,
  listDistributionAudit,
  listFilingAudit,
  listHoldAudit,
  listInvestorCheckAudit,
  listMoneyAudit,
  listScopeAudit,
} from "@/lib/audit-log.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Harmonious" },
      {
        name: "description",
        content:
          "A read-only trail of wires, distributions, investor checks, filings, compliance holds and scope changes with timestamps.",
      },
      { property: "og:title", content: "Audit log — Harmonious" },
      {
        property: "og:description",
        content: "Every money movement, investor check, filing and hold recorded with who acted and when.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditLogPage,
  errorComponent: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">Audit log</h1>
      <p className="mt-2 text-muted-foreground">
        This trail could not be loaded. Refresh the page, or check that you still have Harmonious
        team access.
      </p>
    </main>
  ),
});

function AuditLogPage() {
  const loadFunds = useServerFn(listAuditFunds);
  const { data } = useQuery({
    queryKey: ["audit-funds"],
    queryFn: () => loadFunds(),
    retry: false,
  });
  const funds = (data?.funds ?? []) as { id: string; name: string }[];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          A read-only record of what happened, who did it and when. Entries report what Harmonious
          recorded and each provider's outcome — they are not legal or regulatory determinations.
        </p>
      </header>

      <Tabs defaultValue="money">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="money">Money movement</TabsTrigger>
          <TabsTrigger value="distributions">Distributions</TabsTrigger>
          <TabsTrigger value="checks">Investor checks</TabsTrigger>
          <TabsTrigger value="filings">Filings</TabsTrigger>
          <TabsTrigger value="holds">Holds</TabsTrigger>
          <TabsTrigger value="scope">Scope and fees</TabsTrigger>
        </TabsList>

        <TabsContent value="money" className="pt-4">
          <AuditLogTable
            name="money-movement"
            title="Money movement"
            description="Wire requests, investor wire confirmations, payment instructions, approvals and settled payments."
            loader={listMoneyAudit}
            funds={funds}
          />
        </TabsContent>
        <TabsContent value="distributions" className="pt-4">
          <AuditLogTable
            name="distributions"
            title="Distributions"
            description="Every distribution recorded against a fund, with the amount, date and who entered it."
            loader={listDistributionAudit}
            funds={funds}
          />
        </TabsContent>
        <TabsContent value="checks" className="pt-4">
          <AuditLogTable
            name="investor-checks"
            title="Investor checks"
            description="Identity verification, screening and accreditation records with provider outcomes and review status."
            loader={listInvestorCheckAudit}
            funds={funds}
          />
        </TabsContent>
        <TabsContent value="filings" className="pt-4">
          <AuditLogTable
            name="filings"
            title="Filings and compliance items"
            description="Each fund's compliance item with its status, due date, filing date, owner and reference."
            loader={listFilingAudit}
            funds={funds}
          />
        </TabsContent>
        <TabsContent value="holds" className="pt-4">
          <AuditLogTable
            name="holds"
            title="Compliance holds"
            description="Every hold placed and cleared, with what was paused, the reason and who acted."
            loader={listHoldAudit}
            funds={funds}
          />
        </TabsContent>
        <TabsContent value="scope" className="pt-4">
          <AuditLogTable
            name="scope-and-fees"
            title="Scope and fees"
            description="Changes to contracted scope, pricing, statements of work, service requests and condition clearances."
            loader={listScopeAudit}
            funds={funds}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
