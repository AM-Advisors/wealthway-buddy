import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupportConversation, listSupportConversations, replySupportConversation, startSupportConversation } from "@/lib/crm.functions";

type Mode = "staff" | "manager" | "investor";

/** Conversations with the Harmonious team. Staff see all; others see their own (managers: their Funds'). */
export function SupportInbox({ mode, funds = [] }: { mode: Mode; funds?: { id: string; name: string }[] }) {
  const list = useServerFn(listSupportConversations);
  const qc = useQueryClient();
  const [kind, setKind] = useState<"all" | "manager" | "investor">("all");
  const q = useQuery({
    queryKey: ["support", mode, kind],
    queryFn: () => list({ data: mode === "staff" ? { staffView: true, kind: kind === "all" ? undefined : kind } : { kind: mode } }),
    refetchInterval: 60_000,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const rows = q.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "staff" ? (
          <Select value={kind} onValueChange={(v) => setKind(v as any)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All conversations</SelectItem><SelectItem value="manager">From fund managers</SelectItem><SelectItem value="investor">From investors</SelectItem></SelectContent>
          </Select>
        ) : <span className="text-sm text-muted-foreground">Questions for the Harmonious team.</span>}
        {mode !== "staff" && <Button onClick={() => setStarting(true)}>New message to Harmonious</Button>}
      </div>
      {starting && <StartForm mode={mode} funds={funds} onDone={(id) => { setStarting(false); setOpen(id); qc.invalidateQueries({ queryKey: ["support"] }); }} onCancel={() => setStarting(false)} />}
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No conversations yet.</p> : rows.map((c: any) => (
        <Card key={c.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{c.subject}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {mode === "staff" ? `${c.requester_name ?? "Someone"} · ${c.kind === "manager" ? "Fund manager" : "Investor"}` : ""}{c.fund_name ? ` · ${c.fund_name}` : ""} · {new Date(c.last_message_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.unread && <Badge>New</Badge>}
                {c.status === "closed" && <Badge variant="outline">Closed</Badge>}
                <Button size="sm" variant="outline" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Close" : "Open"}</Button>
              </div>
            </div>
          </CardHeader>
          {open === c.id && <CardContent><Thread id={c.id} staff={mode === "staff"} /></CardContent>}
        </Card>
      ))}
    </div>
  );
}

function StartForm({ mode, funds, onDone, onCancel }: { mode: Mode; funds: { id: string; name: string }[]; onDone: (id: string) => void; onCancel: () => void }) {
  const start = useServerFn(startSupportConversation);
  const [fund, setFund] = useState(funds[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card><CardContent className="space-y-2 pt-6">
      {mode === "manager" && (
        <Select value={fund} onValueChange={setFund}>
          <SelectTrigger><SelectValue placeholder="Which Fund is this about?" /></SelectTrigger>
          <SelectContent>{funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <Textarea rows={4} placeholder="Your message" value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-muted-foreground">Please don't send bank details, Social Security numbers or ID documents by message.</p>
      <div className="flex gap-2">
        <Button disabled={busy || !subject.trim() || !body.trim() || (mode === "manager" && !fund)} onClick={async () => {
          setBusy(true);
          try { const r = await start({ data: { kind: mode === "manager" ? "manager" : "investor", offeringId: mode === "manager" ? fund : undefined, subject, body } }); onDone(r.id); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Could not send."); } finally { setBusy(false); }
        }}>Send</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </CardContent></Card>
  );
}

function Thread({ id, staff }: { id: string; staff: boolean }) {
  const load = useServerFn(getSupportConversation);
  const reply = useServerFn(replySupportConversation);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["support-thread", id], queryFn: () => load({ data: { id } }), refetchInterval: 30_000 });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (close: boolean) => {
    setBusy(true);
    try { await reply({ data: { id, body, close } }); setBody(""); qc.invalidateQueries({ queryKey: ["support"] }); qc.invalidateQueries({ queryKey: ["support-thread", id] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not send."); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {(q.data?.messages ?? []).map((m: any) => (
          <li key={m.id} className={`rounded-md border p-3 text-sm ${m.side === "harmonious" ? "bg-muted/40" : ""}`}>
            <div className="mb-1 text-xs text-muted-foreground">{m.sender_name} · {new Date(m.created_at).toLocaleString()}</div>
            <div className="whitespace-pre-wrap">{m.body}</div>
          </li>
        ))}
      </ul>
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
      <div className="flex gap-2">
        <Button disabled={busy || !body.trim()} onClick={() => send(false)}>Reply</Button>
        {staff && <Button variant="outline" disabled={busy || !body.trim()} onClick={() => send(true)}>Reply and close</Button>}
      </div>
    </div>
  );
}
