import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel, Stat } from "@/components/sales/sales-ui";
import { actOnFollowUp, enrollInFlow, getMyFollowUps, getSalesEngagement } from "@/lib/email-flows.functions";
import { getOutreachContacts } from "@/lib/sales-hub.functions";

export const Route = createFileRoute("/_authenticated/sales_/follow-ups")({
  head: () => ({
    meta: [
      { title: "Follow-ups & engagement - Harmonious Sales" },
      { name: "description", content: "Due follow-up emails and how your prospects and clients engage with Harmonious emails." },
      { property: "og:title", content: "Follow-ups & engagement - Harmonious Sales" },
      { property: "og:description", content: "Due follow-up emails and email engagement for your contacts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FollowUps,
});

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "–");

function FollowUps() {
  const loadF = useServerFn(getMyFollowUps), loadE = useServerFn(getSalesEngagement), loadC = useServerFn(getOutreachContacts);
  const act = useServerFn(actOnFollowUp), enroll = useServerFn(enrollInFlow);
  const f = useQuery({ queryKey: ["follow-ups"], queryFn: () => loadF(), retry: false });
  const e = useQuery({ queryKey: ["sales-engagement"], queryFn: () => loadE(), retry: false });
  const c = useQuery({ queryKey: ["outreach-contacts"], queryFn: () => loadC(), retry: false });
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string }>({ subject: "", body: "" });
  const [pick, setPick] = useState({ flowId: "", contactId: "" });
  const [busy, setBusy] = useState(false);

  async function doAct(id: string, action: "send" | "skip" | "stop") {
    setBusy(true);
    try { await act({ data: { enrollmentId: id, action, ...(action === "send" && open === id ? draft : {}) } }); toast.success(action === "send" ? "Sent" : action === "skip" ? "Step skipped" : "Removed from flow"); setOpen(null); f.refetch(); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  async function doEnroll() {
    try { await enroll({ data: pick }); toast.success("Added to flow"); setPick({ flowId: "", contactId: "" }); f.refetch(); } catch (err) { toast.error((err as Error).message); }
  }
  const items = (f.data?.items ?? []) as any[];
  const due = items.filter((i) => i.due && !i.flowPaused), later = items.filter((i) => !i.due || i.flowPaused);
  const eng = e.data;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header><h1 className="text-3xl">Follow-ups & engagement</h1>
        <p className="mt-2 text-sm text-muted-foreground">Follow-up emails wait for you to send them. Below, see who opened, clicked, replied to or likely forwarded Harmonious emails.</p></header>
      {(f.error || e.error) && <p className="text-sm text-destructive">{((f.error || e.error) as Error).message}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Due now" value={due.length} />
        <Stat label="Coming up" value={later.length} />
        <Stat label="Engaged contacts (90d)" value={eng?.contacts.length ?? "–"} />
        <Stat label="Likely forwarded" value={eng ? eng.contacts.filter((x: any) => x.likelyForwarded).length : "–"} hint="Estimate" />
      </div>

      <Panel title="Due follow-ups">
        {f.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : due.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due. You're caught up.</p> : (
          <ul className="divide-y">{due.map((i) => (
            <li key={i.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div><span className="font-medium">{i.contact?.full_name}</span> <span className="text-muted-foreground">{i.contact?.organization ?? ""} · {i.flow} · step {i.step?.position} of {i.total}</span>
                  <div className="text-muted-foreground">{i.step?.subject}</div></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setOpen(open === i.id ? null : i.id); setDraft({ subject: i.step?.subject ?? "", body: i.step?.body ?? "" }); }}>{open === i.id ? "Close" : "Review"}</Button>
                  <Button size="sm" disabled={busy} onClick={() => doAct(i.id, "send")}>Send</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => doAct(i.id, "skip")}>Skip</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => doAct(i.id, "stop")}>Remove</Button>
                </div>
              </div>
              {open === i.id && <div className="space-y-2 rounded-md border p-3">
                <Input value={draft.subject} onChange={(ev) => setDraft({ ...draft, subject: ev.target.value })} />
                <Textarea rows={6} value={draft.body} onChange={(ev) => setDraft({ ...draft, body: ev.target.value })} />
                <p className="text-xs text-muted-foreground">Edits apply to this send only. Replies come to your email address.</p>
              </div>}
            </li>))}</ul>
        )}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Add a contact to a flow">
          <div className="space-y-2">
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={pick.contactId} onChange={(ev) => setPick({ ...pick, contactId: ev.target.value })}>
              <option value="">Choose a contact…</option>{((c.data ?? []) as any[]).filter((x) => x.email).map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.organization ? ` · ${x.organization}` : ""}</option>)}</select>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={pick.flowId} onChange={(ev) => setPick({ ...pick, flowId: ev.target.value })}>
              <option value="">Choose a flow…</option>{((f.data?.flows ?? []) as any[]).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <Button disabled={!pick.flowId || !pick.contactId} onClick={doEnroll}>Add to flow</Button>
            {(f.data?.flows ?? []).length === 0 && <p className="text-xs text-muted-foreground">No flows are turned on yet. Marketing or a Sales leader builds them under Marketing → Follow-up flows.</p>}
          </div>
        </Panel>
        <Panel title="Coming up">
          {later.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled.</p> : (
            <ul className="divide-y text-sm">{later.slice(0, 15).map((i) => (
              <li key={i.id} className="flex justify-between gap-2 py-2"><span>{i.contact?.full_name} <span className="text-muted-foreground">· {i.flow}</span></span>
                <span className="text-muted-foreground">{i.flowPaused ? "Flow paused" : `Step ${i.step?.position} on ${when(i.dueAt)}`}</span></li>))}</ul>
          )}
        </Panel>
      </div>

      <Panel title="Email engagement by contact (90 days)">
        {!eng ? <p className="text-sm text-muted-foreground">Loading…</p> : eng.contacts.length === 0 ? <p className="text-sm text-muted-foreground">No opens, clicks or replies from your contacts yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Contact</th><th>Type</th><th>Opens</th><th>Clicks</th><th>Replies</th><th>Likely forwarded</th><th>Last activity</th></tr></thead>
            <tbody className="divide-y">{eng.contacts.map((r: any) => (
              <tr key={r.id}><td className="py-2">{r.name} <span className="text-muted-foreground">{r.organization ?? ""}</span>{r.unsubscribed && <Badge variant="secondary" className="ml-2">Unsubscribed</Badge>}</td>
                <td>{r.kind}</td><td>{r.opens}</td><td>{r.clicks}</td><td>{r.replies}</td><td>{r.likelyForwarded ? "Yes" : "–"}</td><td>{when(r.lastActivity)}</td></tr>))}</tbody>
          </table></div>
        )}
      </Panel>
      {eng && eng.recent.length > 0 && <Panel title="Recent activity">
        <ul className="divide-y text-sm">{eng.recent.map((r: any, i: number) => (
          <li key={i} className="flex justify-between gap-2 py-2"><span><span className="font-medium">{r.contact}</span> {r.kind === "open" ? "opened" : "clicked"} “{r.what}”{r.url ? <span className="text-muted-foreground"> → {r.url}</span> : null}</span><span className="shrink-0 text-muted-foreground">{when(r.at)}</span></li>))}</ul>
      </Panel>}
    </main>
  );
}
