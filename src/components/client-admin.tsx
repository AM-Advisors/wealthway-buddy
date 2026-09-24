import { useMemo, useState } from "react";
import { parseMoneyToCents, PRICE_INPUT_MESSAGE } from "@/lib/contract-coverage";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  CLIENT_RELATIONSHIP_ROLES,
  PRICING_SOURCES,
  SERVICE_STATE_LABEL,
  roleLabel,
  type ClientCapability,
} from "@/lib/client-admin-model";
import { CLIENT_TYPES } from "@/lib/contract-ingestion";
import {
  createClientFund,
  decideFundReassignment,
  decideServicePrice,
  generateClientSow,
  getClientAdmin,
  getServicesPricing,
  linkFundToClient,
  listClientFunds,
  listClientPeople,
  overrideServicePrice,
  previewClientSow,
  saveClientPerson,
  searchFundsToLink,
  setClientPersonScope,
  setClientPersonStatus,
  setServiceSelections,
  updateClient,
} from "@/lib/client-admin.functions";

const money = (c: number | null | undefined) =>
  c == null ? "Pricing required" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const err = (e: unknown) => toast.error((e as Error).message);

function useCaps(clientId: string) {
  const load = useServerFn(getClientAdmin);
  return useQuery({ queryKey: ["client-admin", clientId], queryFn: () => load({ data: { clientId } }) });
}

/* ------------------------------------------------------------ overview actions */

export function ClientOverviewActions({ clientId, goTo }: { clientId: string; goTo: (tab: string) => void }) {
  const q = useCaps(clientId);
  const [editing, setEditing] = useState(false);
  const caps = (q.data?.caps ?? []) as ClientCapability[];
  const has = (c: ClientCapability) => caps.includes(c);
  if (!q.data) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {has("edit_client") ? <Button size="sm" onClick={() => setEditing(true)}>Edit Client</Button> : null}
      {has("manage_people") ? <Button size="sm" variant="outline" onClick={() => goTo("contacts")}>+ Add Person</Button> : null}
      {has("link_funds") ? <Button size="sm" variant="outline" onClick={() => goTo("funds")}>+ Add Fund/SPV</Button> : null}
      <Button size="sm" variant="outline" onClick={() => goTo("companies")}>+ Add Company/Cap Table</Button>
      {has("manage_services") ? <Button size="sm" variant="outline" onClick={() => goTo("services")}>+ Add Services</Button> : null}
      {has("manage_sows") ? <Button size="sm" variant="outline" onClick={() => goTo("contracts")}>Upload Contract</Button> : null}
      {has("manage_sows") ? <Button size="sm" variant="outline" onClick={() => goTo("services")}>Create/Review SOW</Button> : null}
      {editing ? <EditClientDialog clientId={clientId} initial={q.data.client} staff={q.data.staff} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function EditClientDialog({ clientId, initial, staff, onClose }: { clientId: string; initial: Record<string, any>; staff: { id: string; label: string }[]; onClose: () => void }) {
  const save = useServerFn(updateClient);
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, any>>({ ...initial, address: initial["address"] ?? {} });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const text = (k: string, label: string, type = "text") => (
    <div className="space-y-1">
      <Label htmlFor={`ec-${k}`}>{label}</Label>
      <Input id={`ec-${k}`} type={type} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  async function submit() {
    setBusy(true);
    try {
      const patch: Record<string, any> = {};
      for (const k of Object.keys(f)) if (k !== "ein_last4") patch[k] = f[k] === "" ? null : f[k];
      if (patch["payment_terms_days"] != null) patch["payment_terms_days"] = Number(patch["payment_terms_days"]);
      if (!patch["legal_name"]) delete patch["legal_name"];
      if (!patch["name"]) delete patch["name"];
      const r = await save({ data: { clientId, patch } });
      toast.success(r.changed ? `Saved ${r.changed} change${r.changed === 1 ? "" : "s"}.` : "Nothing changed.");
      qc.invalidateQueries();
      onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>Changes are recorded with before and after values. Contracts, SOWs and funds are not changed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("legal_name", "Legal client name")}
          {text("name", "Display name")}
          {text("dba_name", "DBA")}
          <div className="space-y-1">
            <Label htmlFor="ec-type">Client type</Label>
            <select id="ec-type" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f["client_type"] ?? ""} onChange={(e) => set("client_type", e.target.value)}>
              <option value="">—</option>
              {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {text("entity_type", "Legal entity type")}
          {text("jurisdiction", "State / jurisdiction")}
          {text("website", "Website")}
          {text("primary_contact_name", "Primary contact")}
          {text("primary_contact_email", "Primary email", "email")}
          {text("phone", "Phone")}
          <div className="space-y-1">
            <Label htmlFor="ec-owner">Harmonious relationship owner</Label>
            <select id="ec-owner" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f["relationship_owner_id"] ?? ""} onChange={(e) => set("relationship_owner_id", e.target.value)}>
              <option value="">—</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {text("referral_source", "Referral / source")}
          <div className="space-y-1">
            <Label htmlFor="ec-status">Status</Label>
            <select id="ec-status" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f["status"] ?? "active"} onChange={(e) => set("status", e.target.value)}>
              {["prospect", "active", "inactive", "offboarding", "terminated"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {text("billing_contact_name", "Billing contact")}
          {text("billing_contact_email", "Billing email", "email")}
          {text("default_billing_frequency", "Billing frequency")}
          {text("payment_terms_days", "Payment terms (days)", "number")}
          {(["line1", "city", "state", "postal_code", "country"] as const).map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`ec-addr-${k}`}>Address — {k.replace("_", " ")}</Label>
              <Input id={`ec-addr-${k}`} value={f["address"]?.[k] ?? ""} onChange={(e) => set("address", { ...(f["address"] ?? {}), [k]: e.target.value })} />
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ec-notes">Notes</Label>
            <Textarea id="ec-notes" value={f["notes"] ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">EIN: {initial["ein_last4"] ? `••••${initial["ein_last4"]}` : "not on file"} (only the last 4 digits are stored).</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ people */

export function ClientPeoplePanel({ clientId }: { clientId: string }) {
  const load = useServerFn(listClientPeople);
  const q = useQuery({ queryKey: ["client-people", clientId], queryFn: () => load({ data: { clientId } }) });
  const [edit, setEdit] = useState<any | null>(null);
  const status = useServerFn(setClientPersonStatus);
  const scope = useServerFn(setClientPersonScope);
  const qc = useQueryClient();
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const caps = d.caps as ClientCapability[];
  const fundName = new Map((d.funds as any[]).map((f) => [f.id, f.name]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-people", clientId] });
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">People</CardTitle>
          <CardDescription>Client relationship roles are descriptive. They never grant portal access, fund access, signing or money-movement authority.</CardDescription>
        </div>
        {caps.includes("manage_people") ? <Button size="sm" onClick={() => setEdit({ roles: [] })}>+ Add Person</Button> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {!d.people.length ? <p className="text-sm text-muted-foreground">No people yet.</p> : null}
        {d.people.map((p: any) => (
          <div key={p.id} className={`rounded-lg border p-3 ${p.status === "inactive" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{p.fullName} {p.status === "inactive" ? <Badge variant="outline">Inactive</Badge> : null}</p>
                <p className="text-xs text-muted-foreground">{[p.title, p.email, p.phone].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <div className="flex gap-2">
                {caps.includes("manage_people") ? <Button size="sm" variant="outline" onClick={() => setEdit(p)}>Edit</Button> : null}
                {caps.includes("manage_people") ? (
                  <Button size="sm" variant="ghost" onClick={() => status({ data: { clientId, id: p.id, active: p.status === "inactive" } }).then(refresh, err)}>
                    {p.status === "inactive" ? "Reactivate" : "Deactivate"}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.roles.map((r: string) => <Badge key={r} variant="secondary">{roleLabel(r)}</Badge>)}
            </div>
            <div className="mt-2 text-xs">
              <span className="text-muted-foreground">Fund / company scope: </span>
              {p.scopes.length ? p.scopes.map((s: any) => (
                <span key={s.id} className="mr-2 inline-flex items-center gap-1">
                  {roleLabel(s.role)} — {s.offeringId ? fundName.get(s.offeringId) ?? "Fund" : (d.companies as any[]).find((c) => c.id === s.companyId)?.name ?? "Company"}
                  {caps.includes("manage_roles") ? (
                    <button type="button" className="text-destructive" aria-label="Remove scope" onClick={() => scope({ data: { clientId, contactId: p.id, offeringId: s.offeringId, companyId: s.companyId, role: s.role, add: false } }).then(refresh, err)}>×</button>
                  ) : null}
                </span>
              )) : "none"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Portal fund access (from the access system): {p.portalFunds.length ? p.portalFunds.map((id: string) => fundName.get(id) ?? "Fund").join(", ") : "none"}
            </p>
            {caps.includes("manage_roles") && (d.funds as any[]).length ? (
              <ScopeAdder funds={d.funds as any[]} onAdd={(offeringId, role) => scope({ data: { clientId, contactId: p.id, offeringId, role: role as any, add: true } }).then(refresh, err)} />
            ) : null}
          </div>
        ))}
        {edit ? <PersonDialog clientId={clientId} person={edit} canRoles={caps.includes("manage_roles")} onClose={() => { setEdit(null); refresh(); }} /> : null}
      </CardContent>
    </Card>
  );
}

function ScopeAdder({ funds, onAdd }: { funds: { id: string; name: string }[]; onAdd: (offeringId: string, role: string) => void }) {
  const [fund, setFund] = useState("");
  const [role, setRole] = useState("fund_manager");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <select aria-label="Fund" className="h-8 rounded-md border bg-background px-2" value={fund} onChange={(e) => setFund(e.target.value)}>
        <option value="">Associate with fund…</option>
        {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <select aria-label="Role" className="h-8 rounded-md border bg-background px-2" value={role} onChange={(e) => setRole(e.target.value)}>
        {CLIENT_RELATIONSHIP_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={!fund} onClick={() => onAdd(fund, role)}>Add</Button>
    </div>
  );
}

function PersonDialog({ clientId, person, canRoles, onClose }: { clientId: string; person: any; canRoles: boolean; onClose: () => void }) {
  const save = useServerFn(saveClientPerson);
  const [f, setF] = useState({ fullName: person.fullName ?? "", email: person.email ?? "", phone: person.phone ?? "", title: person.title ?? "", notes: person.notes ?? "", roles: (person.roles ?? []) as string[] });
  const toggle = (r: string) => setF((p) => ({ ...p, roles: p.roles.includes(r) ? p.roles.filter((x) => x !== r) : [...p.roles, r] }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person.id ? "Edit Person" : "Add Person"}</DialogTitle>
          <DialogDescription>Roles describe the relationship only. Portal access and authority are managed separately.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {(["fullName", "email", "phone", "title"] as const).map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`pp-${k}`}>{{ fullName: "Full name", email: "Email", phone: "Phone", title: "Title" }[k]}</Label>
              <Input id={`pp-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
          <fieldset disabled={!canRoles} className="space-y-1">
            <legend className="text-sm font-medium">Client roles</legend>
            <div className="grid grid-cols-2 gap-1">
              {CLIENT_RELATIONSHIP_ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={f.roles.includes(r.value)} onCheckedChange={() => toggle(r.value)} /> {r.label}
                </label>
              ))}
            </div>
            {!canRoles ? <p className="text-xs text-muted-foreground">You can't change roles.</p> : null}
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="pp-notes">Notes</Label>
            <Textarea id="pp-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.fullName.trim()} onClick={() => save({ data: { clientId, id: person.id, ...f, roles: f.roles as any } }).then(() => { toast.success("Saved."); onClose(); }, err)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ services & pricing */

export function ClientServicesPricingPanel({ clientId }: { clientId: string }) {
  const load = useServerFn(getServicesPricing);
  const q = useQuery({ queryKey: ["client-services", clientId], queryFn: () => load({ data: { clientId } }) });
  const [adding, setAdding] = useState(false);
  const [previewScope, setPreviewScope] = useState<string | null | undefined>(undefined);
  const [overriding, setOverriding] = useState<any | null>(null);
  const change = useServerFn(setServiceSelections);
  const decide = useServerFn(decideServicePrice);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-services", clientId] });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const caps = d.caps as ClientCapability[];
  const groupLabel = new Map(d.groups.map((g: any) => [g.key, g.label]));
  const byGroup = new Map<string, any[]>();
  for (const s of d.selections) byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
  const scopes = [{ id: null as string | null, name: "Client-wide" }, ...(d.funds as any[])];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Services & Pricing</CardTitle>
            <CardDescription>Selected services are Proposed. They become Contracted only when the SOW that includes them is fully executed.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {caps.includes("manage_services") ? <Button size="sm" onClick={() => setAdding(true)}>+ Add Services</Button> : null}
            <select aria-label="SOW scope" className="h-9 rounded-md border bg-background px-2 text-sm" value={previewScope === undefined ? "" : previewScope ?? "client"} onChange={(e) => setPreviewScope(e.target.value === "" ? undefined : e.target.value === "client" ? null : e.target.value)}>
              <option value="">Review Pricing / SOW for…</option>
              {scopes.map((s) => <option key={s.id ?? "client"} value={s.id ?? "client"}>{s.name}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!d.selections.length ? <p className="text-sm text-muted-foreground">No applicable services yet.</p> : null}
          {[...byGroup.entries()].map(([g, rows]) => (
            <div key={g}>
              <p className="mb-1 text-sm font-semibold">{groupLabel.get(g) ?? "Custom / Other"} · {rows.length}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr><th className="py-1">Service</th><th>Engagement</th><th>Status</th><th>Price</th><th>Frequency</th><th>Source</th><th>SOW</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((s: any) => (
                      <tr key={s.id} className="border-t align-top">
                        <td className="py-1.5">{s.serviceName}</td>
                        <td>{s.scopeLabel}</td>
                        <td>
                          <Badge variant={s.status === "contracted" ? "default" : "secondary"}>{SERVICE_STATE_LABEL[s.status] ?? s.status}</Badge>
                          {s.pendingChange ? <Badge variant="outline" className="ml-1">{s.pendingChange === "add" ? "Needs amendment" : "Removal pending amendment"}</Badge> : null}
                        </td>
                        <td className={s.cents == null ? "text-destructive" : ""}>
                          {s.priceStatus === "conflict" && s.cents == null ? "Pricing conflict" : money(s.cents)}
                          {s.customPending ? <span className="block text-xs text-muted-foreground">Custom — awaiting approval</span> : null}
                        </td>
                        <td>{s.frequency ?? s.pricingModel ?? "—"}</td>
                        <td className="text-xs">{s.source ? PRICING_SOURCES[s.source as keyof typeof PRICING_SOURCES] ?? s.source : "—"}</td>
                        <td className="text-xs">{s.sowStatus}</td>
                        <td className="space-x-1 whitespace-nowrap text-right">
                          {caps.includes("manage_pricing") && s.status === "proposed" ? <Button size="sm" variant="ghost" onClick={() => setOverriding(s)}>Price</Button> : null}
                          {caps.includes("manage_pricing") && s.customPending ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => decide({ data: { clientId, selectionId: s.id, approve: true } }).then(refresh, err)}>Approve</Button>
                              <Button size="sm" variant="ghost" onClick={() => decide({ data: { clientId, selectionId: s.id, approve: false } }).then(refresh, err)}>Reject</Button>
                            </>
                          ) : null}
                          {caps.includes("manage_services") && s.pendingChange !== "remove" ? (
                            <Button size="sm" variant="ghost" onClick={() => change({ data: { clientId, offeringId: s.offeringId, add: [], remove: [s.id] } }).then(refresh, err)}>Remove</Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {previewScope !== undefined ? <SowPreview clientId={clientId} offeringId={previewScope} canGenerate={caps.includes("manage_sows")} onDone={refresh} /> : null}
      {adding ? <AddServicesDialog clientId={clientId} groups={d.groups} funds={d.funds as any[]} existing={d.selections} onClose={() => { setAdding(false); refresh(); }} /> : null}
      {overriding ? <OverrideDialog clientId={clientId} sel={overriding} onClose={() => { setOverriding(null); refresh(); }} /> : null}
    </div>
  );
}

function AddServicesDialog({ clientId, groups, funds, existing, onClose }: { clientId: string; groups: any[]; funds: any[]; existing: any[]; onClose: () => void }) {
  const change = useServerFn(setServiceSelections);
  const [scope, setScope] = useState<string>("client");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const offeringId = scope === "client" ? null : scope;
  const already = new Set(existing.filter((s) => (s.offeringId ?? null) === offeringId).map((s) => s.serviceKey));
  const filtered = useMemo(() => groups.map((g) => ({ ...g, services: g.services.filter((s: any) => !search || s.name.toLowerCase().includes(search.toLowerCase())) })).filter((g) => g.services.length), [groups, search]);
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const nameOf = new Map(groups.flatMap((g) => g.services.map((s: any) => [s.key, s.name])));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Services</DialogTitle>
          <DialogDescription>Only approved catalog services. Selecting a service proposes it — nothing is contracted or activated.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Service scope" className="h-9 rounded-md border bg-background px-2 text-sm" value={scope} onChange={(e) => { setScope(e.target.value); setPicked(new Set()); }}>
            <option value="client">Client-wide</option>
            {funds.map((f) => <option key={f.id} value={f.id}>Only {f.name}</option>)}
          </select>
          <Input placeholder="Search services" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
        <div className="space-y-2">
          {filtered.map((g) => {
            const count = g.services.filter((s: any) => picked.has(s.key)).length;
            const isOpen = open.has(g.key) || !!search;
            return (
              <div key={g.key} className="rounded-lg border">
                <button type="button" className="flex w-full items-center justify-between p-2 text-left text-sm font-medium" onClick={() => setOpen((p) => { const n = new Set(p); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })} aria-expanded={isOpen}>
                  <span>{g.label} · {count} selected</span><span>{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen ? (
                  <div className="space-y-1 border-t p-2">
                    <div className="flex gap-2 text-xs">
                      <button type="button" className="text-primary" onClick={() => setPicked((p) => new Set([...p, ...g.services.filter((s: any) => !already.has(s.key)).map((s: any) => s.key)]))}>Select all</button>
                      <button type="button" className="text-primary" onClick={() => setPicked((p) => new Set([...p].filter((k) => !g.services.some((s: any) => s.key === k))))}>Clear</button>
                    </div>
                    {g.services.map((s: any) => (
                      <label key={s.key} className="flex items-start gap-2 text-sm">
                        <Checkbox disabled={already.has(s.key)} checked={picked.has(s.key) || already.has(s.key)} onCheckedChange={() => toggle(s.key)} />
                        <span>{s.name}{already.has(s.key) ? <span className="text-xs text-muted-foreground"> (already selected)</span> : null}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {picked.size ? (
          <div className="rounded-lg bg-muted p-2 text-sm">
            <p className="font-medium">Applicable Services</p>
            <p className="text-muted-foreground">{[...picked].map((k) => nameOf.get(k)).join(", ")}</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!picked.size} onClick={() => change({ data: { clientId, offeringId, add: [...picked], remove: [] } }).then((r) => { toast.success(r.requires === "amendment" ? "Added. An executed SOW exists, so these need an amendment." : "Services proposed."); onClose(); }, err)}>Add {picked.size || ""} services</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverrideDialog({ clientId, sel, onClose }: { clientId: string; sel: any; onClose: () => void }) {
  const save = useServerFn(overrideServicePrice);
  const [amount, setAmount] = useState(sel.cents != null ? String(sel.cents / 100) : "");
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom price — {sel.serviceName}</DialogTitle>
          <DialogDescription>Applies to {sel.scopeLabel} only. The standard price list is not changed. Another person with pricing permission must approve it before the SOW can go to signature.</DialogDescription>
        </DialogHeader>
        <p className="text-sm">Current: {money(sel.cents)} {sel.source ? `(${PRICING_SOURCES[sel.source as keyof typeof PRICING_SOURCES] ?? sel.source})` : ""}</p>
        <div className="space-y-1"><Label htmlFor="ov-a">Proposed price (USD)</Label><Input id="ov-a" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ov-r">Reason</Label><Textarea id="ov-r" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={parseMoneyToCents(amount) == null || reason.trim().length < 5} onClick={() => { const cents = parseMoneyToCents(amount); if (cents == null) { toast.error(PRICE_INPUT_MESSAGE); return; } return save({ data: { clientId, selectionId: sel.id, cents, reason } }).then(() => { toast.success("Custom price proposed."); onClose(); }, err); }}>Propose price</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SowPreview({ clientId, offeringId, canGenerate, onDone }: { clientId: string; offeringId: string | null; canGenerate: boolean; onDone: () => void }) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const load = useServerFn(previewClientSow);
  const gen = useServerFn(generateClientSow);
  const q = useQuery({ queryKey: ["sow-preview", clientId, offeringId, templateId], queryFn: () => load({ data: { clientId, offeringId, templateId } }) });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const p = q.data!;
  const blocking = p.blockers.filter((b: any) => b.kind !== "no_services");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">SOW Preview — {p.offering?.name ?? "Client-wide"} {p.mode === "amendment" ? "(amendment)" : ""}</CardTitle>
        <CardDescription>
          {p.executedSow && p.mode === "amendment" ? "An executed SOW already covers this engagement. It stays unchanged; changes go into an amendment for review and signature." : "Generating creates a Draft SOW only. It still needs review, approval and client signature."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Template</dt><dd>{p.template ? `${p.template.name} v${p.template.version} (effective ${p.template.effectiveDate})` : "None available"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Governing agreement</dt><dd>{p.governing ? p.governing.title : "No approved MSA on file"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Existing draft</dt><dd>{p.draftSow ? "Yes — generating updates it" : "No"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Special terms</dt><dd>{p.specialTerms.length ? p.specialTerms.join("; ") : "None approved"}</dd></div>
        </dl>
        <table className="w-full">
          <thead className="text-left text-xs text-muted-foreground"><tr><th>Service</th><th>Scope</th><th>Frequency</th><th>Fee</th><th>Pricing source</th></tr></thead>
          <tbody>
            {p.lines.map((l: any) => (
              <tr key={l.selectionId} className="border-t align-top">
                <td className="py-1">{l.change === "remove" ? "Remove: " : ""}{l.serviceName}</td>
                <td className="text-xs text-muted-foreground">{l.scope ?? "—"}</td>
                <td>{l.frequency ?? l.pricingModel ?? "—"}</td>
                <td>{l.change === "remove" ? "—" : money(l.cents)}</td>
                <td className="text-xs">{l.pricingSource ? PRICING_SOURCES[l.pricingSource as keyof typeof PRICING_SOURCES] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.blockers.length ? (
          <ul className="space-y-1 rounded-md border border-destructive/40 p-2 text-destructive">
            {p.blockers.map((b: any, i: number) => <li key={i}>• {b.message}</li>)}
          </ul>
        ) : <p className="text-muted-foreground">No problems found.</p>}
        <Link to="/ops/contracts/sow-templates" className="text-xs text-primary hover:underline">Manage SOW templates</Link>
        {canGenerate ? (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Template override" className="h-9 rounded-md border bg-background px-2" value={templateId ?? ""} onChange={(e) => setTemplateId(e.target.value || null)}>
                <option value="">Default: latest approved template</option>
                {p.templates.filter((t: any) => t.status === "approved" && !t.retiredAt).map((t: any) => <option key={t.id} value={t.id}>{t.name} v{t.version}</option>)}
              </select>
              {templateId ? <Input placeholder="Reason for a different template" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm" /> : null}
            </div>
            <Button
              disabled={!p.template || !p.lines.length || (!!templateId && reason.trim().length < 5)}
              onClick={() => gen({ data: { clientId, offeringId, templateId, overrideReason: reason || undefined } }).then((r) => {
                toast.success(r.outcome === "reused_executed" ? "An executed SOW already covers this — reused." : r.outcome === "no_template" ? "No approved template — task raised." : "Draft SOW saved. It is not signed or executed.");
                q.refetch(); onDone();
              }, err)}
            >
              Generate / Update Draft SOW
            </Button>
            {blocking.length ? <p className="text-xs text-muted-foreground">You can save the draft, but it can't go to signature until the items above are resolved.</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ funds */

export function ClientFundsPanel({ clientId }: { clientId: string }) {
  const load = useServerFn(listClientFunds);
  const q = useQuery({ queryKey: ["client-funds", clientId], queryFn: () => load({ data: { clientId } }) });
  const [mode, setMode] = useState<null | "create" | "link">(null);
  const decide = useServerFn(decideFundReassignment);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-funds", clientId] });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const caps = d.caps as ClientCapability[];
  const pending = (d.reassignments as any[]).filter((r) => r.status === "pending");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Funds & SPVs</CardTitle>
            <CardDescription>MSA: {d.msaStatus}. A fund can exist without Harmonious being contractually engaged — that needs an executed SOW.</CardDescription>
          </div>
          {caps.includes("link_funds") ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setMode("create")}>+ Create New Fund/SPV</Button>
              <Button size="sm" variant="outline" onClick={() => setMode("link")}>Link Existing Fund/SPV</Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!d.funds.length ? <p className="text-sm text-muted-foreground">No funds yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Fund</th><th>Type</th><th>Fund manager(s)</th><th>Setup</th><th>Services</th><th>Contract coverage</th><th>SOW</th><th>Version</th><th>Pricing source</th><th>Drive</th><th>Engaged</th></tr></thead>
              <tbody>
                {d.funds.map((f: any) => (
                  <tr key={f.id} className="border-t align-top">
                    <td className="py-1.5"><Link to="/ops/funds/$fundId" params={{ fundId: f.id } as any} className="text-primary hover:underline">{f.name}</Link></td>
                    <td>{f.type}</td>
                    <td>{f.managers.join(", ") || "—"}</td>
                    <td>{f.setupStatus}</td>
                    <td>{f.services.length}</td>
                    <td className="min-w-48">
                      <details>
                        <summary className="cursor-pointer"><Badge variant={f.coverage?.status?.startsWith("covered") ? "default" : f.coverage?.status === "needs_review" || f.coverage?.status === "msa_only" ? "secondary" : "outline"}>{f.coverage?.label ?? "—"}</Badge></summary>
                        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                          <p>MSA: {f.coverage?.msa?.title ?? "none on file"}</p>
                          {(f.coverage?.sows ?? []).map((s: any) => <p key={s.id}>{s.executed ? "Executed" : "Draft"}: {s.title}{s.version ? ` v${s.version}` : ""} · {s.funds} fund(s) · {s.services.length} service(s)</p>)}
                          {f.coverage?.services ? <p>{f.coverage.services.message}{f.coverage.services.uncovered.length ? ` Uncovered: ${f.coverage.services.uncovered.join(", ")}` : ""}</p> : null}
                        </div>
                      </details>
                    </td>
                    <td><Badge variant={f.sowStatus === "Executed" ? "default" : f.sowStatus === "No SOW" ? "destructive" : "secondary"}>{f.sowStatus}</Badge></td>
                    <td>{f.sowVersion ? `v${f.sowVersion}` : "—"}</td>
                    <td className="text-xs">{f.pricingSources.map((s: string) => PRICING_SOURCES[s as keyof typeof PRICING_SOURCES] ?? s).join(", ") || "—"}</td>
                    <td className="text-xs">{f.driveStatus}</td>
                    <td>{f.contractuallyEngaged ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {pending.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Fund reassignments awaiting review</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {pending.map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                <span>{r.reason}</span>
                {caps.includes("link_funds") ? (
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => decide({ data: { id: r.id, approve: true } }).then(refresh, err)}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => decide({ data: { id: r.id, approve: false } }).then(refresh, err)}>Reject</Button>
                  </span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {mode === "create" ? <CreateFundDialog clientId={clientId} onClose={() => { setMode(null); refresh(); }} /> : null}
      {mode === "link" ? <LinkFundDialog clientId={clientId} onClose={() => { setMode(null); refresh(); }} /> : null}
    </div>
  );
}

function CreateFundDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const create = useServerFn(createClientFund);
  const [f, setF] = useState({ name: "", fundType: "", entityType: "", legalEntityName: "", jurisdiction: "", regType: "506b" });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Fund/SPV</DialogTitle>
          <DialogDescription>Starts in setup. Compliance, banking, accounting and onboarding are not marked complete. If no executed SOW covers it, a Draft SOW is prepared from the current approved template.</DialogDescription>
        </DialogHeader>
        {([["name", "Fund / SPV name"], ["fundType", "Structure / type (e.g. SPV, Venture Fund)"], ["entityType", "Entity type"], ["legalEntityName", "Legal entity (if formed)"], ["jurisdiction", "Jurisdiction"]] as const).map(([k, l]) => (
          <div key={k} className="space-y-1"><Label htmlFor={`cf-${k}`}>{l}</Label><Input id={`cf-${k}`} value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="cf-reg">Offering exemption</Label>
          <select id="cf-reg" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.regType} onChange={(e) => setF({ ...f, regType: e.target.value })}>
            {["506b", "506c", "regcf", "rega", "regaplus"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">Add services for this fund afterwards on Services & Pricing.</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || f.name.trim().length < 2} onClick={() => { setBusy(true); create({ data: { clientId, ...f, regType: f.regType as any, serviceKeys: [] } }).then((r) => { toast.success(`Fund created in setup. Contract coverage: ${r.coverage.label}. No SOW was created.`); onClose(); }, err).finally(() => setBusy(false)); }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkFundDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [term, setTerm] = useState("");
  const [reason, setReason] = useState("");
  const search = useServerFn(searchFundsToLink);
  const link = useServerFn(linkFundToClient);
  const q = useQuery({ queryKey: ["fund-link-search", clientId, term], queryFn: () => search({ data: { clientId, q: term } }) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link Existing Fund/SPV</DialogTitle>
          <DialogDescription>A fund that belongs to another client is never moved silently — it needs a reason and a second person's review.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search funds" value={term} onChange={(e) => setTerm(e.target.value)} />
        <Input placeholder="Reason (required for a fund owned by another client)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="space-y-2">
          {(q.data ?? []).map((f: any) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
              <div>
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">Client: {f.currentClient ?? "none"} · {f.status} · {f.managerCount} fund manager(s) · {f.sow}</p>
              </div>
              {f.plan === "already_linked" ? <Badge variant="secondary">Already linked</Badge> : (
                <Button size="sm" variant={f.plan === "link" ? "default" : "outline"} disabled={f.plan === "reassignment_required" && reason.trim().length < 10}
                  onClick={() => link({ data: { clientId, offeringId: f.id, reason: reason || undefined } }).then((r) => { toast.success(r.outcome === "reassignment_requested" ? "Reassignment requested for review." : "Fund linked."); onClose(); }, err)}>
                  {f.plan === "link" ? "Link" : "Request reassignment"}
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
