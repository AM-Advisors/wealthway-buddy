import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Inbox, Mail, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GmailConnectCard } from "@/components/gmail-connect";
import {
  addGroupMailbox,
  deleteGroupMailbox,
  getGroupMailboxes,
  getGroupMailboxThreads,
  sendGroupMailboxEmail,
} from "@/lib/gmail.functions";

export const Route = createFileRoute("/_authenticated/ops/mailboxes")({
  head: () => ({
    meta: [
      { title: "Mailboxes - Harmonious" },
      { name: "description", content: "Connect your Google inbox and use shared Harmonious mailboxes." },
      { property: "og:title", content: "Mailboxes - Harmonious" },
      { property: "og:description", content: "Staff Google inboxes and shared mailboxes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MailboxesPage,
});

function MailboxesPage() {
  const qc = useQueryClient();
  const load = useServerFn(getGroupMailboxes);
  const add = useServerFn(addGroupMailbox);
  const remove = useServerFn(deleteGroupMailbox);
  const send = useServerFn(sendGroupMailboxEmail);
  const threadsFn = useServerFn(getGroupMailboxThreads);

  const boxes = useQuery({ queryKey: ["group-mailboxes"], queryFn: () => load(), retry: false });
  const [selected, setSelected] = useState<string | null>(null);
  const threads = useQuery({
    queryKey: ["group-mailbox-threads", selected],
    queryFn: () => threadsFn({ data: { mailboxId: selected! } }),
    enabled: !!selected,
    retry: false,
  });

  const [label, setLabel] = useState("");
  const [envKey, setEnvKey] = useState("GOOGLE_MAIL_API_KEY");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const addM = useMutation({
    mutationFn: () => add({ data: { label, envKey } }),
    onSuccess: () => { toast.success("Mailbox added"); setLabel(""); qc.invalidateQueries({ queryKey: ["group-mailboxes"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Mailbox removed"); setSelected(null); qc.invalidateQueries({ queryKey: ["group-mailboxes"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const sendM = useMutation({
    mutationFn: () => send({ data: { mailboxId: selected!, to, subject, body } }),
    onSuccess: () => { toast.success("Email sent"); setTo(""); setSubject(""); setBody(""); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl">Mailboxes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your own Google inbox, and use shared Harmonious mailboxes your team has connected.
        </p>
      </header>

      <GmailConnectCard />

      <section className="space-y-4">
        <h2 className="text-xl font-medium flex items-center gap-2"><Inbox className="h-5 w-5" /> Group mailboxes</h2>
        {boxes.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {boxes.error && <p className="text-sm text-destructive">{(boxes.error as Error).message}</p>}
        {boxes.data && boxes.data.mailboxes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No shared mailboxes yet. A leader can link a shared Google account (for example ops@) in connector settings, then register it below.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {(boxes.data?.mailboxes ?? []).map((b) => (
            <Card key={b.id} className={selected === b.id ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="text-base">{b.label}</CardTitle>
                <CardDescription>{b.emailAddress ?? b.envKey}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(b.id)}>Open</Button>
                <Button size="sm" variant="ghost" onClick={() => removeM.mutate(b.id)} disabled={removeM.isPending}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Register a connected Google account</CardTitle>
            <CardDescription>
              Leadership only. First link the shared Google account to this project under connector settings, then name it here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="mb-label">Name (e.g. Operations)</label>
              <Input id="mb-label" value={label} onChange={(e) => setLabel(e.target.value)} className="w-56" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="mb-key">Connection</label>
              <Input id="mb-key" value={envKey} onChange={(e) => setEnvKey(e.target.value)} className="w-64" placeholder="GOOGLE_MAIL_API_KEY" />
            </div>
            <Button size="sm" disabled={!label.trim() || addM.isPending} onClick={() => addM.mutate()}>Add mailbox</Button>
          </CardContent>
        </Card>
      </section>

      {selected && (
        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent email</CardTitle>
              <CardDescription>Latest messages in this mailbox (read on demand, never stored).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {threads.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {threads.error && <p className="text-sm text-destructive">{(threads.error as Error).message}</p>}
              {(threads.data?.threads ?? []).map((t) => (
                <div key={t.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.from} · {t.date}</p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.snippet}</p>
                </div>
              ))}
              {threads.data && threads.data.threads.length === 0 && <p className="text-sm text-muted-foreground">No recent email.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" /> Send from this mailbox</CardTitle>
              <CardDescription>Your name is recorded in the activity log for every send.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="To (email address)" value={to} onChange={(e) => setTo(e.target.value)} />
              <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Textarea placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
              <Button size="sm" disabled={!to || !subject || !body || sendM.isPending} onClick={() => sendM.mutate()}>
                <Mail className="mr-1 h-3.5 w-3.5" /> Send
              </Button>
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}
