import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  ACCESS_ACTIONS,
  ACCESS_AREAS,
  effectivePermissions,
  matrix,
  SOURCE_LABEL,
  staffGroupArea,
  SUPER_ADMIN_LIMITS,
  USER_TYPE_LABEL,
  type Facts,
  type Permission,
  type SourceKind,
  type UserType,
} from "@/lib/access-control-model";
import { OPS_STAFF_ROLES } from "@/lib/ops-capabilities";
import { NEVER_GRANTABLE, PREDEFINED_STAFF_ROLES, STAFF_CAPABILITY_GROUPS } from "@/lib/contract-coverage";
import {
  getAccessProfile,
  listAccessAudit,
  listAccessPeople,
  listAccessRoles,
} from "@/lib/access-control.functions";
import { ManageAccessPanel, NeedsReview, PersonMatrix, RoleAdmin } from "@/components/access-admin-panels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : "—");
const FILTERS = [
  { id: "all", label: "All" },
  { id: "harmonious", label: "Harmonious Team" },
  { id: "client", label: "Clients" },
  { id: "fund_manager", label: "Fund Managers" },
  { id: "investor", label: "Investors" },
  { id: "professional", label: "Professionals" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
] as const;

const SOURCE_TONE: Record<SourceKind, string> = {
  role: "R",
  relationship: "Rel",
  direct_grant: "G",
  deny: "✕",
  delegated: "D",
};

export function AccessControlCenter() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Access Control</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Who can do what, and why. Authorized administrators can assign roles, grants and denies from a
        person's profile; every change needs a reason and is permanently audited. Every request is still checked on the server.
      </p>
      <Tabs defaultValue="people" className="mt-6">
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
          <TabsTrigger value="audit">Access Audit</TabsTrigger>
          <TabsTrigger value="review">Needs Review</TabsTrigger>
        </TabsList>
        <TabsContent value="people"><PeopleTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="matrix"><MatrixTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
        <TabsContent value="review"><NeedsReview /></TabsContent>
      </Tabs>
    </main>
  );
}

function PeopleTab() {
  const list = useServerFn(listAccessPeople);
  const { data, isLoading, error } = useQuery({ queryKey: ["access-people"], queryFn: () => list() });
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (filter === "active" && p.status !== "active") return false;
      if (filter === "suspended" && p.status !== "suspended") return false;
      if (!["all", "active", "suspended"].includes(filter) && !p.types.includes(filter as UserType)) return false;
      return !s || p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s) || p.userId.includes(s);
    });
  }, [data, filter, search]);
  if (error) return <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs ${filter === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {f.label}
          </button>
        ))}
        <Input className="ml-auto w-64" placeholder="Search name, email or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading people…</p> : null}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Person/user ID</TableHead>
              <TableHead>User type</TableHead><TableHead>Organization</TableHead><TableHead>Effective role(s)</TableHead>
              <TableHead>Effective scope(s)</TableHead><TableHead>Sensitive-data access</TableHead><TableHead>Account status</TableHead>
              <TableHead>Last sign-in</TableHead><TableHead>Last permission change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.userId} className="cursor-pointer" onClick={() => setOpen(p.userId)}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.email}</TableCell>
                <TableCell className="font-mono text-xs">{p.userId.slice(0, 8)}…</TableCell>
                <TableCell>{p.types.map((t) => USER_TYPE_LABEL[t]).join(", ")}</TableCell>
                <TableCell>{p.organizations.join(", ") || "—"}</TableCell>
                <TableCell>{p.roles.join(", ") || "—"}</TableCell>
                <TableCell className="text-xs">{p.scopes.join("; ") || "—"}{p.scopeCount > p.scopes.length ? ` +${p.scopeCount - p.scopes.length}` : ""}</TableCell>
                <TableCell className="text-xs">{p.sensitive.join(", ") || "None"}</TableCell>
                <TableCell><Badge variant={p.status === "active" ? "secondary" : "destructive"}>{p.status === "active" ? "Active" : "Suspended"}</Badge></TableCell>
                <TableCell className="text-xs">{fmt(p.lastSignIn)}</TableCell>
                <TableCell className="text-xs">{fmt(p.lastPermissionChange)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{rows.length} of {data?.length ?? 0} people</p>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {open ? <AccessProfile userId={open} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AccessProfile({ userId }: { userId: string }) {
  const get = useServerFn(getAccessProfile);
  const { data, error } = useQuery({ queryKey: ["access-profile", userId], queryFn: () => get({ data: { userId } }) });
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const f = data.facts as Facts;
  const perms = data.permissions as Permission[];
  const direct = perms.filter((p) => p.source === "direct_grant");
  return (
    <div className="space-y-5">
      <SheetHeader><SheetTitle>{data.identity.name}</SheetTitle></SheetHeader>
      <Section n={1} title="Identity & account">
        <KV k="Email" v={data.identity.email} /><KV k="User ID" v={data.identity.userId} mono />
        <KV k="Status" v={data.identity.status} /><KV k="Created" v={fmt(data.identity.createdAt)} /><KV k="Last sign-in" v={fmt(data.identity.lastSignIn)} />
        <KV k="User type" v={data.identity.types.map((t: UserType) => USER_TYPE_LABEL[t]).join(", ")} />
      </Section>
      <Section n={2} title="Relationships">
        <List items={[
          ...f.managedFunds.map((x) => `Fund Manager — ${x.name}`),
          ...f.investorFunds.map((x) => `Investor access — ${x.name}`),
          ...f.investmentProfiles.map((x) => `Investment profile — ${x.label}${x.status ? ` (${x.status})` : ""}`),
          ...f.clientMemberships.map((x) => `Client user — ${x.name} (${x.role ?? "member"}${x.canApprove ? ", approver" : ""})`),
          ...f.companies.map((x) => `Company — ${x.name}`),
          ...f.professionalMemberships.map((x) => `Professional — ${x.orgName} (${x.status})`),
        ]} />
      </Section>
      <Section n={3} title="Assigned roles">
        <List items={data.roles} />
        {f.roles.includes("super_admin") ? (
          <div className="mt-2 rounded-md border p-2 text-xs">
            <p className="font-medium">Super Administrator does not bypass:</p>
            <ul className="ml-4 list-disc">{SUPER_ADMIN_LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        ) : null}
      </Section>
      <Section n={4} title="Resource scopes">
        <List items={[...new Set(perms.map((p) => (p.scope.type === "global" ? "Global — all resources" : `${p.scope.type.replace(/_/g, " ")}: ${p.scope.label}`)))]} />
      </Section>
      <Section n={5} title="Effective permissions">
        <MatrixGrid perms={perms} />
        <details className="mt-2 text-xs"><summary className="cursor-pointer">Show each permission and where it comes from</summary>
          <ul className="mt-1 space-y-0.5">{perms.map((p, i) => <li key={i}>{p.area} · {p.action} · {p.scope.label} — <span className="text-muted-foreground">{SOURCE_LABEL[p.source]}: {p.via}</span></li>)}</ul>
        </details>
      </Section>
      <Section n={6} title="Direct grants"><List items={direct.map((p) => `${p.area} · ${p.action} — ${p.via}`)} /></Section>
      <Section n={7} title="Direct denies">
        <p className="text-xs text-muted-foreground">None. Explicit denies aren't stored yet; when added they will override every grant.</p>
      </Section>
      <Section n={8} title="Delegations & authority">
        <List items={f.delegations.map((d) => `${d.direction === "acting_for" ? "Acts for" : "Delegated to"} ${d.counterpart} — ${d.authority_level}, ${d.scope_type.replace(/_/g, " ")}, ${d.status}${d.expires_at ? `, expires ${fmt(d.expires_at)}` : ""}${d.capabilities.length ? ` (${d.capabilities.join(", ")})` : ""}`)} />
      </Section>
      <Section n={9} title="Access history"><HistoryTable rows={data.history} /></Section>
      <Section n={10} title="Person matrix (canonical resolver)"><PersonMatrix canonical={data.canonical as any} /></Section>
      <Section n={11} title="Manage access"><ManageAccessPanel userId={userId} canonical={data.canonical as any} platformRoles={data.facts.roles} /></Section>
    </div>
  );
}

function RolesTab() {
  const get = useServerFn(listAccessRoles);
  const { data } = useQuery({ queryKey: ["access-roles"], queryFn: () => get() });
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><RoleAdmin /></div>
      <Card><CardHeader><CardTitle className="text-base">Harmonious platform roles</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {OPS_STAFF_ROLES.map((r) => <p key={r}><span className="font-medium">{r}</span>{r === "super_admin" ? " — highest; assigned to an exact user ID, never by email domain" : ""}</p>)}
        </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Staff capability roles</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {Object.entries(PREDEFINED_STAFF_ROLES).map(([k, r]) => <p key={k}><span className="font-medium">{r.label}</span> <span className="text-xs text-muted-foreground">{r.caps.join(", ")}</span></p>)}
          {(data?.custom ?? []).map((c) => <p key={c.role_key}><span className="font-medium">{c.label}</span> <Badge variant="outline">custom{c.active ? "" : ", inactive"}</Badge> <span className="text-xs text-muted-foreground">{c.capabilities.join(", ")}</span></p>)}
          <p className="text-xs text-muted-foreground">Never grantable by any role: {NEVER_GRANTABLE.join(", ")}.</p>
        </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-base">Relationship roles (always scoped)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><span className="font-medium">Fund Manager</span> — exact managed funds only.</p>
          <p><span className="font-medium">Investor</span> — own investment profiles and investments only.</p>
          <p><span className="font-medium">Client / company user</span> — their client, company and linked funds only.</p>
          <p><span className="font-medium">Professional / delegate</span> — only with a live, accepted, unexpired delegation that passes the acting-authority check.</p>
        </CardContent></Card>
    </div>
  );
}

const MATRIX_SUBJECTS: { label: string; facts: Partial<Facts> }[] = [
  ...OPS_STAFF_ROLES.map((r) => ({ label: r, facts: { roles: [r] } })),
  { label: "Fund Manager (per fund)", facts: { managedFunds: [{ id: "fund", name: "each managed fund" }] } },
  { label: "Investor (per profile)", facts: { investmentProfiles: [{ id: "p", label: "own profile", status: null }] } },
  { label: "Client user (per client)", facts: { clientMemberships: [{ id: "c", name: "own client", role: "member", canApprove: false }] } },
];

function blank(partial: Partial<Facts>): Facts {
  return { userId: "x", roles: [], staffGrants: [], customRoles: {}, managedFunds: [], investorFunds: [], investmentProfiles: [], clientMemberships: [], companies: [], professionalMemberships: [], delegations: [], ...partial };
}

function MatrixTab() {
  const [subject, setSubject] = useState(0);
  const perms = effectivePermissions(blank(MATRIX_SUBJECTS[subject]!.facts));
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {MATRIX_SUBJECTS.map((s, i) => (
          <button key={s.label} onClick={() => setSubject(i)} className={`rounded-full border px-3 py-1 text-xs ${i === subject ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{s.label}</button>
        ))}
      </div>
      <MatrixGrid perms={perms} granular />
      <p className="text-xs text-muted-foreground">
        Key: R from role · Rel from relationship · G directly granted · D delegated · ✕ explicitly denied. Export isn't a separate permission in today's model.
      </p>
    </div>
  );
}

function MatrixGrid({ perms, granular }: { perms: Permission[]; granular?: boolean }) {
  const m = matrix(perms);
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader><TableRow><TableHead>Area</TableHead>{ACCESS_ACTIONS.map((a) => <TableHead key={a.id} className="text-center">{a.label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {ACCESS_AREAS.map((area) => (
            <TableRow key={area.id}>
              <TableCell className="font-medium">
                {area.label}
                {granular ? (
                  <div className="text-[11px] font-normal text-muted-foreground">
                    {STAFF_CAPABILITY_GROUPS.filter((g) => staffGroupArea(g.group) === area.id)
                      .flatMap((g) => g.caps.map((c) => c[0]))
                      .filter((c) => perms.some((p) => p.via.endsWith(`: ${c}`)))
                      .join(", ")}
                  </div>
                ) : null}
              </TableCell>
              {ACCESS_ACTIONS.map((a) => {
                const s = m[area.id][a.id];
                return <TableCell key={a.id} className="text-center text-xs" title={s ? SOURCE_LABEL[s] : "No access"}>{s ? SOURCE_TONE[s] : "·"}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AuditTab() {
  const get = useServerFn(listAccessAudit);
  const { data, isLoading } = useQuery({ queryKey: ["access-audit"], queryFn: () => get() });
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs text-muted-foreground">Authoritative access-change events (with before/after state, reason and refused attempts) plus history reconstructed from earlier records. Nothing here can be edited or deleted.</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <HistoryTable rows={data ?? []} />}
    </div>
  );
}

function HistoryTable({ rows }: { rows: { at: string; actor: string; target: string; change: string; scope: string; reason: string | null }[] }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground">No access changes recorded.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Actor</TableHead><TableHead>Person</TableHead><TableHead>Change</TableHead><TableHead>Scope</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}><TableCell className="text-xs">{fmt(r.at)}</TableCell><TableCell>{r.actor}</TableCell><TableCell>{r.target}</TableCell><TableCell>{r.change}</TableCell><TableCell className="text-xs">{r.scope}</TableCell><TableCell className="text-xs">{r.reason ?? "—"}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-1 text-sm font-semibold">{n}. {title}</h3>{children}</section>;
}
function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return <p className="text-sm"><span className="text-muted-foreground">{k}: </span><span className={mono ? "font-mono text-xs" : ""}>{v}</span></p>;
}
function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">None</p>;
  return <ul className="ml-4 list-disc text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>;
}
