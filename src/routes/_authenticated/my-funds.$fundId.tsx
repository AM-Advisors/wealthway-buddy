import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvestorFundView } from "@/lib/my-funds.functions";

export const Route = createFileRoute("/_authenticated/my-funds/$fundId")({
  head: () => ({
    meta: [
      { title: "Fund — Harmonious" },
      { name: "description", content: "Your investment in this fund, with the documents and activity available to you." },
      { property: "og:title", content: "Fund — Harmonious" },
      { property: "og:description", content: "Your view of a fund you invest in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestorFundPage,
});

const money = (c: number | null | undefined) => (c == null ? "—" : `$${Math.round(c / 100).toLocaleString("en-US")}`);

function InvestorFundPage() {
  const { fundId } = Route.useParams();
  const load = useServerFn(getInvestorFundView);
  const q = useQuery({ queryKey: ["investor-fund", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const v = q.data!;
  return (
    <div className="space-y-6">
      <div>
        <Link to="/my-funds" className="text-xs text-muted-foreground hover:underline">← My Funds</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{String(v.fund.name ?? "Fund")}</h1>
        <p className="text-sm text-muted-foreground">{v.fund.typeLabel}</p>
      </div>
      {v.fund.public_summary || v.fund.summary ? (
        <Card><CardContent className="py-4 text-sm">{String(v.fund.public_summary ?? v.fund.summary)}</CardContent></Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your investment</CardTitle>
          <CardDescription>Only your own investment is shown here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {v.myInvestments.length === 0 ? <p className="text-muted-foreground">No investment on record yet.</p> : v.myInvestments.map((p: any) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <span>{p.kind === "application" ? `Application · commitment ${money(p.commitment_cents)}` : p.display_name ?? "Position"}</span>
              <Badge variant="outline">{String(p.status ?? "—").replace(/_/g, " ")}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Documents, reports & tax</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link to="/documents" className="text-primary underline">Documents</Link>
          <Link to="/investor-reporting" className="text-primary underline">Reports & statements</Link>
          <Link to="/tax" className="text-primary underline">Tax documents</Link>
          <Link to="/activity" className="text-primary underline">Capital activity</Link>
        </CardContent>
      </Card>
    </div>
  );
}
