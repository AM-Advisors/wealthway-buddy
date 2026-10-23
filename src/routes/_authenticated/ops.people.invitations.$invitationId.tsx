import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInvitationInsight } from "@/lib/user-access.functions";
import { UserInsights } from "@/components/user-insights";
export const Route = createFileRoute("/_authenticated/ops/people/invitations/$invitationId")({
  validateSearch: (s: Record<string, unknown>) => ({ source: typeof s["source"] === "string" ? s["source"] : "fund_invitations" }),
  head: () => ({ meta: [{ title: "Invitation history | Harmonious" }, { name: "description", content: "Review invitation sends, email outcomes and account progress." }, { property: "og:title", content: "Invitation history | Harmonious" }, { property: "og:description", content: "Invitation and login history for an invited Harmonious user." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: InvitationPage,
});
function InvitationPage() {
  const { invitationId } = Route.useParams(); const { source } = Route.useSearch();
  const load = useServerFn(getInvitationInsight);
  const q = useQuery({ queryKey: ["invitation-insight", source, invitationId], queryFn: () => load({ data: { id: invitationId, source } }), retry: false });
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8"><Link to="/ops/people-access" search={{ tab: "others" }} className="text-sm text-primary hover:underline">← People & Access</Link>{q.isPending && <p>Loading invitation…</p>}{q.error && <p className="text-destructive">{(q.error as Error).message}</p>}{q.data && <><header><h1 className="text-2xl font-semibold">{q.data.name || q.data.email}</h1><p className="text-muted-foreground">{q.data.email}</p></header><UserInsights email={q.data.email} /></>}</main>;
}