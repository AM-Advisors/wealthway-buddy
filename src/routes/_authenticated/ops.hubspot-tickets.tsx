import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getOpsTickets, importOpsTickets, resolveOpsTicket, searchFundsForTicket } from "@/lib/hubspot-ops-tickets.functions";

export const Route = createFileRoute("/_authenticated/ops/hubspot-tickets")({
  head: () => ({
    meta: [
      { title: "HubSpot Operations tickets — Harmonious" },
      { name: "description", content: "HubSpot Operations tickets imported as Harmonious fund records and service requests, with their pipeline steps." },
      { property: "og:title", content: "HubSpot Operations tickets — Harmonious" },
      { property: "og:description", content: "Fund work and service requests imported from HubSpot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, string> = { linked: "Linked to existing fund", created: "Draft fund created", needs_review: "Needs review", service_request: "Service request", dismissed: "Dismissed" };

function Page() {
  const fetchFn = useServerFn(getOpsTickets);
  const importFn = useServerFn(importOpsTickets);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hubspot-ops-tickets"], queryFn: () => fetchFn() });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"fund" | "service_request" | "review">("fund");
  const rows = (q.data?.tickets ?? []) as any[];

  const shown = useMemo(() => rows.filter((r) => tab === "review" ? r.status === "needs_review" : r.kind === tab && r.status !== "needs_review"), [rows, tab]);
  const byStage = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of shown) { const k = r.stage_label ?? "No step"; m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()].sort((a, b) => (a[1][0].stage_order ?? 99) - (b[1][0].stage_order ?? 99));
  }, [shown]);

  async function run() {
    setBusy(true);
    try {
      const r = await importFn();
      toast.success(`Imported ${r.tickets - r.skipped} tickets: ${r.linked} linked, ${r.created} new draft funds, ${r.needsReview} to review, ${r.serviceRequests} service requests.`);
      qc.invalidateQueries({ queryKey: ["hubspot-ops-tickets"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const count = (f: (r: any) => boolean) => rows.filter(f).length;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">HubSpot Operations tickets</h1>
          <p className="text-sm text-muted-foreground">Fund tickets become fund records in setup; questions and services become service requests. Each keeps its HubSpot step.</p>
        </div>
        {q.data?.canManage && <Button onClick={run} disabled={busy}>{busy ? "Importing… (a few minutes)" : rows.length ? "Import new tickets" : "Import from HubSpot"}</Button>}
      </div>
      <div className="flex gap-2">
        {([["fund", `Funds (${count((r) => r.kind === "fund" && r.status !== "needs_review")})`], ["review", `Needs review (${count((r) => r.status === "needs_review")})`], ["service_request", `Service requests (${count((r) => r.kind === "service_request")})`]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!q.isLoading && !rows.length && <p className="text-sm text-muted-foreground">Nothing imported yet.</p>}
      {byStage.map(([stage, list]) => (
        <section key={stage} className="rounded-lg border bg-card">
          <header className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="font-medium">{stage}</h2>
            <span className="text-xs text-muted-foreground">{list.length}{list[0].stage_closed ? " · closed step" : ""}</span>
          </header>
          <ul className="divide-y">{list.map((r) => <Row key={r.id} r={r} canManage={!!q.data?.canManage} clients={q.data?.clients ?? []} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function Row({ r, canManage, clients }: { r: any; canManage: boolean; clients: { id: string; name: string }[] }) {
  const resolveFn = useServerFn(resolveOpsTicket);
  const searchFn = useServerFn(searchFundsForTicket);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string>(r.client_id ?? "");
  const [name, setName] = useState<string>(r.subject.replace(/^client:\s*/i, ""));
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);

  async function act(action: "create" | "link" | "dismiss", offeringId?: string) {
    try {
      await resolveFn({ data: { id: r.id, action, clientId: clientId || undefined, offeringId, name } });
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["hubspot-ops-tickets"] });
    } catch (e) { toast.error((e as Error).message.replace(/^EXISTING_FUND:[^:]+:|^SIMILAR_FUND:/, "")); }
  }

  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{r.subject}</div>
          <div className="text-xs text-muted-foreground">
            {[r.client_name ?? (r.company_names?.join(", ") || null), r.owner_name && `HubSpot owner: ${r.owner_name}`, r.hubspot_updated_at && `updated ${new Date(r.hubspot_updated_at).toLocaleDateString()}`].filter(Boolean).join(" · ")}
          </div>
          {r.review_reason && <div className="text-xs text-destructive">{r.review_reason}</div>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={r.status === "needs_review" ? "destructive" : "secondary"}>{STATUS[r.status] ?? r.status}</Badge>
          {r.offering_id && <Link to="/ops/fund-setup/$fundId" params={{ fundId: r.offering_id }} className="text-xs underline">Open {r.fund_name ?? "fund"}</Link>}
          {canManage && r.status === "needs_review" && <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>Resolve</Button>}
        </div>
      </div>
      {open && (
        <div className="grid gap-3 rounded-md bg-muted/40 p-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-medium">Create a new draft fund</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fund name" />
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Pick client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button size="sm" onClick={() => act("create")}>Create draft fund</Button>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium">Or link to an existing fund</div>
            <Input value={search} onChange={async (e) => { setSearch(e.target.value); setHits(e.target.value.length > 1 ? await searchFn({ data: { q: e.target.value } }) : []); }} placeholder="Search funds" />
            <div className="space-y-1">{hits.map((h) => <Button key={h.id} size="sm" variant="ghost" className="w-full justify-start" onClick={() => act("link", h.id)}>{h.name}</Button>)}</div>
            <Button size="sm" variant="ghost" onClick={() => act("dismiss")}>Not a fund — dismiss</Button>
          </div>
        </div>
      )}
    </li>
  );
}
