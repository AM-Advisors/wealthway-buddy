import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { getFlows } from "@/lib/email-flows.functions";
import { TRIGGER_LABEL } from "@/routes/_authenticated/marketing_.flows_.$id";

export const Route = createFileRoute("/_authenticated/marketing_/flows")({
  head: mkHead("Follow-up flows", "Email follow-up sequences for prospects and clients, sent by each rep."),
  component: FlowsPage,
});

function FlowsPage() {
  const load = useServerFn(getFlows);
  const q = useQuery({ queryKey: ["flows"], queryFn: () => load(), retry: false });
  return (
    <MkPage title="Follow-up flows" intro="A flow is a series of emails spaced out over days. Nothing sends by itself: when a step is due, the contact's rep reviews it and clicks Send."
      actions={<Button asChild><Link to="/marketing/flows/$id" params={{ id: "new" }}>New flow</Link></Button>}>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && (q.data.length === 0 ? <p className="text-sm text-muted-foreground">No flows yet.</p> : (
        <ul className="divide-y rounded-lg border bg-card">{q.data.map((f: any) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div><Link to="/marketing/flows/$id" params={{ id: f.id }} className="font-medium hover:underline">{f.name}</Link>
              <p className="text-xs text-muted-foreground">{f.steps} steps · starts: {TRIGGER_LABEL[f.trigger_kind]}{f.trigger_stage ? ` (${f.trigger_stage.replace(/_/g, " ")})` : ""} · {f.audience === "any" ? "prospects and clients" : `${f.audience}s`}</p></div>
            <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">{f.active} active · {f.total} total</span><Badge variant={f.status === "active" ? "default" : "secondary"}>{f.status === "active" ? "On" : f.status === "paused" ? "Paused" : "Draft"}</Badge></div>
          </li>))}</ul>
      ))}
    </MkPage>
  );
}
