import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeStaffRoleFn, listStaffRolesFn } from "@/lib/staff-roles.functions";
import { MANAGED_ROLES, MANAGED_ROLE_LABEL, MANAGED_ROLE_SEES, type ManagedRole } from "@/lib/staff-role-hierarchy";


const label = (r: string) => MANAGED_ROLE_LABEL[r as ManagedRole] ?? r.replace(/_/g, " ");

export function RolesPage() {
  const load = useServerFn(listStaffRolesFn);
  const change = useServerFn(changeStaffRoleFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["staff-roles"], queryFn: () => load(), retry: false });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagedRole | "">("");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: (v: { email?: string; userId?: string; role: ManagedRole; action: "grant" | "revoke"; reason: string }) => change({ data: v }),
    onSuccess: () => { toast.success("Role updated"); setEmail(""); setReason(""); qc.invalidateQueries({ queryKey: ["staff-roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.error) return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-3xl">Harmonious roles</h1><p className="mt-4 text-sm text-muted-foreground">{(q.error as Error).message}</p></main>;
  const d = q.data;
  const can = new Set<string>(d?.canAssign ?? []);
  const revoke = (userId: string, r: ManagedRole) => {
    const why = window.prompt(`Reason for removing ${label(r)}?`);
    if (why && why.trim().length >= 3) m.mutate({ userId, role: r, action: "revoke", reason: why.trim() });
  };
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-3xl">Harmonious roles</h1>
        <p className="mt-2 text-sm text-muted-foreground">Each role sees only its part of the portal. Every change needs a reason and is kept permanently.</p>
      </header>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg">Role hierarchy</h2>
        <ol className="space-y-2 text-sm">
          {MANAGED_ROLES.map((r, i) => (
            <li key={r} className="flex flex-wrap items-baseline gap-2" style={{ paddingLeft: `${Math.min(i, 4) * 16}px` }}>
              <Badge variant={can.has(r) ? "default" : "outline"}>{label(r)}</Badge>
              <span className="text-muted-foreground">{MANAGED_ROLE_SEES[r]}</span>
            </li>
          ))}
        </ol>
      </section>

      {d && d.canAssign.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 text-lg">Assign a role</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@harmonious.co" /></div>
            <div><Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as ManagedRole)}>
                <SelectTrigger><SelectValue placeholder="Choose role" /></SelectTrigger>
                <SelectContent>{d.canAssign.map((r) => <SelectItem key={r} value={r}>{label(r)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why" /></div>
            <div className="flex items-end"><Button disabled={!email || !role || reason.trim().length < 3 || m.isPending} onClick={() => role && m.mutate({ email, role, action: "grant", reason })}>Assign</Button></div>
          </div>
        </section>
      )}

      <section className="rounded-lg border">
        <h2 className="border-b p-4 text-lg">Harmonious staff</h2>
        {!d ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : (
          <ul className="divide-y">
            {d.people.map((p) => (
              <li key={p.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{p.name || p.email}{p.userId === d.me && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.roles.map((r) => (
                    <Badge key={r} variant="secondary" className="gap-1">
                      {label(r)}
                      {can.has(r) && p.userId !== d.me && (
                        <button type="button" aria-label={`Remove ${label(r)}`} className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => revoke(p.userId, r as ManagedRole)}>×</button>
                      )}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {d && d.events.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 text-lg">Change history</h2>
          <ul className="space-y-1 text-sm">
            {d.events.map((e: any) => {
              const who = (id: string) => d.people.find((p) => p.userId === id)?.email ?? "former staff";
              return <li key={e.id}><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("en-US")}</span> · {who(e.actor_id)} {e.action === "grant" ? "gave" : "removed"} {label(e.role)} {e.action === "grant" ? "to" : "from"} {who(e.target_user_id)} — {e.reason}</li>;
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
