import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_TAGS, cancelClientContactInvite, getContactHistory, inviteClientContact,
  listClientContacts, saveClientContact, setClientContactActive,
} from "@/lib/client-contacts.functions";
import { toCsv } from "@/lib/company-360-model";

export type Ownership = { securities: number; pctFullyDiluted: number };
type Contact = NonNullable<Awaited<ReturnType<typeof listClientContacts>>>["contacts"][number];

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  active: { label: "Active", variant: "default" },
  invited: { label: "Invited", variant: "secondary" },
  not_invited: { label: "Not invited", variant: "outline" },
  inactive: { label: "Inactive", variant: "destructive" },
};
const EVENT_LABEL: Record<string, string> = {
  created: "Contact added", edited: "Details edited", invited: "Invite sent", invite_resent: "Invite resent",
  invite_cancelled: "Invite cancelled", deactivated: "Deactivated", reactivated: "Reactivated",
};
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "-");

export function ClientContactsDirectory({ ownershipByEmail }: { ownershipByEmail: Record<string, Ownership> }) {
  const list = useServerFn(listClientContacts);
  const invite = useServerFn(inviteClientContact);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["client-contacts"], queryFn: () => list({ data: {} }) });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const data = q.data;
  const rows = useMemo(() => (data?.contacts ?? []).filter((c) =>
    (status === "all" || c.status === status) && (tag === "all" || c.tags.includes(tag)) &&
    `${c.name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())), [data, search, status, tag]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-contacts"] });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading contacts...</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Your account isn't linked to a client yet.</p>;

  const own = (c: Contact) => (c.email ? ownershipByEmail[c.email.toLowerCase()] : undefined);
  const exportCsv = () => {
    const csv = toCsv([["Name", "Title", "Email", "Phone", "Status", "Roles", "Primary", "Identity", "Securities", "Fully diluted %", "Notes"],
      ...rows.map((c) => [c.name, c.title ?? "", c.email ?? "", c.phone ?? "", STATUS[c.status].label, c.tags.join("; "),
        c.isPrimary ? "Yes" : "", c.identity, String(own(c)?.securities ?? ""), own(c) ? (own(c)!.pctFullyDiluted * 100).toFixed(2) : "", c.notes ?? ""])]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "contacts.csv"; a.click();
  };
  const bulkTargets = rows.filter((c) => selected.has(c.id) && c.email && c.status !== "inactive" && c.status !== "active");
  const runBulk = async () => {
    let ok = 0;
    for (const c of bulkTargets) { try { await invite({ data: { id: c.id } }); ok++; } catch { /* reported below */ } }
    toast.success(`${ok} of ${bulkTargets.length} invites sent`);
    setBulkOpen(false); setSelected(new Set()); refresh();
  };
  const open = data.contacts.find((c) => c.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="all">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Role filter">
          <option value="all">All roles</option>
          {CONTACT_TAGS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
          {data.canEdit ? <>
            <Button variant="outline" size="sm" disabled={!selected.size} onClick={() => setBulkOpen(true)}>Invite selected ({selected.size})</Button>
            <Button size="sm" onClick={() => setEditing("new")}>Add contact</Button>
          </> : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No contacts match. {data.canEdit ? "Add a contact to get started." : ""}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {data.canEdit ? <th className="w-8 p-2" /> : null}
                <th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Phone</th><th className="p-2">Status</th>
                <th className="p-2">Roles</th><th className="p-2 text-right">Ownership</th><th className="p-2">Last activity</th><th className="p-2">Notes</th>
                {data.canEdit ? <th className="p-2 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setOpenId(c.id)}>
                  {data.canEdit ? <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(c.id)} aria-label={`Select ${c.name}`} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(c.id) : n.delete(c.id); return n; })} />
                  </td> : null}
                  <td className="p-2">
                    <div className="font-medium">{c.name} {c.isPrimary ? <Badge variant="secondary" className="ml-1">Primary</Badge> : null}</div>
                    {c.title ? <div className="text-xs text-muted-foreground">{c.title}</div> : null}
                  </td>
                  <td className="p-2">{c.email ?? "-"}</td>
                  <td className="p-2">{c.phone ?? "-"}</td>
                  <td className="p-2"><Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
                    {c.identity !== "unknown" ? <div className="mt-1 text-xs text-muted-foreground">{c.identity === "verified" ? "Identity verified" : "Identity check needed"}</div> : null}
                  </td>
                  <td className="p-2"><div className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div></td>
                  <td className="p-2 text-right">{own(c) ? `${own(c)!.securities.toLocaleString()} (${(own(c)!.pctFullyDiluted * 100).toFixed(2)}%)` : "-"}</td>
                  <td className="p-2">{fmt(c.lastActivity)}</td>
                  <td className="max-w-[200px] truncate p-2 text-muted-foreground" title={c.notes ?? ""}>{c.notes ?? "-"}</td>
                  {data.canEdit ? <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}><RowActions c={c} onDone={refresh} onEdit={() => setEditing(c)} /></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? <ContactForm clientId={data.clientId} contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} /> : null}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send {bulkTargets.length} invite{bulkTargets.length === 1 ? "" : "s"}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Each person gets one email inviting them to sign in. Contacts without an email, inactive contacts and people already signed in are skipped.</p>
          <ul className="max-h-48 overflow-y-auto text-sm">{bulkTargets.map((c) => <li key={c.id}>{c.name} - {c.email}</li>)}</ul>
          <DialogFooter><Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button><Button disabled={!bulkTargets.length} onClick={runBulk}>Send invites</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">{open ? <ContactPanel c={open} own={own(open)} /> : null}</SheetContent>
      </Sheet>
    </div>
  );
}

function RowActions({ c, onDone, onEdit }: { c: Contact; onDone: () => void; onEdit: () => void }) {
  const invite = useServerFn(inviteClientContact);
  const cancel = useServerFn(cancelClientContactInvite);
  const setActive = useServerFn(setClientContactActive);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); onDone(); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
      {c.status === "inactive" ? (
        <Button size="sm" variant="ghost" onClick={() => run(() => setActive({ data: { id: c.id, active: true } }), "Reactivated")}>Reactivate</Button>
      ) : <>
        {c.status !== "active" && c.email ? (
          <Button size="sm" variant="ghost" onClick={() => run(() => invite({ data: { id: c.id } }), "Invite sent")}>{c.status === "invited" ? "Resend" : "Invite"}</Button>
        ) : null}
        {c.status === "invited" ? <Button size="sm" variant="ghost" onClick={() => run(() => cancel({ data: { id: c.id } }), "Invite cancelled")}>Cancel invite</Button> : null}
        <Button size="sm" variant="ghost" onClick={() => window.confirm(`Deactivate ${c.name}? They stay on record and can be reactivated.`) && run(() => setActive({ data: { id: c.id, active: false } }), "Deactivated")}>Deactivate</Button>
      </>}
    </div>
  );
}

function ContactForm({ clientId, contact, onClose, onSaved }: { clientId: string; contact: Contact | null; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(saveClientContact);
  const [f, setF] = useState({
    name: contact?.name ?? "", title: contact?.title ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "",
    notes: contact?.notes ?? "", tags: contact?.tags ?? [], isPrimary: contact?.isPrimary ?? false,
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await save({ data: { clientId, id: contact?.id, ...f, tags: f.tags as any } });
      toast.success(contact ? "Contact updated" : "Contact added");
      if (r.possibleMatch) toast.info("Someone with this email already exists on Harmonious. Harmonious can link them; nothing was merged.");
      onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const field = (k: "name" | "title" | "email" | "phone", label: string, type = "text") => (
    <div className="space-y-1"><Label htmlFor={`c-${k}`}>{label}</Label><Input id={`c-${k}`} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("name", "Name")}{field("title", "Title")}{field("email", "Email", "email")}{field("phone", "Phone", "tel")}
        </div>
        <div className="space-y-1">
          <Label>Roles</Label>
          <div className="flex flex-wrap gap-3">
            {CONTACT_TAGS.map((t) => (
              <label key={t} className="flex items-center gap-1 text-sm">
                <Checkbox checked={f.tags.includes(t)} onCheckedChange={(v) => setF({ ...f, tags: v ? [...f.tags, t] : f.tags.filter((x) => x !== t) })} />{t}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isPrimary} onCheckedChange={(v) => setF({ ...f, isPrimary: Boolean(v) })} />Primary contact for this client</label>
        <div className="space-y-1"><Label htmlFor="c-notes">Notes (only your team and Harmonious can see these)</Label><Textarea id="c-notes" rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !f.name.trim()} onClick={submit}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactPanel({ c, own }: { c: Contact; own?: Ownership }) {
  const hist = useServerFn(getContactHistory);
  const q = useQuery({ queryKey: ["client-contact-history", c.id], queryFn: () => hist({ data: { id: c.id } }) });
  return (
    <>
      <SheetHeader><SheetTitle>{c.name}</SheetTitle></SheetHeader>
      <div className="mt-4 space-y-2 text-sm">
        {c.title ? <p><span className="text-muted-foreground">Title:</span> {c.title}</p> : null}
        <p><span className="text-muted-foreground">Email:</span> {c.email ?? "-"}</p>
        <p><span className="text-muted-foreground">Phone:</span> {c.phone ?? "-"}</p>
        <p><span className="text-muted-foreground">Status:</span> {STATUS[c.status].label}{c.invitedAt ? ` (last invited ${fmt(c.invitedAt)}, ${c.inviteCount} total)` : ""}</p>
        <p><span className="text-muted-foreground">Identity:</span> {c.identity === "verified" ? "Verified" : c.identity === "needed" ? "Check needed" : "No email on file"}</p>
        <p><span className="text-muted-foreground">Roles:</span> {c.tags.join(", ") || "-"}</p>
        <p><span className="text-muted-foreground">Ownership:</span> {own ? `${own.securities.toLocaleString()} securities, ${(own.pctFullyDiluted * 100).toFixed(2)}% fully diluted` : "Not on the cap table"}</p>
        <div><p className="text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{c.notes || "-"}</p></div>
        <div className="pt-2">
          <p className="mb-1 font-medium">Activity</p>
          {q.isLoading ? <p className="text-muted-foreground">Loading...</p> : (q.data ?? []).length === 0 ? <p className="text-muted-foreground">No activity yet.</p> : (
            <ul className="space-y-1">{(q.data ?? []).map((e, i) => <li key={i} className="flex justify-between border-b pb-1"><span>{EVENT_LABEL[e.event_kind] ?? e.event_kind}</span><span className="text-muted-foreground">{fmt(e.created_at)}</span></li>)}</ul>
          )}
        </div>
      </div>
    </>
  );
}
