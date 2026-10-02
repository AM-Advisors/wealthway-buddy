import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEAL_STAGES, DEAL_STAGE_LABELS, type DealStage } from "@/lib/crm-model";
import {
  archiveCrmContact, decideCrmCampaign, getContactDetail, getCrmWorkspace, listCrmOwners, logCrmNote, previewCrmAudience,
  reassignCrmOwner, saveCrmCampaign, saveCrmContact, saveCrmDeal, sendCrmCampaign, setCrmConsent, submitCrmCampaign,
} from "@/lib/crm.functions";

type Scope = "harmonious" | "fund";
const money = (c: number | null) => (c == null ? "-" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong.");
const CONSENT: Record<string, string> = { unknown: "No consent recorded", opted_in: "Opted in", unsubscribed: "Unsubscribed" };
const STATUS: Record<string, string> = { draft: "Draft", submitted: "Waiting for approval", approved: "Approved - ready to send", declined: "Declined", sending: "Sending…", sent: "Sent" };

/**
 * Contacts, deals and campaigns. `scope` decides whose records: "harmonious"
 * (Harmonious Sales pipeline) or "fund" (a manager's prospective investors).
 * The server filters every list to what the caller may see.
 */
export function CrmWorkspace({ scope, title, description }: { scope: Scope; title: string; description: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getCrmWorkspace);
  const [fund, setFund] = useState<string>("all");
  const q = useQuery({ queryKey: ["crm", scope, fund], queryFn: () => load({ data: { scope, offeringId: fund === "all" ? undefined : fund } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm"] });
  const [search, setSearch] = useState("");
  const [contactOpen, setContactOpen] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<any | null>(null);
  const [editDeal, setEditDeal] = useState<any | null>(null);
  const [editCampaign, setEditCampaign] = useState<any | null>(null);

  const d = q.data;
  const s = search.trim().toLowerCase();
  const contacts = (d?.contacts ?? []).filter((c: any) => !s || [c.full_name, c.email, c.organization, ...(c.tags ?? [])].some((v) => String(v ?? "").toLowerCase().includes(s)));
  const contactName = useMemo(() => new Map((d?.contacts ?? []).map((c: any) => [c.id, c.full_name])), [d]);
  const fundOptions = d?.fundOptions ?? [];
  const defaultFund = fund !== "all" ? fund : fundOptions[0]?.id ?? null;
  const canAdd = scope === "harmonious" ? !!d?.me.harmonious || !!d?.me.superUser : fundOptions.length > 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {scope === "fund" && fundOptions.length > 1 && (
          <Select value={fund} onValueChange={setFund}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my Funds</SelectItem>
              {fundOptions.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {q.isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="mt-8 text-sm text-destructive">{(q.error as Error).message}</p> : (
        <Tabs defaultValue="contacts" className="mt-6">
          <TabsList>
            <TabsTrigger value="contacts">Contacts ({d!.contacts.length})</TabsTrigger>
            <TabsTrigger value="deals">Deals ({d!.deals.length})</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns ({d!.campaigns.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Search name, email, organization or tag" value={search} onChange={(e) => setSearch(e.target.value)} />
              {canAdd && <Button onClick={() => setEditContact({ scope, offering_id: scope === "fund" ? defaultFund : null })}>Add contact</Button>}
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Organization</TableHead><TableHead>Email consent</TableHead>{scope === "fund" && <TableHead>Fund</TableHead>}<TableHead>Owner</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {contacts.length === 0 ? <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No contacts yet.</TableCell></TableRow> : contacts.map((c: any) => (
                    <TableRow key={c.id} className={c.archived_at ? "opacity-60" : ""}>
                      <TableCell><div className="font-medium">{c.full_name}</div><div className="text-xs text-muted-foreground">{c.email ?? "No email"}</div></TableCell>
                      <TableCell className="text-sm">{c.organization ?? "-"}</TableCell>
                      <TableCell><Badge variant={c.consent === "opted_in" ? "default" : "outline"}>{CONSENT[c.consent]}</Badge></TableCell>
                      {scope === "fund" && <TableCell className="text-sm">{c.fund_name}</TableCell>}
                      <TableCell className="text-sm">{c.owner_name}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setContactOpen(c.id)}>Open</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="deals">
            <div className="mb-3 flex justify-end">{d!.contacts.length > 0 && <Button onClick={() => setEditDeal({ stage: "lead" })}>Add deal</Button>}</div>
            <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
              {DEAL_STAGES.map((st) => {
                const list = d!.deals.filter((x: any) => x.stage === st && !x.archived_at);
                return (
                  <div key={st} className="rounded-md border bg-muted/30 p-2">
                    <div className="mb-2 flex justify-between text-xs font-medium uppercase text-muted-foreground"><span>{DEAL_STAGE_LABELS[st]}</span><span>{list.length}</span></div>
                    <div className="space-y-2">
                      {list.map((x: any) => (
                        <button key={x.id} onClick={() => setEditDeal(x)} className="w-full rounded border bg-background p-2 text-left text-sm hover:border-primary">
                          <div className="font-medium">{x.title}</div>
                          <div className="text-xs text-muted-foreground">{contactName.get(x.contact_id) ?? "-"} · {money(x.amount_cents)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-3">
            <div className="flex justify-end">{canAdd && <Button onClick={() => setEditCampaign({ scope, offering_id: scope === "fund" ? defaultFund : null, audience: {} })}>New campaign</Button>}</div>
            {d!.campaigns.length === 0 ? <p className="text-sm text-muted-foreground">No campaigns yet.</p> : d!.campaigns.map((c: any) => (
              <CampaignCard key={c.id} c={c} me={d!.me} onEdit={() => setEditCampaign(c)} onChange={refresh} />
            ))}
            <p className="text-xs text-muted-foreground">Every campaign is approved by a different person before it can be sent, and only contacts who opted in receive it. Each email carries an unsubscribe link.</p>
          </TabsContent>
        </Tabs>
      )}

      {editContact && <ContactDialog init={editContact} fundOptions={fundOptions} onClose={() => setEditContact(null)} onSaved={refresh} />}
      {editDeal && <DealDialog init={editDeal} contacts={d?.contacts ?? []} onClose={() => setEditDeal(null)} onSaved={refresh} />}
      {editCampaign && <CampaignDialog init={editCampaign} fundOptions={fundOptions} onClose={() => setEditCampaign(null)} onSaved={refresh} />}
      <ContactSheet id={contactOpen} canAssign={!!d?.me.canAssign} onClose={() => setContactOpen(null)} onEdit={(c) => setEditContact(c)} onChange={refresh} />
    </main>
  );
}

function ContactDialog({ init, fundOptions, onClose, onSaved }: { init: any; fundOptions: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(saveCrmContact);
  const [f, setF] = useState({ full_name: init.full_name ?? "", email: init.email ?? "", phone: init.phone ?? "", organization: init.organization ?? "", title: init.title ?? "", source: init.source ?? "", tags: (init.tags ?? []).join(", "), offering_id: init.offering_id ?? null });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setBusy(true);
    try {
      await save({ data: { id: init.id, scope: init.scope, offering_id: init.scope === "fund" ? f.offering_id : null, full_name: f.full_name, email: f.email || null, phone: f.phone || null, organization: f.organization || null, title: f.title || null, source: f.source || null, tags: f.tags.split(",").map((t: string) => t.trim()).filter(Boolean) } });
      toast.success("Contact saved"); onSaved(); onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{init.id ? "Edit contact" : "Add contact"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {init.scope === "fund" && !init.id && (
            <div><Label>Fund</Label>
              <Select value={f.offering_id ?? ""} onValueChange={(v) => setF({ ...f, offering_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick a Fund" /></SelectTrigger>
                <SelectContent>{fundOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Full name</Label><Input value={f.full_name} onChange={set("full_name")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={f.email} onChange={set("email")} /></div>
            <div><Label>Phone</Label><Input value={f.phone} onChange={set("phone")} /></div>
            <div><Label>Organization</Label><Input value={f.organization} onChange={set("organization")} /></div>
            <div><Label>Title</Label><Input value={f.title} onChange={set("title")} /></div>
            <div><Label>Source</Label><Input value={f.source} onChange={set("source")} placeholder="Referral, event…" /></div>
            <div><Label>Tags</Label><Input value={f.tags} onChange={set("tags")} placeholder="comma separated" /></div>
          </div>
          {!init.id && <p className="text-xs text-muted-foreground">New contacts start with no email consent. Record consent on the contact before including them in a campaign.</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !f.full_name.trim() || (init.scope === "fund" && !f.offering_id)} onClick={submit}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DealDialog({ init, contacts, onClose, onSaved }: { init: any; contacts: any[]; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(saveCrmDeal);
  const [f, setF] = useState({ contactId: init.contact_id ?? "", title: init.title ?? "", stage: (init.stage ?? "lead") as DealStage, amount: init.amount_cents != null ? String(init.amount_cents / 100) : "", expected_close: init.expected_close ?? "", lost_reason: init.lost_reason ?? "" });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await save({ data: { id: init.id, contactId: f.contactId, title: f.title, stage: f.stage, amount_cents: f.amount ? Math.round(Number(f.amount) * 100) : null, expected_close: f.expected_close || null, lost_reason: f.lost_reason || null } });
      toast.success("Deal saved"); onSaved(); onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{init.id ? "Edit deal" : "Add deal"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Contact</Label>
            <Select value={f.contactId} onValueChange={(v) => setF({ ...f, contactId: v })} disabled={!!init.id}>
              <SelectTrigger><SelectValue placeholder="Pick a contact" /></SelectTrigger>
              <SelectContent>{contacts.filter((c) => !c.archived_at).map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Deal name</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Stage</Label>
              <Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v as DealStage })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DEAL_STAGES.map((s) => <SelectItem key={s} value={s}>{DEAL_STAGE_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Expected amount ($)</Label><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") })} /></div>
            <div><Label>Expected close</Label><Input type="date" value={f.expected_close} onChange={(e) => setF({ ...f, expected_close: e.target.value })} /></div>
          </div>
          {f.stage === "lost" && <div><Label>Why was it lost?</Label><Input value={f.lost_reason} onChange={(e) => setF({ ...f, lost_reason: e.target.value })} /></div>}
          <p className="text-xs text-muted-foreground">A deal is a pipeline note only. Marking it Committed or Won does not create an investment or count as funded.</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !f.contactId || !f.title.trim()} onClick={submit}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDialog({ init, fundOptions, onClose, onSaved }: { init: any; fundOptions: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(saveCrmCampaign);
  const preview = useServerFn(previewCrmAudience);
  const [f, setF] = useState({ name: init.name ?? "", subject: init.subject ?? "", body: init.body ?? "", offering_id: init.offering_id ?? null, tags: (init.audience?.tags ?? []).join(", "), stages: (init.audience?.stages ?? []) as DealStage[] });
  const [count, setCount] = useState<null | { count: number; excluded: Record<string, number> }>(null);
  const [busy, setBusy] = useState(false);
  const audience = { tags: f.tags.split(",").map((t: string) => t.trim()).filter(Boolean), stages: f.stages };
  const locked = init.id && !["draft", "declined"].includes(init.status);
  async function check() {
    try { setCount(await preview({ data: { scope: init.scope, offering_id: init.scope === "fund" ? f.offering_id : null, audience, ownerUserId: init.owner_user_id } })); } catch (e) { err(e); }
  }
  async function submit() {
    setBusy(true);
    try { await save({ data: { id: init.id, scope: init.scope, offering_id: init.scope === "fund" ? f.offering_id : null, name: f.name, subject: f.subject, body: f.body, audience } }); toast.success("Campaign saved as draft"); onSaved(); onClose(); }
    catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{init.id ? (locked ? "Campaign" : "Edit campaign") : "New campaign"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {init.scope === "fund" && !init.id && (
            <div><Label>Fund</Label>
              <Select value={f.offering_id ?? ""} onValueChange={(v) => setF({ ...f, offering_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick a Fund" /></SelectTrigger>
                <SelectContent>{fundOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Campaign name (internal)</Label><Input disabled={locked} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Email subject</Label><Input disabled={locked} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
          <div><Label>Message</Label><Textarea disabled={locked} rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Leave a blank line between paragraphs." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Only contacts tagged</Label><Input disabled={locked} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="Leave blank for everyone" /></div>
            <div><Label>Only with a deal at stage</Label>
              <Select disabled={locked} value={f.stages[0] ?? "any"} onValueChange={(v) => setF({ ...f, stages: v === "any" ? [] : [v as DealStage] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="any">Any stage</SelectItem>{DEAL_STAGES.map((s) => <SelectItem key={s} value={s}>{DEAL_STAGE_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Button size="sm" variant="outline" onClick={check} disabled={init.scope === "fund" && !f.offering_id}>Check audience</Button>
            {count && <span>{count.count} will receive it. Left out: {count.excluded["notOptedIn"]} without consent, {count.excluded["unsubscribed"]} unsubscribed, {count.excluded["noEmail"]} without email, {count.excluded["archived"]} archived.</span>}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button>{!locked && <Button disabled={busy || !f.name.trim() || !f.subject.trim() || !f.body.trim() || (init.scope === "fund" && !f.offering_id)} onClick={submit}>Save draft</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignCard({ c, me, onEdit, onChange }: { c: any; me: any; onEdit: () => void; onChange: () => void }) {
  const submit = useServerFn(submitCrmCampaign);
  const decide = useServerFn(decideCrmCampaign);
  const send = useServerFn(sendCrmCampaign);
  const preview = useServerFn(previewCrmAudience);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); onChange(); } catch (e) { err(e); } finally { setBusy(false); } };
  const mine = c.created_by === me.userId;
  const canDecide = c.status === "submitted" && me.canApprove && !mine;
  const canSend = c.status === "approved" && (mine || c.decided_by === me.userId || me.superUser);
  const r = c.recipients ?? {};
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><CardTitle className="text-base">{c.name}</CardTitle><CardDescription>{c.subject}{c.fund_name ? ` · ${c.fund_name}` : ""} · by {c.owner_name}</CardDescription></div>
          <Badge variant={c.status === "sent" ? "default" : "outline"}>{STATUS[c.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {c.decision_note && <p className="text-muted-foreground">{c.status === "declined" ? "Declined" : "Approval note"} by {c.decided_by_name}: {c.decision_note}</p>}
        {c.status === "sent" && <p>{r.sent ?? 0} delivered{r.suppressed ? `, ${r.suppressed} suppressed` : ""}{r.failed ? `, ${r.failed} failed` : ""} · {new Date(c.sent_at).toLocaleString()}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>{["draft", "declined"].includes(c.status) && mine ? "Edit" : "View"}</Button>
          {["draft", "declined"].includes(c.status) && mine && <Button size="sm" disabled={busy} onClick={() => run(() => submit({ data: { id: c.id } }), "Sent for approval")}>Send for approval</Button>}
          {canDecide && (
            <>
              <Input className="h-8 w-64" placeholder="Note (required to decline)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" disabled={busy} onClick={() => run(() => decide({ data: { id: c.id, decision: "approve", note: note || undefined } }), "Approved")}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => decide({ data: { id: c.id, decision: "decline", note } }), "Declined")}>Decline</Button>
            </>
          )}
          {c.status === "submitted" && mine && <span className="text-xs text-muted-foreground">Waiting for someone else to approve.</span>}
          {canSend && confirm === null && (
            <Button size="sm" disabled={busy} onClick={async () => { try { const p = await preview({ data: { scope: c.scope, offering_id: c.offering_id, audience: c.audience ?? {}, ownerUserId: c.owner_user_id } }); setConfirm(p.count); } catch (e) { err(e); } }}>Send…</Button>
          )}
          {canSend && confirm !== null && (
            <>
              <span>Email {confirm} {confirm === 1 ? "person" : "people"} now?</span>
              <Button size="sm" disabled={busy || confirm === 0} onClick={() => run(() => send({ data: { id: c.id, confirmCount: confirm } }), "Campaign sent")}>Yes, send</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ContactSheet({ id, canAssign, onClose, onEdit, onChange }: { id: string | null; canAssign: boolean; onClose: () => void; onEdit: (c: any) => void; onChange: () => void }) {
  const load = useServerFn(getContactDetail);
  const note = useServerFn(logCrmNote);
  const consent = useServerFn(setCrmConsent);
  const archive = useServerFn(archiveCrmContact);
  const reassign = useServerFn(reassignCrmOwner);
  const owners = useServerFn(listCrmOwners);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["crm-contact", id], queryFn: () => load({ data: { contactId: id! } }), enabled: !!id });
  const ownersQ = useQuery({ queryKey: ["crm-owners"], queryFn: () => owners(), enabled: !!id && canAssign });
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"note" | "call" | "meeting" | "email_logged">("note");
  const [consentNote, setConsentNote] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["crm-contact", id] }); onChange(); };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { err(e); } };
  const c = q.data?.contact;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{c?.full_name ?? "Contact"}</SheetTitle></SheetHeader>
        {!c ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : (
          <div className="mt-4 space-y-5 text-sm">
            <div className="space-y-1">
              <div>{c.email ?? "No email"}{c.phone ? ` · ${c.phone}` : ""}</div>
              <div className="text-muted-foreground">{[c.title, c.organization].filter(Boolean).join(", ") || "-"}</div>
              {c.tags?.length > 0 && <div className="flex flex-wrap gap-1">{c.tags.map((t: string) => <Badge key={t} variant="outline">{t}</Badge>)}</div>}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { onEdit(c); onClose(); }}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => act(() => archive({ data: { contactId: c.id, reason: c.archived_at ? "Restored" : "Archived from contact page" } }), c.archived_at ? "Restored" : "Archived")}>{c.archived_at ? "Restore" : "Archive"}</Button>
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="font-medium">Email consent: {CONSENT[c.consent]}</div>
              <Input placeholder="How was consent given? (e.g. signed up at event, 3 Oct)" value={consentNote} onChange={(e) => setConsentNote(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={consentNote.trim().length < 3} onClick={() => act(() => consent({ data: { contactId: c.id, consent: "opted_in", note: consentNote } }), "Consent recorded")}>Record opt-in</Button>
                <Button size="sm" variant="outline" disabled={consentNote.trim().length < 3} onClick={() => act(() => consent({ data: { contactId: c.id, consent: "unsubscribed", note: consentNote } }), "Marked unsubscribed")}>Mark unsubscribed</Button>
              </div>
            </div>

            {canAssign && (
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select value={c.owner_user_id} onValueChange={(v) => act(() => reassign({ data: { table: "crm_contacts", id: c.id, ownerUserId: v, reason: "Reassigned from contact page" } }), "Owner changed")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(ownersQ.data ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}{!(ownersQ.data ?? []).some((o) => o.id === c.owner_user_id) && <SelectItem value={c.owner_user_id}>Current owner</SelectItem>}</SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="note">Note</SelectItem><SelectItem value="call">Call</SelectItem><SelectItem value="meeting">Meeting</SelectItem><SelectItem value="email_logged">Email (logged)</SelectItem></SelectContent>
                </Select>
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened?" />
                <Button disabled={!text.trim()} onClick={() => act(async () => { await note({ data: { contactId: c.id, kind, summary: text } }); setText(""); }, "Logged")}>Log</Button>
              </div>
              <ul className="divide-y">
                {q.data!.activity.map((a: any) => (
                  <li key={a.id} className="py-2"><div>{a.summary}</div><div className="text-xs text-muted-foreground">{a.actor_name} · {new Date(a.created_at).toLocaleString()}</div></li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">History is permanent; entries can't be edited or removed.</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
