import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getPersonAccessSetup, setClientMembership, setFundManagerAccess } from "@/lib/access-admin.functions";

const ROLES = [
  { value: "client_gp", label: "General partner / principal" },
  { value: "client_signatory", label: "Authorized signatory" },
  { value: "client_finance", label: "Finance" },
  { value: "client_legal", label: "Legal" },
  { value: "client_compliance", label: "Compliance" },
  { value: "client_readonly", label: "View only" },
] as const;
type Role = (typeof ROLES)[number]["value"] | "member";
const roleLabel = (r: string | null | undefined) => ROLES.find((x) => x.value === r)?.label ?? (r === "member" ? "Member (older role)" : r ? r.replace(/_/g, " ") : "No role");
const words = (s: string) => s.replace(/_/g, " ");

/**
 * View account: this person's client accounts (with role), funds and the
 * services each client has, with add/change/remove for access administrators.
 * Every change asks for a reason and is recorded in the access history.
 */
export function PersonAccessManager({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getPersonAccessSetup);
  const setClient = useServerFn(setClientMembership);
  const setFund = useServerFn(setFundManagerAccess);
  const q = useQuery({ queryKey: ["person-access-setup", userId], queryFn: () => load({ data: { userId } }), retry: false });
  const [why, setWhy] = useState("");
  const [roleDraft, setRoleDraft] = useState<Record<string, Role>>({});
  const [newClient, setNewClient] = useState("");
  const [newRole, setNewRole] = useState<Role>("client_readonly");
  const [newApprove, setNewApprove] = useState(false);
  const [newFund, setNewFund] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["person-access-setup", userId] });
    qc.invalidateQueries({ queryKey: ["person-activity", userId] });
    qc.invalidateQueries({ queryKey: ["access-profile", userId] });
  };
  const client = useMutation({
    mutationFn: (v: { clientId: string; add: boolean; change?: boolean; role?: Role; canApprove?: boolean }) =>
      setClient({ data: { targetUserId: userId, clientId: v.clientId, add: v.add, change: !!v.change, role: v.role ?? "client_readonly", canApprove: !!v.canApprove, reason: why } }),
    onSuccess: () => { toast.success("Client access updated."); setNewClient(""); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const fund = useMutation({
    mutationFn: (v: { fundId: string; add: boolean }) => setFund({ data: { targetUserId: userId, fundId: v.fundId, add: v.add, reason: why } }),
    onSuccess: () => { toast.success("Fund access updated."); setNewFund(""); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return <section className="rounded-lg border p-4 text-sm text-muted-foreground">Loading access…</section>;
  if (q.error || !q.data) return null;
  const d = q.data;
  const edit = d.canEdit && !d.self;
  const busy = client.isPending || fund.isPending;
  const reasonOk = why.trim().length >= 5;
  const mineClients = new Set(d.connections.clients.filter((c) => c.access).map((c) => c.id));
  const managed = new Set(d.connections.funds.filter((f) => f.manager).map((f) => f.id));
  const clientName = new Map(d.clientOptions.map((c) => [c.id, c.name]));
  const serviceClients = Object.keys(d.services);

  return (
    <section className="space-y-5 rounded-lg border p-4">
      <div>
        <h2 className="text-lg">Clients, funds and services</h2>
        <p className="text-sm text-muted-foreground">
          The same list appears for every login, person record and email address on file for this person. Being listed as a contact or team entry never grants access by itself.
        </p>
      </div>

      {edit && (
        <label className="block max-w-xl space-y-1 text-sm">
          <span className="font-medium">Reason for any change (required, saved in the access history)</span>
          <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: Joining as finance contact for 4D Capital" />
        </label>
      )}
      {!d.canEdit && <p className="text-sm text-muted-foreground">You can view this. Only access administrators can change it.</p>}
      {d.self && d.canEdit && <p className="text-sm text-muted-foreground">You can't change your own access. Ask another access administrator.</p>}

      <div className="space-y-2">
        <h3 className="text-base font-medium">Client accounts ({d.connections.clients.length})</h3>
        {!d.connections.clients.length ? <p className="text-sm text-muted-foreground">Not connected to any client yet.</p> : (
          <ul className="divide-y rounded-md border text-sm">
            {d.connections.clients.map((c) => {
              const draft = roleDraft[c.id] ?? ((c.access?.role as Role | null) ?? "client_readonly");
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 p-3">
                  <Link to="/ops/clients/$clientId" params={{ clientId: c.id }} search={{} as any} className="mr-auto font-medium text-primary hover:underline">{c.name}</Link>
                  {c.access ? <Badge>Login access · {roleLabel(c.access.role)}</Badge> : <Badge variant="outline">No login access</Badge>}
                  {c.access?.canApprove && <Badge variant="secondary">Can approve</Badge>}
                  {c.listedAs.length > 0 && <Badge variant="outline">Listed as {c.listedAs.map(words).join(", ")}</Badge>}
                  {c.pendingInvite && <Badge variant="secondary">Invitation waiting</Badge>}
                  {edit && (
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                      <select aria-label={`Role for ${c.name}`} className="h-9 rounded-md border bg-background px-2" value={draft} onChange={(e) => setRoleDraft((r) => ({ ...r, [c.id]: e.target.value as Role }))}>
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        {draft === "member" && <option value="member">Member (older role)</option>}
                      </select>
                      {c.access ? (
                        <>
                          <Button size="sm" variant="outline" disabled={busy || !reasonOk || draft === c.access.role} onClick={() => client.mutate({ clientId: c.id, add: true, change: true, role: draft, canApprove: c.access!.canApprove })}>Save role</Button>
                          <Button size="sm" variant="ghost" disabled={busy || !reasonOk} onClick={() => { if (window.confirm(`Remove ${c.name} login access?`)) client.mutate({ clientId: c.id, add: false }); }}>Remove access</Button>
                        </>
                      ) : (
                        <Button size="sm" disabled={busy || !reasonOk} onClick={() => client.mutate({ clientId: c.id, add: true, role: draft })}>Give login access</Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {edit && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3 text-sm">
            <label className="min-w-64 flex-1 space-y-1">Add to a client account
              <SearchableSelect aria-label="Client account" placeholder="Choose a client…" options={d.clientOptions.filter((c) => !mineClients.has(c.id)).map((c) => ({ value: c.id, label: c.name }))} value={newClient} onValueChange={setNewClient} />
            </label>
            <label className="space-y-1">Role
              <select aria-label="Role for the new client" className="block h-9 rounded-md border bg-background px-2" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="flex h-9 items-center gap-2"><input type="checkbox" checked={newApprove} onChange={(e) => setNewApprove(e.target.checked)} />Can approve</label>
            <Button disabled={!newClient || busy || !reasonOk} onClick={() => client.mutate({ clientId: newClient, add: true, role: newRole, canApprove: newApprove })}>Add client</Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-medium">Funds ({d.connections.funds.length})</h3>
        {!d.connections.funds.length ? <p className="text-sm text-muted-foreground">Not connected to any fund yet.</p> : (
          <ul className="divide-y rounded-md border text-sm">
            {d.connections.funds.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="mr-auto">
                  <Link to="/ops/funds/$fundId" params={{ fundId: f.id }} className="font-medium text-primary hover:underline">{f.name}</Link>
                  {f.clientId && clientName.get(f.clientId) ? <span className="ml-2 text-xs text-muted-foreground">{clientName.get(f.clientId)}</span> : null}
                </span>
                {f.manager && <Badge>Fund manager</Badge>}
                {f.teamRoles.map((r) => <Badge key={`t${r}`} variant="outline">Team: {words(r)}</Badge>)}
                {f.teamAccess.map((r) => <Badge key={`a${r}`} variant="secondary">Team access: {words(r).replace(/^fund /, "")}</Badge>)}
                {f.investor && <Badge variant="outline">Investor</Badge>}
                {f.pendingInvite && <Badge variant="secondary">Invited ({words(f.pendingInvite)})</Badge>}
                {edit && f.manager && <Button size="sm" variant="ghost" disabled={busy || !reasonOk} onClick={() => { if (window.confirm(`Remove as fund manager of ${f.name}?`)) fund.mutate({ fundId: f.id, add: false }); }}>Remove as manager</Button>}
                {edit && !f.manager && !d.staffEmail && <Button size="sm" variant="outline" disabled={busy || !reasonOk} onClick={() => fund.mutate({ fundId: f.id, add: true })}>Make fund manager</Button>}
              </li>
            ))}
          </ul>
        )}
        {edit && (d.staffEmail ? (
          <p className="text-sm text-muted-foreground">Harmonious staff work on funds through client assignments, so they can't be added as fund managers.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3 text-sm">
            <label className="min-w-64 flex-1 space-y-1">Add as fund manager
              <SearchableSelect aria-label="Fund" placeholder="Choose a fund…" options={d.fundOptions.filter((f) => !managed.has(f.id)).map((f) => ({ value: f.id, label: f.name, detail: f.clientId ? clientName.get(f.clientId) ?? null : null }))} value={newFund} onValueChange={setNewFund} />
            </label>
            <Button disabled={!newFund || busy || !reasonOk} onClick={() => fund.mutate({ fundId: newFund, add: true })}>Add fund</Button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Limited team access (viewer, assistant, reviewer) is given on the fund's Team page.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-medium">Services they can see</h3>
        <p className="text-xs text-muted-foreground">Services are set for the whole client, so everyone with access to that client sees the same areas.</p>
        {!serviceClients.length ? <p className="text-sm text-muted-foreground">No client services to show.</p> : serviceClients.map((cid) => (
          <div key={cid} className="space-y-1 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto font-medium">{clientName.get(cid) ?? "Client"}</span>
              <Link to="/ops/clients/$clientId" params={{ clientId: cid }} search={{ tab: "services" } as any} className="text-primary hover:underline">Change services</Link>
            </div>
            <div className="flex flex-wrap gap-1">
              {d.services[cid]!.map((s) => <Badge key={s.key} variant={s.enabled ? "default" : "outline"} className={s.enabled ? "" : "text-muted-foreground line-through"}>{s.label}</Badge>)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
