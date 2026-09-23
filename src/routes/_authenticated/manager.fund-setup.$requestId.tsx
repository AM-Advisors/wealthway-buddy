import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getFundSetupTracker } from "@/lib/self-service.functions";
import { MILESTONES } from "@/lib/self-service-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/manager/fund-setup/$requestId")({
  head: () => ({
    meta: [
      { title: "Fund setup — Harmonious" },
      { name: "description", content: "Track each milestone while Harmonious sets up your fund or SPV." },
      { property: "og:title", content: "Fund setup — Harmonious" },
      { property: "og:description", content: "Track each milestone while Harmonious sets up your fund or SPV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Tracker,
});

const tone = (s: string) => (s === "Complete" ? "default" : s === "Waiting on you" ? "destructive" : "secondary") as any;

function Tracker() {
  const { requestId } = Route.useParams();
  const load = useServerFn(getFundSetupTracker);
  const q = useQuery({ queryKey: ["fund-setup-tracker", requestId], queryFn: () => load({ data: { requestId } }) });
  if (q.isLoading) return <main className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  if (!q.data) return <main className="mx-auto max-w-2xl px-4 py-10"><h1 className="text-2xl">Fund setup</h1><p className="mt-2 text-sm text-muted-foreground">This request isn't available to your account.</p></main>;
  const r = q.data;
  const rows = r.milestones ?? MILESTONES.map((m) => ({ key: m.key, label: m.label, state: "Harmonious is working on it" as const }));
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="text-xs font-medium uppercase text-muted-foreground">Fund setup</p>
      <h1 className="mt-1 break-words text-2xl">Setting up {r.fundName}</h1>
      <div className="mt-2"><Badge variant="outline">{r.lifecycle}</Badge></div>
      {!r.milestones && <p className="mt-3 text-sm text-muted-foreground">Harmonious is reviewing your request and will contact you about the offering structure.</p>}
      <Card className="mt-6"><CardContent className="divide-y p-0">
        {rows.map((m) => (
          <div key={m.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="font-medium">{m.label}</span><Badge variant={tone(m.state)}>{m.state}</Badge>
          </div>
        ))}
      </CardContent></Card>
      <div className="mt-6 flex flex-wrap gap-2">
        {r.offeringId && <Button asChild><Link to="/manager/fund/$fundId" params={{ fundId: r.offeringId }}>Manage Fund</Link></Button>}
        <Button asChild variant="outline"><Link to="/manager">Back to Your Funds</Link></Button>
      </div>
    </main>
  );
}
