import { Link } from "@tanstack/react-router";
import { AccessBadge, PeopleActions, useAccessStatus } from "@/components/people-actions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { assignManager, getEmployees } from "@/lib/staff-directory.functions";


const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never");

export function EmployeesPage() {
  const load = useServerFn(getEmployees);
  const assign = useServerFn(assignManager);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["employees"], queryFn: () => load(), retry: false });
  const [search, setSearch] = useState("");
  const m = useMutation({
    mutationFn: (v: { userId: string; managerId: string | null }) => assign({ data: v }),
    onSuccess: () => { toast.success("Manager updated"); qc.invalidateQueries({ queryKey: ["employees"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const d = q.data;
  const access = useAccessStatus((d?.people ?? []).map((p) => p.email));
  const [show, setShow] = useState<"active" | "archived" | "test">("active");
  const acc = (e: string) => access.data?.[(e ?? "").toLowerCase()];
  const rows = (d?.people ?? []).filter((p) => `${p.name} ${p.email} ${p.roles.join(" ")}`.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => show === "archived" ? acc(p.email)?.status === "archived" : show === "test" ? acc(p.email)?.isTestDemo : acc(p.email)?.status !== "archived");
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Employees</h1>
          <p className="mt-2 text-sm text-muted-foreground">{d?.canAssignManagers ? "Everyone at Harmonious. Assign managers so they can see their team's activity." : "You and the people who report to you."}</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link to="/ops/mailboxes" className="text-primary hover:underline">Mailboxes</Link>
          <Link to="/ops/access-control" className="text-primary hover:underline">Invite & access</Link>
          <Link to="/ops/roles" className="text-primary hover:underline">Roles</Link>
        </div>
      </header>
      <Input placeholder="Search name, email or role" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {access.data && <div className="flex gap-1">{(["active", "archived", "test"] as const).map((v) => <button key={v} onClick={() => setShow(v)} className={`rounded border px-3 py-1 text-xs ${show === v ? "bg-primary text-primary-foreground" : ""}`}>{v === "active" ? "Current" : v === "archived" ? "Archived" : "Test/Demo"}</button>)}</div>}
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Employee</th><th className="p-3">Roles</th><th className="p-3">Manager</th><th className="p-3">Last signed in</th><th className="p-3">Last active</th><th className="p-3">Actions (7d)</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p) => (
                <tr key={p.userId}>
                  <td className="p-3"><div className="font-medium">{p.name || p.email}</div><AccessBadge info={acc(p.email)} /><div className="text-xs text-muted-foreground">{p.email}{p.reports ? ` · ${p.reports} report${p.reports > 1 ? "s" : ""}` : ""}</div></td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{p.roles.map((r) => <Badge key={r} variant="outline">{r.replace(/_/g, " ")}</Badge>)}</div></td>
                  <td className="p-3">
                    {d.canAssignManagers ? (
                      <select aria-label={`Manager for ${p.name || p.email}`} className="rounded border bg-background px-2 py-1 text-sm" value={p.managerId ?? ""} disabled={m.isPending}
                        onChange={(e) => m.mutate({ userId: p.userId, managerId: e.target.value || null })}>
                        <option value="">No manager</option>
                        {d.managerOptions.filter((o) => o.userId !== p.userId).map((o) => <option key={o.userId} value={o.userId}>{o.name}</option>)}
                      </select>
                    ) : (p.managerName || "—")}
                  </td>
                  <td className="p-3 whitespace-nowrap">{when(p.lastSignIn)}</td>
                  <td className="p-3 whitespace-nowrap">{p.lastActive ? when(p.lastActive) : "—"}</td>
                  <td className="p-3">{p.actionsThisWeek}</td>
                  <td className="p-3"><Link to="/ops/employees/$userId" params={{ userId: p.userId }} className="text-primary hover:underline">Activity</Link>{access.data && <PeopleActions userId={p.userId} email={p.email} name={p.name} info={acc(p.email)} />}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No employees match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
