import { createFileRoute, Link } from "@tanstack/react-router";
import { FundOperations } from "@/components/fund-operations";
import { ManagerWireBoard } from "@/components/manager-wire-board";
import { ClosingDesk } from "@/components/manager-closing-desk";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VIEWS = ["activity", "wires", "closing"] as const;
type View = (typeof VIEWS)[number];

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/transactions")({
  validateSearch: (search: Record<string, unknown>): { view?: View | undefined } => ({
    view: VIEWS.includes(search["view"] as View) ? (search["view"] as View) : undefined,
  }),
  head: () => ({ meta: [
    { title: "Fund transactions | Harmonious" }, { name: "description", content: "Track incoming wires, payments, closings, bank activity, and transaction exceptions." },
    { property: "og:title", content: "Fund transactions | Harmonious" }, { property: "og:description", content: "Track incoming wires, payments, closings, and transaction exceptions." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});

function Page() {
  const { fundId } = Route.useParams();
  const { view = "activity" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl">Capital</h2><p className="mt-1 text-sm text-muted-foreground">Incoming capital, wire approvals and closings for this fund.</p></div>
      <Button asChild size="sm" variant="outline"><Link to="/manager/fund/$fundId/banking" params={{ fundId }}>Banking</Link></Button>
    </div>
    <Tabs value={view} onValueChange={(v) => navigate({ search: { view: v === "activity" ? undefined : (v as View) }, resetScroll: false })}>
      <TabsList>
        <TabsTrigger value="activity">Capital activity</TabsTrigger>
        <TabsTrigger value="wires">Wire approvals</TabsTrigger>
        <TabsTrigger value="closing">Closing desk</TabsTrigger>
      </TabsList>
      <TabsContent value="activity" className="mt-4"><FundOperations offeringId={fundId} /></TabsContent>
      <TabsContent value="wires" className="mt-4"><ManagerWireBoard fundId={fundId} /></TabsContent>
      <TabsContent value="closing" className="mt-4"><ClosingDesk fundId={fundId} /></TabsContent>
    </Tabs>
  </section>;
}
