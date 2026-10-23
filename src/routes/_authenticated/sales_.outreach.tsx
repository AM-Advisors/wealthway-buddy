import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getOutreachContacts, logSalesOutreach, moveSalesStage, parseLinkedInText, recordSalesOptOut, saveLinkedInMessages, sendSalesOutreach,
} from "@/lib/sales-hub.functions";
import { CHANNEL_LABEL, CONNECT_CHANNELS, OUTREACH_CHANNELS, SALES_STAGES, STAGE_LABEL, type SalesStage } from "@/lib/sales-model";
import { OutreachFeed } from "@/components/sales/outreach-feed";
import { Panel } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach - Harmonious Sales" },
      { name: "description", content: "Email, text, WhatsApp, LinkedIn and call outreach for each Harmonious Sales contact." },
      { property: "og:title", content: "Outreach - Harmonious Sales" },
      { property: "og:description", content: "One outreach timeline per contact across every channel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OutreachPage,
});

function OutreachPage() {
  const load = useServerFn(getOutreachContacts);
  const q = useQuery({ queryKey: ["sales-outreach-contacts"], queryFn: () => load() });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const contacts = (q.data ?? []) as any[];
  const shown = useMemo(() => contacts.filter((c) => `${c.full_name} ${c.organization ?? ""}`.toLowerCase().includes(search.toLowerCase())), [contacts, search]);
  const contact = contacts.find((c) => c.id === selected);
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl">Outreach</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Nothing is pulled from LinkedIn automatically. Add contacts on <Link to="/sales/crm" className="underline">Contacts & deals</Link>.</p>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel title={`Contacts (${contacts.length})`}>
          <Input placeholder="Search contacts" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
          <ul className="max-h-[70vh] divide-y overflow-auto">
            {shown.map((c) => (
              <li key={c.id}>
                <button onClick={() => setSelected(c.id)} className={`w-full px-2 py-2 text-left text-sm ${selected === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
                  <div className="font-medium">{c.full_name}</div>
                  <div className="text-xs text-muted-foreground">{c.organization ?? "-"}{c.stage ? ` · ${STAGE_LABEL[c.stage as SalesStage]}` : ""}</div>
                </button>
              </li>
            ))}
            {!shown.length && <li className="py-2 text-sm text-muted-foreground">No contacts.</li>}
          </ul>
        </Panel>
        {contact ? <ContactOutreach key={contact.id} contact={contact} /> : <Panel title="Pick a contact"><p className="text-sm text-muted-foreground">Choose a contact to see their timeline and reach out.</p></Panel>}
      </div>
    </main>
  );
}

function ContactOutreach({ contact }: { contact: any }) {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sales-outreach-list"] }); qc.invalidateQueries({ queryKey: ["sales-outreach-contacts"] }); };
  return (
    <div className="space-y-4">
      <Panel title={contact.full_name}>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {contact.title && <span>{contact.title}</span>}{contact.organization && <span>· {contact.organization}</span>}
          {contact.email && <span>· {contact.email}</span>}{contact.phone && <span>· {contact.phone}</span>}
          {contact.linkedin_url && <a className="underline" href={contact.linkedin_url} target="_blank" rel="noreferrer">LinkedIn profile</a>}
          {contact.optedOut.map((o: string) => <Badge key={o} variant="destructive">Opted out: {CHANNEL_LABEL[o as keyof typeof CHANNEL_LABEL]}</Badge>)}
        </div>
        {contact.dealId && <StageControl contact={contact} onDone={refresh} />}
      </Panel>
      <Tabs defaultValue="send">
        <TabsList><TabsTrigger value="send">Send</TabsTrigger><TabsTrigger value="log">Log activity</TabsTrigger><TabsTrigger value="linkedin">LinkedIn pull in</TabsTrigger></TabsList>
        <TabsContent value="send"><SendForm contact={contact} onDone={refresh} /></TabsContent>
        <TabsContent value="log"><LogForm contact={contact} onDone={refresh} /></TabsContent>
        <TabsContent value="linkedin"><LinkedInPull contact={contact} onDone={refresh} /></TabsContent>
      </Tabs>
      <Panel title="Timeline"><OutreachFeed period={{ period: "year" }} filter={{ contactId: contact.id }} /></Panel>
    </div>
  );
}

function StageControl({ contact, onDone }: { contact: any; onDone: () => void }) {
  const move = useServerFn(moveSalesStage);
  const [stage, setStage] = useState<SalesStage>(contact.stage ?? "outreach");
  const [via, setVia] = useState("email");
  const [follow, setFollow] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => move({ data: { dealId: contact.dealId, stage, connectedVia: stage === "connected" ? via : null, followUpAt: stage === "contact_later" ? follow : null, lossReason: stage === "contract_lost" ? reason : null } }),
    onSuccess: () => { toast.success("Stage updated"); onDone(); }, onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <div><Label className="text-xs">Status</Label>
        <Select value={stage} onValueChange={(v) => setStage(v as SalesStage)}><SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{SALES_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>)}</SelectContent></Select></div>
      {stage === "connected" && <div><Label className="text-xs">Connected via</Label>
        <Select value={via} onValueChange={setVia}><SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{CONNECT_CHANNELS.map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>)}</SelectContent></Select></div>}
      {stage === "contact_later" && <div><Label className="text-xs">Follow up on</Label><Input type="date" className="h-8" value={follow} onChange={(e) => setFollow(e.target.value)} /></div>}
      {stage === "contract_lost" && <div><Label className="text-xs">Reason lost</Label><Input className="h-8 w-56" value={reason} onChange={(e) => setReason(e.target.value)} /></div>}
      <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>Update status</Button>
    </div>
  );
}

function SendForm({ contact, onDone }: { contact: any; onDone: () => void }) {
  const send = useServerFn(sendSalesOutreach);
  const optOut = useServerFn(recordSalesOptOut);
  const [channel, setChannel] = useState<"email" | "text" | "whatsapp">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priv, setPriv] = useState(false);
  const m = useMutation({ mutationFn: () => send({ data: { contactId: contact.id, channel, subject: channel === "email" ? subject : null, body, visibility: priv ? "private" : "team" } }),
    onSuccess: () => { toast.success("Sent"); setBody(""); setSubject(""); onDone(); }, onError: (e: Error) => toast.error(e.message) });
  const o = useMutation({ mutationFn: () => optOut({ data: { contactId: contact.id, channel } }), onSuccess: () => { toast.success("Opt-out recorded"); onDone(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Panel title="Send a message">
      <div className="space-y-3">
        <Select value={channel} onValueChange={(v) => setChannel(v as any)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="text">Text</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent></Select>
        {channel === "email" && <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
        <Textarea rows={5} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={priv} onCheckedChange={(v) => setPriv(Boolean(v))} /> Only visible to me</label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => m.mutate()} disabled={!body.trim() || m.isPending}>Send {channel === "email" ? "email" : channel === "text" ? "text" : "WhatsApp"}</Button>
          <Button variant="ghost" onClick={() => o.mutate()} disabled={o.isPending}>Record opt-out for this channel</Button>
        </div>
        <p className="text-xs text-muted-foreground">Emails respect unsubscribes. Texts and WhatsApp stop automatically when someone replies STOP (log the reply).</p>
      </div>
    </Panel>
  );
}

function LogForm({ contact, onDone }: { contact: any; onDone: () => void }) {
  const log = useServerFn(logSalesOutreach);
  const [f, setF] = useState({ channel: "call", direction: "outbound" as "outbound" | "inbound", subject: "", body: "", when: "", priv: false });
  const m = useMutation({
    mutationFn: () => log({ data: { contactId: contact.id, channel: f.channel as any, direction: f.direction, subject: f.subject || null, body: f.body || null, occurredAt: f.when ? new Date(f.when).toISOString() : null, visibility: f.priv ? "private" : "team" } }),
    onSuccess: () => { toast.success("Logged"); setF({ ...f, subject: "", body: "" }); onDone(); }, onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Panel title="Log outreach done elsewhere">
      <div className="grid gap-3 sm:grid-cols-3">
        <Select value={f.channel} onValueChange={(v) => setF({ ...f, channel: v })}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{OUTREACH_CHANNELS.map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>)}</SelectContent></Select>
        <Select value={f.direction} onValueChange={(v) => setF({ ...f, direction: v as any })}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="outbound">I reached out</SelectItem><SelectItem value="inbound">They replied</SelectItem></SelectContent></Select>
        <Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} aria-label="When" />
      </div>
      <Input className="mt-3" placeholder="Subject or topic (optional)" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
      <Textarea className="mt-3" rows={4} placeholder="What was said" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <label className="mt-3 flex items-center gap-2 text-sm"><Checkbox checked={f.priv} onCheckedChange={(v) => setF({ ...f, priv: Boolean(v) })} /> Only visible to me</label>
      <Button className="mt-3" onClick={() => m.mutate()} disabled={m.isPending}>Log it</Button>
    </Panel>
  );
}

type Parsed = { date: string | null; direction: "outbound" | "inbound"; sender: string | null; text: string; keep: boolean; team: boolean };

function LinkedInPull({ contact, onDone }: { contact: any; onDone: () => void }) {
  const parse = useServerFn(parseLinkedInText);
  const save = useServerFn(saveLinkedInMessages);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Parsed[] | null>(null);
  const [fields, setFields] = useState<Record<string, { value: string; keep: boolean }>>({});
  const p = useMutation({
    mutationFn: () => parse({ data: { text } }),
    onSuccess: (r) => {
      setMsgs(r.messages.map((m) => ({ ...m, keep: true, team: true })));
      const c = r.contact ?? {};
      setFields(Object.fromEntries(["title", "organization", "linkedin_url"].filter((k) => (c as any)[k]).map((k) => [k, { value: String((c as any)[k]), keep: false }])));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const s = useMutation({
    mutationFn: () => save({ data: {
      contactId: contact.id,
      messages: (msgs ?? []).filter((m) => m.keep).map((m) => ({ date: m.date, direction: m.direction, text: m.text, visibility: m.team ? "team" : "private" })),
      contactFields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v.keep).map(([k, v]) => [k, v.value])),
    } }),
    onSuccess: (r) => { toast.success(`Saved ${r.saved} messages`); setMsgs(null); setText(""); onDone(); }, onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Panel title="Pull in from LinkedIn">
      <p className="mb-2 text-sm text-muted-foreground">Copy the conversation or profile section you want from LinkedIn and paste it here. You choose exactly what is saved and who can see it.</p>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste LinkedIn conversation or profile text" />
      <Button className="mt-2" onClick={() => p.mutate()} disabled={!text.trim() || p.isPending}>{p.isPending ? "Reading…" : "Pull in"}</Button>
      {msgs && (
        <div className="mt-4 space-y-3">
          {Object.keys(fields).length > 0 && (
            <div className="rounded border p-3 text-sm">
              <div className="mb-1 font-medium">Contact details found</div>
              {Object.entries(fields).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2 py-1"><Checkbox checked={v.keep} onCheckedChange={(c) => setFields({ ...fields, [k]: { ...v, keep: Boolean(c) } })} />
                  <span className="w-28 text-muted-foreground">{k === "linkedin_url" ? "LinkedIn URL" : k[0]!.toUpperCase() + k.slice(1)}</span><span>{v.value}</span></label>
              ))}
            </div>
          )}
          <div className="text-sm font-medium">{msgs.length} messages found. Untick anything you don't want saved.</div>
          <ul className="divide-y rounded border">
            {msgs.map((m, i) => (
              <li key={i} className="flex gap-3 p-2 text-sm">
                <Checkbox checked={m.keep} onCheckedChange={(c) => setMsgs(msgs.map((x, j) => (j === i ? { ...x, keep: Boolean(c) } : x)))} aria-label="Keep" />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{m.direction === "outbound" ? "You" : m.sender ?? "Them"} · {m.date ?? "no date"}</div>
                  <div className="whitespace-pre-line">{m.text}</div>
                </div>
                <label className="flex items-center gap-1 text-xs"><Checkbox checked={m.team} onCheckedChange={(c) => setMsgs(msgs.map((x, j) => (j === i ? { ...x, team: Boolean(c) } : x)))} /> Team can see</label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={() => s.mutate()} disabled={s.isPending || !msgs.some((m) => m.keep)}>Save selected</Button>
            <Button variant="ghost" onClick={() => setMsgs(null)}>Discard</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
