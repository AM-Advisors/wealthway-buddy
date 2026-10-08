import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { getSeoClusters } from "@/lib/marketing-content.functions";

export const Route = createFileRoute("/_authenticated/marketing_/seo-clusters")({
  head: mkHead("Topical authority", "Coverage, gaps, drafts and suggested articles for each Harmonious topic cluster."),
  component: Clusters,
});

function Clusters() {
  const load = useServerFn(getSeoClusters);
  const q = useQuery({ queryKey: ["seo-clusters"], queryFn: () => load() });
  const rows = (q.data ?? []) as any[];
  return (
    <MkPage title="Topical authority" intro="What Harmonious already covers per topic, where the gaps are, and what's in progress. Published articles are never changed from here."
      actions={<Button variant="outline" asChild><Link to="/marketing/content-studio">Content Studio</Link></Button>}>
      {!q.data ? <p className="text-sm text-muted-foreground">Loading…</p> : <div className="grid gap-3 md:grid-cols-2">
        {rows.map((c) => <section key={c.key} className="rounded-lg border border-border bg-card p-3 text-xs">
          <header className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{c.label}</h2>
            <span className={c.published.length ? "" : "text-destructive"}>{c.published.length ? `${c.published.length} published` : "Gap: nothing published"}</span></header>
          {c.published.map((a: any) => <div key={a.url}>Published: <a className="underline" href={a.url} target="_blank" rel="noreferrer">{a.title}</a></div>)}
          {c.unpublished.map((a: any) => <div key={a.url} className="text-muted-foreground">Classroom draft (not live): {a.title}</div>)}
          {c.drafts.map((i: any) => <div key={i.id}>Studio: <Link className="underline" to="/marketing/studio/content/$itemId" params={{ itemId: i.id }}>{i.title}</Link> ({i.status})</div>)}
          {c.suggestions.length > 0 && <div className="mt-1"><b>Suggested from research:</b><ul className="list-disc pl-4">{c.suggestions.map((s: string) => <li key={s}>{s}</li>)}</ul></div>}
          {!c.published.length && !c.unpublished.length && !c.drafts.length && !c.suggestions.length && <p className="text-muted-foreground">No coverage, drafts or ideas yet.</p>}
        </section>)}
      </div>}
    </MkPage>
  );
}
