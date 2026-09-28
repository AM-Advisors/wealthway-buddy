import { PROTECTED_PERMISSIONS } from "@/lib/authorize";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  assignAccessRole,
  getAccessAdminContext,
  getLegacyCompatibility,
  grantAccessPermission,
  revokeAccessPermission,
  revokeAccessRole,
  saveRoleDefinition,
  setAccountState,
} from "@/lib/access-admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : "—");
const toIso = (v: string) => (v ? new Date(v).toISOString() : null);

type Canonical = {
  suspended: boolean;
  assignments: { id: string; roleKey: string; label: string; scope: string; effectiveAt: string; expiresAt: string | null; revokedAt: string | null; live: boolean; reason: string }[];
  grants: { id: string; permission: string; effect: string; scope: string; effectiveAt: string; expiresAt: string | null; revokedAt: string | null; live: boolean; reason: string }[];
  matrix: { permission: string; global: boolean; text: string; sources: string[]; scoped: { source: string; scope: string }[] }[];
  atomic?: AtomicRow[];
};
export type AtomicRow = { key: string; label: string; area: string; summary: string; destructive: boolean; global: boolean; text: string; sources: string[]; scoped: { source: string; scope: string }[] };

/** Atomic permissions under one Clients/Funds matrix cell, with source and scope. */
export function AtomicDrawer({ rows, area, summary }: { rows: AtomicRow[]; area: string; summary: string }) {
  const list = rows.filter((r) => r.area === area && r.summary === summary);
  if (!list.length) return null;
  return (
    <div className="rounded-md border p-3" data-testid="atomic-drawer">
      <p className="mb-2 text-sm font-medium">{area === "clients" ? "Clients" : "Funds & SPVs"} → {summary.replace("_", " ")}: atomic permissions</p>
      <ul className="space-y-1 text-sm">
        {list.map((r) => (
          <li key={r.key}>
            <span className={r.global ? "font-medium" : r.scoped.length ? "" : "text-muted-foreground"}>{r.global ? "✓" : r.scoped.length ? "◐" : "·"} {r.label}</span>
            {r.destructive ? <Badge variant="outline" className="ml-1">lifecycle — never implied</Badge> : null}
            <span className="ml-2 text-xs text-muted-foreground">{r.key}</span>
            <div className="text-xs text-muted-foreground">
              {r.global ? `Source: ${r.sources.join(", ")} — scope: All resources` : r.scoped.length ? r.scoped.map((x) => `${x.source} — scope: ${x.scope}`).join("; ") : "Not granted"}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function useAccessAdmin() {
  const get = useServerFn(getAccessAdminContext);
  return useQuery({ queryKey: ["access-admin-context"], queryFn: () => get() });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["access-profile", "access-people", "access-audit", "access-admin-context"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

const LegacyNote = () => (
  <p className="text-xs text-muted-foreground">
    <Badge variant="outline">Effective in canonical resolver</Badge> scoped roles, direct grants and denies. Existing business
    screens still use their own checks (<Badge variant="secondary">Legacy endpoint not yet migrated</Badge>) until Stage 3 — a deny here
    doesn't yet block them. Harmonious platform roles and suspension take effect everywhere immediately.
  </p>
);

function ScopePicker({ scopeTypes, value, onChange }: { scopeTypes: string[]; value: { type: string; id: string | null }; onChange: (v: { type: string; id: string | null }) => void }) {
  const { data } = useAccessAdmin();
  const options = value.type === "global" ? [] : ((data?.scopes as any)?.[value.type] ?? []);
  return (
    <div className="flex flex-wrap gap-2">
      <select className="h-9 rounded-md border bg-background px-2 text-sm" value={value.type} onChange={(e) => onChange({ type: e.target.value, id: null })}>
        {scopeTypes.map((s) => <option key={s} value={s}>{s === "global" ? "Global" : s.replace("_", " ")}</option>)}
      </select>
      {value.type !== "global" ? (
        options.length ? (
          <select className="h-9 min-w-48 rounded-md border bg-background px-2 text-sm" value={value.id ?? ""} onChange={(e) => onChange({ ...value, id: e.target.value || null })}>
            <option value="">Select…</option>
            {options.map((o: any) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        ) : (
          <Input className="h-9 w-72" placeholder="Record ID" value={value.id ?? ""} onChange={(e) => onChange({ ...value, id: e.target.value || null })} />
        )
      ) : null}
    </div>
  );
}

/** Writable controls inside a person's Access Profile. */
export function ManageAccessPanel({ userId, canonical, platformRoles }: { userId: string; canonical: Canonical; platformRoles: string[] }) {
  const { data: ctx } = useAccessAdmin();
  const refresh = useRefresh();
  const assign = useServerFn(assignAccessRole);
  const revokeRole = useServerFn(revokeAccessRole);
  const grant = useServerFn(grantAccessPermission);
  const revokeGrant = useServerFn(revokeAccessPermission);
  const setState = useServerFn(setAccountState);

  const [reason, setReason] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [roleScope, setRoleScope] = useState<{ type: string; id: string | null }>({ type: "global", id: null });
  const [perm, setPerm] = useState("");
  const [effect, setEffect] = useState<"allow" | "deny">("allow");
  const [permScope, setPermScope] = useState<{ type: string; id: string | null }>({ type: "global", id: null });
  const [effectiveAt, setEffectiveAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const run = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { toast.success("Access updated and recorded in the audit log."); setReason(""); refresh(); },
    onError: (e: Error) => { toast.error(e.message); refresh(); },
  });
  if (!ctx?.canManage && !ctx) return null;

  const roles = [...(ctx?.templates ?? []), ...(ctx?.custom ?? []).filter((c) => c.status === "active").map((c) => ({ key: c.key, label: `${c.label} (custom v${c.version})`, scopeTypes: ["global"], superAdminOnly: false, category: "custom" }))];
  const chosen = roles.find((r) => r.key === roleKey);
  const self = ctx?.actorId === userId;
  const dateArgs = { effectiveAt: toIso(effectiveAt), expiresAt: toIso(expiresAt) };

  return (
    <div className="space-y-4 rounded-md border p-3">
      <LegacyNote />
      {self ? <p className="text-xs text-destructive">This is your own account — you can't grant yourself access or change your own state.</p> : null}
      <label className="block text-xs font-medium">Reason (required for every change)
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1" placeholder="Why is this change being made?" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">Effective from (optional)<Input type="datetime-local" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} /></label>
        <label className="text-xs">Expires (optional)<Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Assign role</p>
        <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={roleKey} onChange={(e) => { setRoleKey(e.target.value); const r = roles.find((x) => x.key === e.target.value); setRoleScope({ type: r?.scopeTypes[0] ?? "global", id: null }); }}>
          <option value="">Choose a role…</option>
          {["harmonious", "client", "fund", "company", "custom"].map((cat) => (
            <optgroup key={cat} label={cat[0]!.toUpperCase() + cat.slice(1)}>
              {roles.filter((r) => r.category === cat).map((r) => (
                <option key={r.key} value={r.key} disabled={r.superAdminOnly && !ctx?.isSuper}>{r.label}{r.superAdminOnly ? " — Super Administrator only" : ""}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {chosen ? <ScopePicker scopeTypes={chosen.scopeTypes} value={roleScope} onChange={setRoleScope} /> : null}
        <Button size="sm" disabled={!roleKey || run.isPending || self} onClick={() => run.mutate(() => assign({ data: { targetUserId: userId, roleKey, scope: roleScope as any, reason, ...dateArgs } }))}>Assign role</Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Current roles</p>
        <ul className="space-y-1 text-sm">
          {platformRoles.map((r) => {
            const t = ctx?.templates.find((x) => x.platformRole === r);
            return (
              <li key={r} className="flex items-center justify-between gap-2">
                <span>{t?.label ?? r} <Badge variant="outline">Legacy platform role — no expiry</Badge></span>
                {t ? <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(() => revokeRole({ data: { targetUserId: userId, roleKey: t.key, assignmentId: null, reason } }))}>Remove</Button> : <span className="text-xs text-muted-foreground">not managed here</span>}
              </li>
            );
          })}
          {canonical.assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <span className={a.live ? "" : "text-muted-foreground line-through"}><Badge variant="secondary">RBAC assignment — effective/expiring</Badge> {a.label} — {a.scope} {a.expiresAt ? `· until ${fmt(a.expiresAt)}` : ""} {a.revokedAt ? "· revoked" : !a.live ? "· not in effect" : ""}</span>
              {!a.revokedAt ? <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(() => revokeRole({ data: { targetUserId: userId, roleKey: a.roleKey, assignmentId: a.id, reason } }))}>Revoke</Button> : null}
            </li>
          ))}
          {!platformRoles.length && !canonical.assignments.length ? <li className="text-muted-foreground">None</li> : null}
        </ul>
        <p className="text-xs text-muted-foreground">Setting a start or expiry date on a Harmonious role creates a timed RBAC assignment instead of a permanent legacy role. To change a role, assign the new one and revoke the old one; both are recorded.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Direct permission</p>
        <div className="flex flex-wrap gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={perm} onChange={(e) => setPerm(e.target.value)}>
            <option value="">Permission…</option>
            {(ctx?.permissions ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={effect} onChange={(e) => setEffect(e.target.value as any)}>
            <option value="allow">Grant</option>
            <option value="deny">Explicit deny</option>
          </select>
        </div>
        <ScopePicker scopeTypes={["global", "client", "fund", "company", "investment_profile", "investment"]} value={permScope} onChange={setPermScope} />
        <Button size="sm" disabled={!perm || run.isPending || (self && effect === "allow")} onClick={() => run.mutate(() => grant({ data: { targetUserId: userId, permission: perm, effect, scope: permScope as any, reason, ...dateArgs } }))}>{effect === "deny" ? "Record deny" : "Grant permission"}</Button>
        <p className="text-xs text-muted-foreground">Full TIN, sensitive tax evidence, raw ID/KYC evidence, compliance exception approval, money execution and legal signing authority aren't offered here — they have dedicated controls.</p>
        <ul className="space-y-1 text-sm">
          {canonical.grants.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2">
              <span className={g.live ? "" : "text-muted-foreground line-through"}><Badge variant={g.effect === "deny" ? "destructive" : "outline"}>{g.effect === "deny" ? "Deny" : "Grant"}</Badge> {g.permission} — {g.scope}{g.revokedAt ? " · revoked" : !g.live ? " · not in effect" : ""}</span>
              {!g.revokedAt ? <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(() => revokeGrant({ data: { targetUserId: userId, grantId: g.id, reason } }))}>Revoke</Button> : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">Account state: <span className="font-medium">{canonical.suspended ? "Suspended" : "Active"}</span></p>
        <Button size="sm" variant={canonical.suspended ? "default" : "destructive"} disabled={run.isPending || self} onClick={() => run.mutate(() => setState({ data: { targetUserId: userId, suspended: !canonical.suspended, reason } }))}>
          {canonical.suspended ? "Restore account" : "Suspend account"}
        </Button>
      </div>
    </div>
  );
}

/** Person Matrix — one person's effective permissions from the canonical resolver. */
export function PersonMatrix({ canonical }: { canonical: Canonical }) {
  const [open, setOpen] = useState<string | null>(null);
  const areas = [...new Set(canonical.matrix.map((m) => m.permission.split(".")[0]!))];
  const actions = [...new Set(canonical.matrix.map((m) => m.permission.split(".")[1]!))];
  const code = (s: string) => (s.startsWith("Direct deny") ? "D" : s.startsWith("Direct grant") ? "G" : s.startsWith("Role") || s.startsWith("Platform role") || s.startsWith("Staff") ? "R" : s.toLowerCase().includes("delegat") ? "Del" : "Rel");
  const hit = open ? canonical.matrix.find((m) => m.permission === open) : null;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Area</TableHead>{actions.map((a) => <TableHead key={a} className="text-center text-xs">{a.replace("_", " ")}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {areas.map((area) => (
              <TableRow key={area}>
                <TableCell className="text-xs font-medium">{area}</TableCell>
                {actions.map((a) => {
                  const m = canonical.matrix.find((x) => x.permission === `${area}.${a}`)!;
                  const srcs = m.global ? m.sources : m.scoped.map((s) => s.source);
                  const label = srcs.length ? [...new Set(srcs.map(code))].join("/") : "·";
                  return (
                    <TableCell key={a} className="p-0 text-center text-xs">
                      <button type="button" className={`h-8 w-full ${m.global ? "font-semibold" : ""}`} title={m.text} onClick={() => setOpen(m.permission)}>{label}</button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">R Role · Rel Relationship · G Direct grant · D Direct deny · Del Delegation. Bold = everywhere; otherwise only in the listed scopes. Click a cell to explain it.</p>
      {hit ? (
        <Card><CardContent className="space-y-1 p-3 text-sm">
          <p className="font-medium">{hit.permission}</p>
          <p>{hit.text}</p>
          {hit.scoped.map((s, i) => <p key={i} className="text-muted-foreground">{s.source === "Direct deny" ? "✕" : "✓"} {s.source} — scope: {s.scope} (not valid outside it)</p>)}
          <p className="text-xs">Decision: <span className="font-medium">{hit.global ? "Allow — all resources" : hit.scoped.length ? "Allow — listed scopes only" : "Deny (no source grants it)"}</span>{hit.sources.length ? ` · source: ${hit.sources.join(", ")}` : ""}</p>
          <p className="text-xs text-muted-foreground">Protected conditions still apply regardless of this cell: {PROTECTED_PERMISSIONS.join(", ")} are never granted by roles or grants; maker-checker, dual control and immutability rules are enforced separately.</p>
        </CardContent></Card>
      ) : null}
      {hit && canonical.atomic ? <AtomicDrawer rows={canonical.atomic} area={hit.permission.split(".")[0]!} summary={hit.permission.split(".")[1]!} /> : null}
    </div>
  );
}

/** Writable role management (Super Administrator only; server re-checks). */
export function RoleAdmin() {
  const { data: ctx } = useAccessAdmin();
  const refresh = useRefresh();
  const save = useServerFn(saveRoleDefinition);
  const [mode, setMode] = useState<"create" | "clone" | "edit" | "deactivate">("create");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: () => save({ data: { mode, roleKey: key, label: label || undefined, permissions: mode === "clone" && !perms.length ? undefined : perms, cloneFrom: cloneFrom || undefined, reason } }),
    onSuccess: (r) => { toast.success(`Saved as version ${r.version}.`); setReason(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!ctx) return null;
  const rows = [
    ...ctx.templates.map((t) => ({ key: t.key, label: t.label, version: 1, count: t.permissions.length, assigned: t.assigned, createdBy: "Harmonious (built-in)", updatedBy: "—", status: "active", kind: t.category })),
    ...ctx.custom.map((c) => ({ key: c.key, label: c.label, version: c.version, count: c.permissions.length, assigned: c.assigned, createdBy: c.createdBy, updatedBy: c.updatedBy, status: c.status, kind: "custom" })),
  ];
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Type</TableHead><TableHead>Version</TableHead><TableHead>Permissions</TableHead><TableHead>Assigned users</TableHead><TableHead>Created by</TableHead><TableHead>Updated by</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}><TableCell className="font-medium">{r.label}</TableCell><TableCell>{r.kind}</TableCell><TableCell>v{r.version}</TableCell><TableCell>{r.count}</TableCell><TableCell>{r.assigned}</TableCell><TableCell className="text-xs">{r.createdBy}</TableCell><TableCell className="text-xs">{r.updatedBy}</TableCell><TableCell><Badge variant={r.status === "active" ? "outline" : "secondary"}>{r.status}</Badge></TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Investor access isn't a role: it comes from Person → Investment Profile → Investment (Owner, Joint Owner, Trustee, Authorized Signer, Control Person, Beneficial Owner). Professionals act only through a live, accepted delegation within its exact scope and ceiling.</p>
      {ctx.isSuper ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Custom roles</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              {(["create", "clone", "edit", "deactivate"] as const).map((m) => <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>{m[0]!.toUpperCase() + m.slice(1)}</Button>)}
            </div>
            <Input placeholder="role_key (lowercase)" value={key} onChange={(e) => setKey(e.target.value)} />
            {mode !== "deactivate" ? <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} /> : null}
            {mode === "clone" ? (
              <select className="h-9 w-full rounded-md border bg-background px-2" value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
                <option value="">Clone from…</option>
                {rows.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            ) : null}
            {mode === "create" || mode === "edit" ? (
              <div className="grid max-h-60 grid-cols-2 gap-1 overflow-y-auto rounded border p-2 text-xs sm:grid-cols-4">
                {ctx.permissions.map((p) => (
                  <label key={p} className="flex items-center gap-1"><input type="checkbox" checked={perms.includes(p)} onChange={(e) => setPerms(e.target.checked ? [...perms, p] : perms.filter((x) => x !== p))} />{p}</label>
                ))}
              </div>
            ) : null}
            <Textarea rows={2} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" disabled={!key || run.isPending} onClick={() => run.mutate()}>Save</Button>
            <p className="text-xs text-muted-foreground">Edits and deactivation save a new version; earlier versions stay unchanged, so past assignments and audit evidence keep their original meaning. Predefined templates can't be edited — clone them.</p>
          </CardContent>
        </Card>
      ) : <p className="text-xs text-muted-foreground">Only a Super Administrator can create or change roles.</p>}
    </div>
  );
}

/** Access Control → Needs Review: legacy compatibility dry run, Super Administrators, shadow summary. */
export function NeedsReview() {
  const get = useServerFn(getLegacyCompatibility);
  const { data, isLoading, error } = useQuery({ queryKey: ["access-legacy-compat"], queryFn: () => get() });
  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="mt-4 text-sm text-destructive">{(error as Error)?.message ?? "Unavailable"}</p>;
  return (
    <div className="mt-4 space-y-6">
      <section className="space-y-2">
        <h2 className="font-medium">Needs review</h2>
        {data.needsReview.length ? data.needsReview.map((n) => <p key={n.userId} className="text-sm"><span className="font-medium">{n.person}</span> — {n.issue}</p>) : <p className="text-sm text-muted-foreground">Nothing needs review.</p>}
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Legacy client role migration — dry run (nobody is migrated)</h2>
        <div className="overflow-x-auto rounded-md border"><Table>
          <TableHeader><TableRow>{["Person", "Legacy role", "Current client", "Current effective actions", "Proposed role", "Proposed scope", "Added permissions", "Lost permissions", "Result"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{data.dryRun.map((r, i) => (
            <TableRow key={i}><TableCell>{r.person}</TableCell><TableCell>{r.legacyRole}</TableCell><TableCell>{r.currentClient ?? "—"}</TableCell><TableCell className="text-xs">{r.currentActions.join(", ")}</TableCell><TableCell>{r.proposedRole}</TableCell><TableCell>{r.proposedScope ?? "—"}</TableCell><TableCell className="text-xs">{r.added.join(", ") || "none"}</TableCell><TableCell className="text-xs">{r.lost.join(", ") || "none"}</TableCell><TableCell className="text-xs font-medium">{r.result}</TableCell></TableRow>
          ))}</TableBody>
        </Table></div>
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Super Administrators</h2>
        <div className="overflow-x-auto rounded-md border"><Table>
          <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>User ID</TableHead><TableHead>Super Administrator source</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
          <TableBody>{data.superAdmins.map((s: any) => <TableRow key={s.userId}><TableCell>{s.person}</TableCell><TableCell className="font-mono text-xs">{s.userId}</TableCell><TableCell>{s.source}</TableCell><TableCell>{s.active ? "Yes" : "No (suspended)"}</TableCell></TableRow>)}</TableBody>
        </Table></div>
      </section>
      <section className="space-y-1">
        <h2 className="font-medium">Shadow authorization (non-enforcing)</h2>
        <p className="text-xs text-muted-foreground">Legacy decisions stay authoritative. No endpoints are in shadow mode yet.</p>
        <p className="text-sm">ALLOW/ALLOW {data.shadow.allow_allow} · DENY/DENY {data.shadow.deny_deny} · legacy ALLOW / RBAC DENY {data.shadow.legacy_allow_rbac_deny} · legacy DENY / RBAC ALLOW {data.shadow.legacy_deny_rbac_allow}</p>
      </section>
    </div>
  );
}
