import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FeedbackForm } from "@/components/tech/feedback-form";
import { Badge } from "@/components/ui/badge";
import { getMyFeedback } from "@/lib/tech.functions";

export const Route = createFileRoute("/_authenticated/feedback")({
  validateSearch: (s: Record<string, unknown>) => ({ from: typeof s["from"] === "string" ? s["from"] : undefined }),
  head: () => ({ meta: [
    { title: "Report a problem or suggest an idea | Harmonious" },
    { name: "description", content: "Tell Harmonious about a problem or an idea, and follow what happens to it." },
    { property: "og:title", content: "Report a problem or suggest an idea | Harmonious" },
    { property: "og:description", content: "Tell Harmonious about a problem or an idea, and follow what happens to it." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { from } = Route.useSearch();
  const load = useServerFn(getMyFeedback);
  const q = useQuery({ queryKey: ["my-feedback"], queryFn: () => load() });
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header><h1 className="text-3xl">Report a problem or suggest an idea</h1><p className="mt-2 text-base text-muted-foreground">The Harmonious team reads every report. You'll see what happens to it below.</p></header>
      <section className="rounded-xl border bg-card p-5"><FeedbackForm fromPage={from} onSent={() => q.refetch()} /></section>
      <section aria-label="My reports" className="space-y-3">
        <h2 className="text-2xl">My reports</h2>
        {q.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {q.error && <p className="text-destructive">{(q.error as Error).message}</p>}
        {q.data && !q.data.reports.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">You haven't sent anything yet.</p>}
        {q.data?.reports.map((r) => (
          <article key={r.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-lg">{r.title}</h3><Badge variant={r.status === "released" ? "default" : "secondary"}>{r.statusLabel}</Badge></div>
            <p className="mt-1 text-sm text-muted-foreground">{r.kind === "bug" ? "Problem" : "Idea"} · sent {new Date(r.createdAt).toLocaleDateString()}</p>
            {r.note && <p className="mt-2 rounded-md bg-muted/50 p-2 text-sm">{r.note}</p>}
          </article>
        ))}
      </section>
      {!!q.data?.whatsNew.length && <section aria-label="What's new" className="space-y-3">
        <h2 className="text-2xl">What's new</h2>
        {q.data.whatsNew.map((n) => <article key={n.id} className="rounded-lg border p-4"><h3 className="text-lg">{n.title}</h3><p className="text-sm text-muted-foreground">{new Date(n.publishedAt).toLocaleDateString()}</p><p className="mt-2 whitespace-pre-wrap">{n.body}</p></article>)}
      </section>}
    </main>
  );
}
