import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientInbox } from "@/components/client-inbox";
import { SupportInbox } from "@/components/support-inbox";
import { inboxOverviewFn, inboxThreadFn, replyInboxFn, startInboxThreadFn } from "@/lib/inbox.functions";

const CHANNEL_LABEL = { operations: "Harmonious Operations", sales: "Harmonious Sales", rep: "Dedicated representative" } as const;

export function useInboxUnread() {
  const fn = useServerFn(inboxOverviewFn);
  return useQuery({ queryKey: ["inbox", "overview"], queryFn: () => fn(), staleTime: 60_000, retry: false });
}

export function UnifiedInbox() {
  const q = useInboxUnread();
  const [open, setOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const d = q.data;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conversations with Harmonious and notices we have sent you.</p>
      </div>
      <Tabs defaultValue="conversations">
        <TabsList>
          <TabsTrigger value="conversations">Conversations{d?.unread ? ` (${d.unread})` : ""}</TabsTrigger>
          {d?.canStart && <TabsTrigger value="notices">Notices</TabsTrigger>}
          <TabsTrigger value="support">{d?.isStaff ? "Investor & manager questions" : "Investment questions"}</TabsTrigger>
        </TabsList>
        <TabsContent value="conversations" className="space-y-4">
          {d?.canStart && !composing && <Button onClick={() => { setComposing(true); setOpen(null); }}>New message</Button>}
          {composing && d && <Compose data={d} onDone={(id) => { setComposing(false); if (id) setOpen(id); }} />}
          {open ? (
            <Thread id={open} onBack={() => setOpen(null)} />
          ) : (
            <Card>
              <CardContent className="p-0">
                {q.isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : !d?.threads.length ? (
                  <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>
                ) : (
                  <ul className="divide-y">
                    {d.threads.map((t) => (
                      <li key={t.id}>
                        <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted" onClick={() => setOpen(t.id)}>
                          <span className="min-w-0">
                            <span className={`block truncate ${t.unread ? "font-semibold" : ""}`}>{t.subject}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t.side === "harmonious" ? `${t.clientName} · ` : ""}{t.channel === "rep" ? t.repName : CHANNEL_LABEL[t.channel]} · {new Date(t.lastMessageAt).toLocaleString()}
                            </span>
                          </span>
                          {t.unread && <Badge>New</Badge>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        {d?.canStart && <TabsContent value="notices"><ClientInbox /></TabsContent>}
        <TabsContent value="support"><SupportInbox mode={d?.isStaff ? "staff" : "investor"} /></TabsContent>
      </Tabs>
    </main>
  );
}

function Compose({ data, onDone }: { data: any; onDone: (id?: string) => void }) {
  const qc = useQueryClient();
  const start = useServerFn(startInboxThreadFn);
  const [clientId, setClientId] = useState<string>(data.clients[0]?.id ?? "");
  const reps = (data.reps as any[]).filter((r) => r.clientId === clientId);
  const [to, setTo] = useState("operations");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const m = useMutation({
    mutationFn: () => {
      const isRep = to.startsWith("rep:");
      return start({ data: { clientId, channel: isRep ? "rep" : (to as "operations" | "sales"), repUserId: isRep ? to.slice(4) : null, subject, body } });
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["inbox"] }); toast.success("Message sent"); onDone(r.id); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">New message</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {data.clients.length > 1 && (
          <div className="space-y-1"><Label>Company</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setTo("operations"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{data.clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1"><Label>To</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="operations">Harmonious Operations team</SelectItem>
              <SelectItem value="sales">Harmonious Sales team</SelectItem>
              {reps.map((r) => <SelectItem key={r.userId} value={`rep:${r.userId}`}>{r.name} (your {r.role.replace(/_/g, " ")} representative)</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></div>
        <div className="space-y-1"><Label>Message</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} /></div>
        <div className="flex gap-2">
          <Button disabled={m.isPending || subject.trim().length < 2 || !body.trim() || !clientId} onClick={() => m.mutate()}>Send</Button>
          <Button variant="outline" onClick={() => onDone()}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(inboxThreadFn);
  const send = useServerFn(replyInboxFn);
  const q = useQuery({ queryKey: ["inbox", "thread", id], queryFn: () => load({ data: { id } }) });
  const [body, setBody] = useState("");
  const m = useMutation({
    mutationFn: () => send({ data: { id, body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["inbox"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-lg">{q.data?.thread.subject ?? "Conversation"}</CardTitle>
        <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["inbox", "overview"] }); onBack(); }}>Back</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.data?.messages.map((msg: any) => (
          <div key={msg.id} className={`rounded-md border p-3 text-sm ${msg.mine ? "ml-8 bg-muted" : "mr-8"}`}>
            <p className="mb-1 text-xs text-muted-foreground">{msg.senderName}{msg.sender_side === "harmonious" ? " (Harmonious)" : ""} · {new Date(msg.created_at).toLocaleString()}</p>
            <p className="whitespace-pre-wrap">{msg.body}</p>
          </div>
        ))}
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write a reply" maxLength={5000} />
        <Button disabled={m.isPending || !body.trim()} onClick={() => m.mutate()}>Reply</Button>
      </CardContent>
    </Card>
  );
}
