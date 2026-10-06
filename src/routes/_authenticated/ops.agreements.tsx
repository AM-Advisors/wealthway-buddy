import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listAgreementQueue, askSalesAboutAgreement } from "@/lib/agreements-admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/ops/agreements")({
  head: () => ({ meta: [
    { title: "My client agreements - Harmonious" },
    { name: "description", content: "Read-only MSAs and SOWs for the clients and funds you're assigned to." },
    { property: "og:title", content: "My client agreements - Harmonious" },
    { property: "og:description", content: "See what each agreement covers and what it means for your funds." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Page,
});

const STAGE: Record<string, string> = { draft: "Draft", in_review: "Awaiting client signature", client_signed: "Awaiting Harmonious countersignature", executed: "Active", amended: "Amended" };

function followUp(a: any): string | null {
  if (a.executedAt || a.legacyActivation) return null;
  if (a.openChanges) return `${a.openChanges} open change request${a.openChanges === 1 ? "" : "s"}`;
  if (a.stage === "in_review") return "Waiting on client signature";
  if (a.stage === "client_signed") return "Waiting on Harmonious countersignature";
  return "Not sent yet";
}

function Page() {
  const load = useServerFn(listAgreementQueue);
  const q = useQuery({ queryKey: ["agreement-queue"], queryFn: () => load(), retry: false });
  const [search, setSearch] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const rows = useMemo(() => (q.data?.agreements ?? []).filter((a: any) => !search || `${a.clientName} ${a.title} ${a.funds.map((f: any) => f.name).join(" ")}`.toLowerCase().includes(search.toLowerCase())), [q.data, search]);
  const pending = rows.filter((a: any) => !a.executedAt).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Client agreements</h1>
        <p className="text-sm text-muted-foreground">
          MSAs and SOWs are owned and sent by Sales. {q.data?.access.scoped ? "You see the ones for clients and funds you're assigned to." : "You can see every agreement."} An unsigned agreement is a follow-up item; it never stops fund or investor work.
        </p>
        {q.data?.access.canManage && <Link to="/admin/agreements" className="text-sm text-primary underline">Manage agreements in Sales →</Link>}
      </header>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && (<>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Agreements" value={rows.length} />
          <Stat label="Signed by both" value={rows.length - pending} />
          <Stat label="Need follow-up" value={pending} />
        </div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client, agreement or fund" aria-label="Search agreements" className="max-w-sm" />
        {!rows.length && <p className="text-sm text-muted-foreground">No agreements for your clients yet.</p>}
        <div className="space-y-3">
          {rows.map((a: any) => (
            <article key={a.id} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto min-w-0">
                  <div className="font-medium text-foreground">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.clientName}{a.effectiveDate ? ` · effective ${a.effectiveDate}` : ""}{a.pricingVersion ? ` · pricing ${a.pricingVersion}` : ""}</div>
                </div>
                <Badge variant={a.executedAt ? "default" : "secondary"}>{a.legacyActivation ? "Active before two-party signing" : STAGE[a.stage] ?? a.stage}</Badge>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Funds covered: </span>
                {a.funds.length ? a.funds.map((f: any) => <Badge key={f.id} variant="outline" className="mr-1">{f.name}</Badge>) : <span className="text-muted-foreground">None linked yet. Fund work isn't blocked, but Sales should add the fund.</span>}
              </div>
              {followUp(a) && <p className="text-sm text-foreground">Follow-up: {followUp(a)}{a.salesOwnerId ? "" : " · no Sales owner assigned"}</p>}
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline"><a href={`/admin/agreements?sow=${a.id}`}>View agreement</a></Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking(asking === a.id ? null : a.id)}>Ask Sales</Button>
              </div>
              {asking === a.id && <AskSales sowId={a.id} onDone={() => setAsking(null)} />}
            </article>
          ))}
        </div>
      </>)}
    </main>
  );
}

function AskSales({ sowId, onDone }: { sowId: string; onDone: () => void }) {
  const ask = useServerFn(askSalesAboutAgreement);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change, or what's missing?" aria-label="Note for Sales" />
      <Button size="sm" disabled={busy || note.trim().length < 3} onClick={async () => {
        setBusy(true);
        try { const r = await ask({ data: { sowId, note } }); toast.success(r.assigned ? "Task sent to the client's Sales owner." : "Task created for the Sales team (no owner assigned yet)."); onDone(); }
        catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
      }}>Send to Sales</Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold text-foreground">{value}</div></div>;
}
