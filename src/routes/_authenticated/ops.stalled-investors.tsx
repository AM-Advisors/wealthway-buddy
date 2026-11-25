import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { stalledInvestorsSummary } from "@/lib/stalled-investors.functions";

const q = queryOptions({ queryKey: ["stalled-investors"], queryFn: () => stalledInvestorsSummary() });

export const Route = createFileRoute("/_authenticated/ops/stalled-investors")({
  head: () => ({
    meta: [
      { title: "Where investors are stuck | Harmonious Operations" },
      { name: "description", content: "Investments waiting 7 or more days, grouped by step and fund." },
      { property: "og:title", content: "Where investors are stuck | Harmonious Operations" },
      { property: "og:description", content: "Investments waiting 7 or more days, by step and fund." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => (context as any).queryClient.ensureQueryData(q),
  component: Page,
});

function Page() {
  const { data } = useSuspenseQuery(q);
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 text-base">
      <div>
        <h1 className="text-2xl font-semibold">Where investors are stuck</h1>
        <p className="text-muted-foreground">Investments with no activity for 7 or more days. Test investors are not counted.</p>
      </div>
      <Card><CardContent className="divide-y p-0">
        {data.stages.map((s) => (
          <div key={s.stage} className="flex items-center justify-between p-4">
            <span>{s.label}</span>
            <span><strong>{s.stalled}</strong> stuck <span className="text-muted-foreground">of {s.total}</span></span>
          </div>
        ))}
        {data.stages.length === 0 && <p className="p-4">Nobody is waiting.</p>}
      </CardContent></Card>
      <h2 className="text-xl font-semibold">What's left, per investor</h2>
      <p className="text-muted-foreground">What each stuck investor still needs before they can sign. Longest waiting first.</p>
      <div className="space-y-3">
        {data.people.map((p) => (
          <Card key={p.id}><CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <a href={`/investment/${p.id}`} className="text-lg font-medium underline">{p.name}</a>
              <span className="text-muted-foreground">{p.fund} · last activity {new Date(p.lastActivityAt).toLocaleDateString()}</span>
            </div>
            {p.left.length === 0
              ? <p>Nothing left before signing. Waiting on signing, money or countersignature.</p>
              : <ul className="list-disc space-y-1 pl-5">{p.left.map((l) => <li key={l}>{l}</li>)}</ul>}
          </CardContent></Card>
        ))}
        {data.people.length === 0 && <p>Nobody is waiting.</p>}
      </div>
      <h2 className="text-xl font-semibold">By fund</h2>
      <Card><CardContent className="divide-y p-0">
        {data.funds.map((f) => (
          <div key={f.id} className="flex items-center justify-between p-4">
            <Link to="/ops/funds" className="underline">{f.name}</Link>
            <span><strong>{f.stalled}</strong> stuck</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
