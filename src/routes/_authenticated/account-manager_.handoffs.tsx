import { createFileRoute } from "@tanstack/react-router";
import { AmPage, HandoffList, useAmDashboard } from "@/components/account-management-ui";

export const Route = createFileRoute("/_authenticated/account-manager_/handoffs")({
  head: () => ({
    meta: [
      { title: "New client hand-offs - Harmonious" },
      { name: "description", content: "Clients who signed their SOW in the last 30 days and their fund setup status." },
      { property: "og:title", content: "New client hand-offs - Harmonious" },
      { property: "og:description", content: "Signed clients moving from Sales into setup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Handoffs,
});

function Handoffs() {
  const q = useAmDashboard();
  return (
    <AmPage title="New client hand-offs" intro="Clients who signed in the last 30 days, the draft fund created for them, and whether setup has started.">
      {q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : !q.data ? <p className="text-sm text-muted-foreground">Loading…</p> : <section className="rounded-lg border bg-card p-4"><HandoffList rows={q.data.handoffs} /></section>}
    </AmPage>
  );
}
