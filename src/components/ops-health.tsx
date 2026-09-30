import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { emailHealthFn, systemStatusFn, webhookLogFn } from "@/lib/ops-health.functions";

const PROBLEM = /bounce|fail|complain|suppress|reject|error|dead/i;

function Shell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="font-heading text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      </header>
      {children}
    </div>
  );
}

function Days({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select className="rounded-md border border-input bg-background px-2 py-1 text-sm" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {[1, 7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} day{d > 1 ? "s" : ""}</option>)}
    </select>
  );
}

const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : "—");

export function EmailHealth() {
  const [days, setDays] = useState(14);
  const [problemsOnly, setProblemsOnly] = useState(true);
  const load = useServerFn(emailHealthFn);
  const q = useQuery({ queryKey: ["ops-email-health", days], queryFn: () => load({ data: { days } }) });
  const events = (q.data?.events ?? []).filter((e) => !problemsOnly || PROBLEM.test(e.type));
  return (
    <Shell title="Email delivery" intro="Delivery updates for emails the platform sent. Addresses are partly hidden. Nothing can be resent from here.">
      <div className="flex flex-wrap items-center gap-3">
        <Days value={days} onChange={setDays} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} /> Problems only</label>
      </div>
      {q.data ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(q.data.counts).map(([k, n]) => (
            <span key={k} className={`rounded-full border px-3 py-1 ${PROBLEM.test(k) ? "border-destructive text-destructive" : "border-border"}`}>{k}: {n}</span>
          ))}
        </div>
      ) : null}
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : events.length === 0 ? <p className="text-sm text-muted-foreground">No matching delivery updates.</p> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">When</th><th className="p-2">Update</th><th className="p-2">Recipient</th><th className="p-2">Message</th></tr></thead>
            <tbody>{events.map((e) => (
              <tr key={e.id} className="border-t"><td className="p-2 whitespace-nowrap">{when(e.at)}</td><td className="p-2">{e.type}</td><td className="p-2">{e.recipient}</td><td className="p-2 font-mono text-xs">{e.messageId ?? "—"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

export function WebhookLog() {
  const [days, setDays] = useState(7);
  const [source, setSource] = useState("all");
  const load = useServerFn(webhookLogFn);
  const q = useQuery({ queryKey: ["ops-webhook-log", days], queryFn: () => load({ data: { days } }) });
  const events = (q.data?.events ?? []).filter((e) => source === "all" || e.source === source);
  return (
    <Shell title="Webhook log" intro="Updates received from the identity check, Box Sign and Plaid. Message contents are never shown.">
      <div className="flex flex-wrap gap-3">
        <Days value={days} onChange={setDays} />
        <select className="rounded-md border border-input bg-background px-2 py-1 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
          {["all", "Identity check", "Box Sign", "Plaid"].map((s) => <option key={s} value={s}>{s === "all" ? "All sources" : s}</option>)}
        </select>
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : events.length === 0 ? <p className="text-sm text-muted-foreground">No updates in this period.</p> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">Received</th><th className="p-2">Source</th><th className="p-2">Type</th><th className="p-2">Status</th><th className="p-2">Processed</th><th className="p-2">Detail</th></tr></thead>
            <tbody>{events.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{when(e.at)}</td><td className="p-2">{e.source}</td><td className="p-2">{e.kind}</td>
                <td className={`p-2 ${PROBLEM.test(String(e.status)) ? "text-destructive" : ""}`}>{e.status}</td>
                <td className="p-2 whitespace-nowrap">{e.processedAt ? when(e.processedAt) : <span className="text-muted-foreground">Not yet</span>}</td>
                <td className="p-2 text-xs text-muted-foreground">{e.detail ?? ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

export function SystemStatus() {
  const load = useServerFn(systemStatusFn);
  const q = useQuery({ queryKey: ["ops-system-status"], queryFn: () => load(), refetchInterval: 60_000 });
  const d = q.data;
  const Tile = ({ label, ok, note }: { label: string; ok: boolean; note?: string }) => (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-heading text-xl font-semibold ${ok ? "" : "text-destructive"}`}>{ok ? "Responding" : "Not responding"}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
  return (
    <Shell title="System status" intro="A quick check that the app and its backend are answering. Refreshes every minute.">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Checking…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : d ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile label="App" ok={d.app === "ok"} />
            <Tile label="Backend" ok={d.backend === "ok"} note={`${d.backendMs} ms`} />
          </div>
          <p className="text-xs text-muted-foreground">Last checked {when(d.checkedAt)}.</p>
        </>
      ) : null}
    </Shell>
  );
}
