import { createFileRoute } from "@tanstack/react-router";
import { AmPage, RenewalList, useAmDashboard } from "@/components/account-management-ui";

export const Route = createFileRoute("/_authenticated/account-manager_/renewals")({
  head: () => ({
    meta: [
      { title: "Renewals & expansion - Harmonious" },
      { name: "description", content: "SOWs ending in the next 90 days, flagged for a renewal conversation." },
      { property: "og:title", content: "Renewals & expansion - Harmonious" },
      { property: "og:description", content: "Upcoming SOW renewals for Account Managers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Renewals,
});

function Renewals() {
  const q = useAmDashboard();
  return (
    <AmPage title="Renewals & expansion" intro="SOWs ending within 90 days. These are prompts for a conversation; nothing renews or sells automatically.">
      {q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : !q.data ? <p className="text-sm text-muted-foreground">Loading…</p> : <section className="rounded-lg border bg-card p-4"><RenewalList rows={q.data.renewals} /></section>}
    </AmPage>
  );
}
