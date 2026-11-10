import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getBookkeepingOutstanding, markBookkeepingItemProvided, requestBookkeepingItem } from "@/lib/bookkeeping-outstanding.functions";
import type { OutstandingItem } from "@/lib/bookkeeping-outstanding-model";

const money = (c: number | null) => c === null ? "" : `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const fmt = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

/** Bookkeeping Review report: what the client needs to provide, and what Harmonious is working on. */
export function BookkeepingOutstandingReport({ fundId }: { fundId: string }) {
  const load = useServerFn(getBookkeepingOutstanding);
  const q = useQuery({ queryKey: ["bookkeeping-outstanding", fundId], queryFn: () => load({ data: { fundId } }) });
  if (q.isLoading) return <section className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Loading outstanding bookkeeping items…</p></section>;
  if (q.error) return <section className="rounded-xl border bg-card p-5"><p className="text-sm text-destructive">{(q.error as Error).message}</p></section>;
  const d = q.data!;
  const client = d.items.filter((i) => i.owner === "client");
  const team = d.items.filter((i) => i.owner === "harmonious");
  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="bk-outstanding">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Bookkeeping review</p>
          <h3 id="bk-outstanding" className="mt-1 text-lg">Outstanding items</h3>
          <p className="text-sm text-muted-foreground">Built from your statements, transactions and review requests as of {fmt(d.generatedAt)}.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={d.summary.needFromYou ? "default" : "secondary"}>{d.summary.needFromYou} needed from you</Badge>
          <Badge variant="outline">{d.summary.harmoniousWorking} with Harmonious</Badge>
        </div>
      </div>

      <h4 className="mt-5 text-base font-medium">What we need from you</h4>
      {client.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nothing right now.</p> : (
        <ul className="mt-2 divide-y rounded-lg border">{client.map((i) => <ClientItem key={i.key} item={i} fundId={fundId} staff={d.staff} />)}</ul>
      )}

      <h4 className="mt-5 text-base font-medium">What Harmonious is working on</h4>
      {team.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nothing open.</p> : (
        <ul className="mt-2 divide-y rounded-lg border">{team.map((i) => (
          <li key={i.key} className="p-3">
            <p className="font-medium">{i.title}</p>
            {i.detail && <p className="text-sm text-muted-foreground">{i.detail}</p>}
            {d.staff && i.requestId && <Link to="/ops/tasks" search={{ task: i.requestId }} className="text-xs text-primary underline">Open task</Link>}
          </li>
        ))}</ul>
      )}

      {d.staff && <StaffRequestForm fundId={fundId} />}
    </section>
  );
}

function ClientItem({ item, fundId, staff }: { item: OutstandingItem; fundId: string; staff: boolean }) {
  const qc = useQueryClient();
  const mark = useServerFn(markBookkeepingItemProvided);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => mark({ data: { fundId, requestId: item.requestId!, note } }),
    onSuccess: () => { toast.success("Thanks. Harmonious will review what you sent."); setOpen(false); void qc.invalidateQueries({ queryKey: ["bookkeeping-outstanding", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{item.title}</p>
          {item.detail && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.detail}</p>}
          <p className="text-xs text-muted-foreground">{[item.since && `Open since ${fmt(item.since)}`, item.dueOn && `Due ${fmt(item.dueOn)}`].filter(Boolean).join(" · ")}</p>
        </div>
        {item.requestId && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>I've provided this</Button>}
        {staff && item.requestId && <Link to="/ops/tasks" search={{ task: item.requestId }} className="text-xs text-primary underline">Open task</Link>}
      </div>
      {item.lines?.length ? (
        <table className="mt-2 w-full text-sm"><tbody>{item.lines.map((l, n) => (
          <tr key={n} className="border-t"><td className="py-1 pr-3 text-muted-foreground">{fmt(l.date) ?? "No date"}</td><td className="py-1 pr-3">{l.text}</td><td className="py-1 text-right tabular-nums">{money(l.amountCents)}</td></tr>
        ))}</tbody></table>
      ) : null}
      {item.category === "statement" && <p className="mt-1 text-xs text-muted-foreground">Upload them in this fund's Banking section.</p>}
      {open && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`note-${item.key}`}>Where did you send it? (optional)</Label>
          <Textarea id={`note-${item.key}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: uploaded to Documents on Monday" />
          <div className="flex gap-2"><Button size="sm" disabled={m.isPending} onClick={() => m.mutate()}>Send to Harmonious</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </div>
      )}
    </li>
  );
}

function StaffRequestForm({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const create = useServerFn(requestBookkeepingItem);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [dueOn, setDueOn] = useState("");
  const m = useMutation({
    mutationFn: () => create({ data: { fundId, title, detail, dueOn: dueOn || null } }),
    onSuccess: () => { toast.success("Request added. The client sees it in their outstanding items."); setTitle(""); setDetail(""); setDueOn(""); void qc.invalidateQueries({ queryKey: ["bookkeeping-outstanding", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <details className="mt-5 border-t pt-4">
      <summary className="cursor-pointer text-sm font-medium">Ask the client for something (staff only)</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="bk-req-title">What do you need?</Label><Input id="bk-req-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="March invoice from the law firm" /></div>
        <div className="space-y-1"><Label htmlFor="bk-req-due">Due date</Label><Input id="bk-req-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></div>
        <div className="space-y-1 sm:col-span-3"><Label htmlFor="bk-req-detail">Details the client will see</Label><Textarea id="bk-req-detail" value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
      </div>
      <Button className="mt-3" size="sm" disabled={m.isPending || title.trim().length < 3 || detail.trim().length < 3} onClick={() => m.mutate()}>Add request</Button>
    </details>
  );
}
