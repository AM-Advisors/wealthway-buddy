import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Archive, ArrowLeft, FileText, Inbox, Mail, PenSquare, Reply, Search, Send, Star, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getGroupMailboxes, getMyGmailStatus } from "@/lib/gmail.functions";
import {
  discardMailDraft, getMailDraft, getMailThread, getMailTicketBoard, listMail, mailThreadAction,
  saveMailDraft, sendMailMessage, updateMailTicket,
} from "@/lib/mail.functions";

export const Route = createFileRoute("/_authenticated/ops/mail")({
  head: () => ({
    meta: [
      { title: "Mail - Harmonious" },
      { name: "description", content: "Your Google inbox and shared Harmonious mailboxes with ticket assignment." },
      { property: "og:title", content: "Mail - Harmonious" },
      { property: "og:description", content: "Read, reply, draft and track shared inbox tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MailPage,
});

type Folder = "inbox" | "sent" | "drafts" | "archive" | "trash" | "starred";
const FOLDERS: { id: Folder; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox }, { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send }, { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive }, { id: "trash", label: "Trash", icon: Trash2 },
];
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", waiting: "Waiting on client", resolved: "Resolved" };
type Compose = { to: string; cc: string; subject: string; body: string; threadId?: string; inReplyTo?: string; references?: string; draftId?: string };

const shortDate = (d: string) => { const t = Date.parse(d); if (Number.isNaN(t)) return ""; const x = new Date(t); return x.toDateString() === new Date().toDateString() ? x.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : x.toLocaleDateString(); };
const nameOf = (from: string) => from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || from;

function MailPage() {
  const qc = useQueryClient();
  const [mailbox, setMailbox] = useState<string>("me");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [pageTokens, setPageTokens] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [ticketFilter, setTicketFilter] = useState<"all" | "mine" | "unassigned" | "open">("all");

  const status = useQuery({ queryKey: ["gmail-status"], queryFn: useServerFn(getMyGmailStatus), retry: false });
  const boxes = useQuery({ queryKey: ["group-mailboxes"], queryFn: useServerFn(getGroupMailboxes), retry: false });
  const isGroup = mailbox !== "me";
  const meConnected = !!(status.data as any)?.connected;

  useEffect(() => {
    if (status.isSuccess && !meConnected && mailbox === "me" && boxes.data?.mailboxes.length) setMailbox(boxes.data.mailboxes[0]!.id);
  }, [status.isSuccess, meConnected, boxes.data, mailbox]);

  const list = useServerFn(listMail);
  const pageToken = pageTokens[pageTokens.length - 1];
  const canLoad = isGroup || meConnected;
  const threads = useQuery({
    queryKey: ["mail", mailbox, folder, applied, pageToken ?? ""],
    queryFn: () => list({ data: { mailbox, folder, search: applied || undefined, pageToken } }),
    enabled: canLoad, retry: false,
  });
  const board = useQuery({ queryKey: ["mail-board", mailbox], queryFn: useServerFn(getMailTicketBoard).bind(null, { data: { mailboxId: isGroup ? mailbox : null } }), enabled: isGroup, retry: false });

  const switchTo = (mb: string, f: Folder = "inbox") => { setMailbox(mb); setFolder(f); setOpen(null); setPageTokens([]); setTicketFilter("all"); };
  const refresh = () => { qc.invalidateQueries({ queryKey: ["mail", mailbox] }); qc.invalidateQueries({ queryKey: ["mail-board"] }); };

  const loadDraft = useServerFn(getMailDraft);
  const openRow = async (t: any) => {
    if (t.draftId) {
      try { const d = await loadDraft({ data: { mailbox, draftId: t.draftId } }); setCompose({ to: d.to, cc: d.cc, subject: d.subject, body: d.body, threadId: d.threadId, inReplyTo: d.inReplyTo || undefined, references: d.references || undefined, draftId: d.id }); }
      catch (e) { toast.error((e as Error).message); }
      return;
    }
    setOpen(t.id);
  };

  const rows = (threads.data?.threads ?? []).filter((t) => {
    if (!isGroup || ticketFilter === "all") return true;
    const tk = threads.data?.tickets[t.id];
    if (ticketFilter === "mine") return tk?.assigneeId === threads.data?.me;
    if (ticketFilter === "unassigned") return tk && !tk.assigneeId;
    return tk && tk.status !== "resolved";
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mail</h1>
          <p className="text-sm text-muted-foreground">Your own Google inbox and shared Harmonious mailboxes. Shared emails become tickets you can assign and track.</p>
        </div>
        <Button onClick={() => setCompose({ to: "", cc: "", subject: "", body: "" })} disabled={!canLoad}><PenSquare className="mr-2 h-4 w-4" />Compose</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <aside className="space-y-4">
          <div className="space-y-1">
            <p className="px-2 text-xs font-medium uppercase text-muted-foreground">Mailboxes</p>
            <MailboxButton active={mailbox === "me"} onClick={() => switchTo("me")} label="My inbox" sub={meConnected ? (status.data as any).email : "Not connected"} />
            {(boxes.data?.mailboxes ?? []).map((b) => <MailboxButton key={b.id} active={mailbox === b.id} onClick={() => switchTo(b.id)} label={b.label} sub={b.emailAddress ?? ""} />)}
          </div>
          <div className="space-y-1">
            <p className="px-2 text-xs font-medium uppercase text-muted-foreground">Folders</p>
            {FOLDERS.map((f) => (
              <button key={f.id} onClick={() => { setFolder(f.id); setOpen(null); setPageTokens([]); }} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${folder === f.id ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
                <f.icon className="h-4 w-4" />{f.label}
              </button>
            ))}
          </div>
          {isGroup && board.data && (
            <div className="space-y-2 rounded-lg border bg-card p-3 text-sm">
              <p className="font-medium text-foreground">Open tickets</p>
              {Object.entries(board.data.byStatus).map(([s, n]) => <div key={s} className="flex justify-between text-muted-foreground"><span>{STATUS_LABEL[s] ?? s}</span><span className="text-foreground">{n}</span></div>)}
              <p className="pt-2 font-medium text-foreground">By person</p>
              {Object.entries(board.data.byAssignee).length ? Object.entries(board.data.byAssignee).map(([p, n]) => <div key={p} className="flex justify-between text-muted-foreground"><span className="truncate">{p}</span><span className="text-foreground">{n}</span></div>) : <p className="text-muted-foreground">No open tickets.</p>}
            </div>
          )}
        </aside>

        <section className="min-w-0 rounded-lg border bg-card">
          {!canLoad ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Connect your Google inbox on the <Link to="/ops/mailboxes" className="text-primary underline">Mailboxes</Link> page to read your email here.
            </div>
          ) : open ? (
            <ThreadView mailbox={mailbox} threadId={open} folder={folder} staff={board.data?.staff ?? []} me={threads.data?.me ?? ""} onBack={() => setOpen(null)} onChanged={refresh} onReply={setCompose} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(search); setPageTokens([]); }}>
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mail (e.g. from:name@client.com)" className="h-8" />
                </form>
                {isGroup && folder === "inbox" && (
                  <div className="flex gap-1">
                    {(["all", "mine", "unassigned", "open"] as const).map((f) => <Button key={f} size="sm" variant={ticketFilter === f ? "default" : "outline"} onClick={() => setTicketFilter(f)}>{f === "all" ? "All" : f === "mine" ? "Mine" : f === "unassigned" ? "Unassigned" : "Not resolved"}</Button>)}
                  </div>
                )}
              </div>
              {threads.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
              {threads.error && <p className="p-4 text-sm text-destructive">{(threads.error as Error).message}</p>}
              {threads.data && !rows.length && <p className="p-8 text-center text-sm text-muted-foreground">Nothing here.</p>}
              <ul>
                {rows.map((t) => {
                  const tk = threads.data?.tickets[t.id];
                  return (
                    <li key={t.draftId ?? t.id}>
                      <button onClick={() => openRow(t)} className="flex w-full items-start gap-3 border-b px-3 py-2.5 text-left hover:bg-muted">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`truncate text-sm ${t.unread ? "font-semibold text-foreground" : "text-foreground"}`}>{nameOf(t.from)}</span>
                            {t.count > 1 && <span className="text-xs text-muted-foreground">{t.count}</span>}
                            {tk && <Badge variant={tk.status === "resolved" ? "secondary" : tk.status === "open" ? "destructive" : "default"} className="text-[10px]">{STATUS_LABEL[tk.status]}</Badge>}
                            {tk && <span className="truncate text-xs text-muted-foreground">{tk.assignee ? `→ ${tk.assignee}${tk.how === "auto" ? " (auto)" : ""}` : "Unassigned"}</span>}
                          </div>
                          <div className={`truncate text-sm ${t.unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>{t.subject}</div>
                          <div className="truncate text-xs text-muted-foreground">{t.snippet}</div>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{shortDate(t.date)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-between p-3">
                <Button size="sm" variant="outline" disabled={!pageTokens.length} onClick={() => setPageTokens((p) => p.slice(0, -1))}>Newer</Button>
                <Button size="sm" variant="outline" disabled={!threads.data?.nextPageToken} onClick={() => setPageTokens((p) => [...p, threads.data!.nextPageToken!])}>Older</Button>
              </div>
            </>
          )}
        </section>
      </div>

      {compose && <ComposeDialog mailbox={mailbox} value={compose} onClose={() => setCompose(null)} onDone={() => { setCompose(null); refresh(); }} />}
    </div>
  );
}

function MailboxButton({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
      <Mail className="h-4 w-4 shrink-0" />
      <span className="min-w-0"><span className="block truncate text-sm">{label}</span><span className="block truncate text-xs text-muted-foreground">{sub}</span></span>
    </button>
  );
}

function ThreadView({ mailbox, threadId, folder, staff, me, onBack, onChanged, onReply }: {
  mailbox: string; threadId: string; folder: Folder; staff: { id: string; name: string }[]; me: string;
  onBack: () => void; onChanged: () => void; onReply: (c: Compose) => void;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getMailThread);
  const q = useQuery({ queryKey: ["mail-thread", mailbox, threadId], queryFn: () => load({ data: { mailbox, threadId } }), retry: false });
  const act = useServerFn(mailThreadAction);
  const action = useMutation({
    mutationFn: (a: "archive" | "inbox" | "trash" | "untrash" | "unread" | "star" | "unstar") => act({ data: { mailbox, threadId, action: a } }),
    onSuccess: (_, a) => { toast.success({ archive: "Archived", inbox: "Moved to inbox", trash: "Moved to trash", untrash: "Restored", unread: "Marked unread", star: "Starred", unstar: "Unstarred" }[a]); onChanged(); if (a !== "star" && a !== "unstar") onBack(); else qc.invalidateQueries({ queryKey: ["mail-thread", mailbox, threadId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const msgs = q.data?.thread.messages ?? [];
  const last = msgs[msgs.length - 1];
  const labels = new Set(msgs.flatMap((m) => m.labels));
  const reply = (all: boolean) => {
    if (!last) return;
    const subj = last.subject.match(/^re:/i) ? last.subject : `Re: ${last.subject}`;
    const quoted = `\n\nOn ${last.date}, ${last.from} wrote:\n${last.body.split("\n").map((l) => `> ${l}`).join("\n")}`;
    onReply({ to: last.from, cc: all ? [last.to, last.cc].filter(Boolean).join(", ") : "", subject: subj, body: quoted, threadId, inReplyTo: last.messageId || undefined, references: last.references || undefined });
  };
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => reply(false)} disabled={!last}><Reply className="mr-1 h-4 w-4" />Reply</Button>
        <Button size="sm" variant="outline" onClick={() => reply(true)} disabled={!last}>Reply all</Button>
        {labels.has("STARRED") ? <Button size="sm" variant="ghost" onClick={() => action.mutate("unstar")}><Star className="h-4 w-4 fill-current" /></Button> : <Button size="sm" variant="ghost" onClick={() => action.mutate("star")}><Star className="h-4 w-4" /></Button>}
        {folder === "trash" ? <Button size="sm" variant="ghost" onClick={() => action.mutate("untrash")}><Undo2 className="mr-1 h-4 w-4" />Restore</Button> : <>
          {labels.has("INBOX") ? <Button size="sm" variant="ghost" onClick={() => action.mutate("archive")}><Archive className="mr-1 h-4 w-4" />Archive</Button> : <Button size="sm" variant="ghost" onClick={() => action.mutate("inbox")}><Inbox className="mr-1 h-4 w-4" />Move to inbox</Button>}
          <Button size="sm" variant="ghost" onClick={() => action.mutate("unread")}>Mark unread</Button>
          <Button size="sm" variant="ghost" onClick={() => action.mutate("trash")}><Trash2 className="mr-1 h-4 w-4" />Trash</Button>
        </>}
      </div>
      {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && (
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{msgs[0]?.subject || "(no subject)"}</h2>
            {msgs.map((m) => (
              <article key={m.id} className="rounded-md border p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{m.from}</span>
                  <span className="text-xs text-muted-foreground">{m.date}</span>
                </div>
                <div className="text-xs text-muted-foreground">To: {m.to}{m.cc ? ` · Cc: ${m.cc}` : ""}</div>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-foreground">{m.body || "(no text content)"}</pre>
              </article>
            ))}
          </div>
          {q.data.ticket && <TicketPanel ticket={q.data.ticket} staff={staff} me={me} onChanged={() => { qc.invalidateQueries({ queryKey: ["mail-thread", mailbox, threadId] }); onChanged(); }} />}
        </div>
      )}
    </div>
  );
}

function TicketPanel({ ticket, staff, me, onChanged }: { ticket: any; staff: { id: string; name: string }[]; me: string; onChanged: () => void }) {
  const upd = useServerFn(updateMailTicket);
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: (patch: { assigneeId?: string | null; status?: "open" | "in_progress" | "waiting" | "resolved"; note?: string }) => upd({ data: { ticketId: ticket.id, ...patch } }),
    onSuccess: () => { toast.success("Ticket updated"); setNote(""); onChanged(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <aside className="space-y-3 rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between"><p className="font-medium text-foreground">Ticket</p><Badge variant={ticket.status === "resolved" ? "secondary" : "default"}>{STATUS_LABEL[ticket.status]}</Badge></div>
      {ticket.client && <p className="text-muted-foreground">Client: <span className="text-foreground">{ticket.client}</span></p>}
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Assigned to {ticket.how === "auto" ? "(auto — client's team)" : ""}</span>
        <select className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground" value={ticket.assigneeId ?? ""} onChange={(e) => m.mutate({ assigneeId: e.target.value || null })} disabled={m.isPending}>
          <option value="">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === me ? " (me)" : ""}</option>)}
        </select>
      </label>
      {!ticket.assigneeId && <Button size="sm" variant="outline" className="w-full" onClick={() => m.mutate({ assigneeId: me })}>Assign to me</Button>}
      <div className="grid grid-cols-2 gap-1">
        {(["open", "in_progress", "waiting", "resolved"] as const).map((s) => <Button key={s} size="sm" variant={ticket.status === s ? "default" : "outline"} onClick={() => m.mutate({ status: s })} disabled={m.isPending}>{STATUS_LABEL[s]}</Button>)}
      </div>
      <div className="space-y-1">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (not emailed)" rows={2} />
        <Button size="sm" variant="outline" disabled={!note.trim() || m.isPending} onClick={() => m.mutate({ note })}>Add note</Button>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Progress</p>
        <ol className="space-y-1.5">
          {ticket.events.map((e: any) => (
            <li key={e.id} className="text-xs text-muted-foreground">
              <span className="text-foreground">{e.actor}</span>{" "}
              {e.kind === "created" ? "ticket created" : e.kind === "assigned" ? `assigned to ${e.detail.toName}${e.detail.how === "auto" ? " (client's team)" : ""}` : e.kind === "unassigned" ? "unassigned" : e.kind === "status" ? `${STATUS_LABEL[e.detail.from] ?? e.detail.from} → ${STATUS_LABEL[e.detail.to] ?? e.detail.to}` : e.kind === "replied" ? "replied" : e.kind === "reopened" ? "reopened (new message)" : e.kind === "note" ? `noted: ${e.detail.text}` : e.kind}
              <span className="block">{new Date(e.at).toLocaleString()}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function ComposeDialog({ mailbox, value, onClose, onDone }: { mailbox: string; value: Compose; onClose: () => void; onDone: () => void }) {
  const [c, setC] = useState<Compose>(value);
  const send = useServerFn(sendMailMessage);
  const save = useServerFn(saveMailDraft);
  const discard = useServerFn(discardMailDraft);
  const message = () => ({ to: c.to, cc: c.cc || undefined, subject: c.subject, body: c.body, threadId: c.threadId, inReplyTo: c.inReplyTo, references: c.references });
  const sendM = useMutation({ mutationFn: () => send({ data: { mailbox, message: message(), draftId: c.draftId } }), onSuccess: () => { toast.success("Sent"); onDone(); }, onError: (e) => toast.error((e as Error).message) });
  const saveM = useMutation({ mutationFn: () => save({ data: { mailbox, message: message(), draftId: c.draftId } }), onSuccess: (r) => { setC((x) => ({ ...x, draftId: r.id })); toast.success("Draft saved"); onDone(); }, onError: (e) => toast.error((e as Error).message) });
  const discardM = useMutation({ mutationFn: () => discard({ data: { mailbox, draftId: c.draftId! } }), onSuccess: () => { toast.success("Draft discarded"); onDone(); }, onError: (e) => toast.error((e as Error).message) });
  const busy = sendM.isPending || saveM.isPending || discardM.isPending;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{c.threadId ? "Reply" : "New email"}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input placeholder="To" value={c.to} onChange={(e) => setC({ ...c, to: e.target.value })} />
          <Input placeholder="Cc" value={c.cc} onChange={(e) => setC({ ...c, cc: e.target.value })} />
          <Input placeholder="Subject" value={c.subject} onChange={(e) => setC({ ...c, subject: e.target.value })} />
          <Textarea rows={12} value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} />
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {c.draftId && <Button variant="ghost" disabled={busy} onClick={() => discardM.mutate()}><Trash2 className="mr-1 h-4 w-4" />Discard draft</Button>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy || !c.to.trim()} onClick={() => saveM.mutate()}>Save draft</Button>
            <Button disabled={busy || !c.to.trim() || !c.subject.trim()} onClick={() => sendM.mutate()}><Send className="mr-1 h-4 w-4" />Send</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
