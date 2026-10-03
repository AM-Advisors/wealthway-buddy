import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessBadge, PeopleActions } from "@/components/people-actions";
import { cancelInvitation, getPeopleDirectory, setTestDemoFlag } from "@/lib/user-access.functions";

type Tab = "all" | "invited" | "revoked" | "archived" | "test";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Active" }, { id: "invited", label: "Invited, not joined" }, { id: "revoked", label: "Revoked" },
  { id: "archived", label: "Archived" }, { id: "test", label: "Test & Demo" },
];
const TYPES = ["Employee", "Fund Manager", "Founder", "Client contact", "Investor", "User"];
const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never");

export function PeopleDirectory({ initial = "all" }: { initial?: Tab }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["people-directory"], queryFn: useServerFn(getPeopleDirectory), retry: false });
  const cancel = useServerFn(cancelInvitation), flag = useServerFn(setTestDemoFlag);
  const [tab, setTab] = useState<Tab>(initial);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const s = search.toLowerCase();

  const people = useMemo(() => (q.data?.people ?? []).filter((p: any) =>
    `${p.name} ${p.email}`.toLowerCase().includes(s) && (type === "all" || p.types.includes(type)) &&
    (tab === "test" ? p.isTestDemo : tab === "archived" ? p.status === "archived" : tab === "revoked" ? (p.status === "revoked" || p.scopedRevokes.length > 0) : tab === "all" ? p.status === "active" && !p.isTestDemo : false)), [q.data, s, type, tab]);
  const invites = useMemo(() => (q.data?.invites ?? []).filter((i: any) =>
    `${i.name ?? ""} ${i.email}`.toLowerCase().includes(s) && (type === "all" || i.type === type) && (tab === "invited" ? !i.isTestDemo : tab === "test" ? i.isTestDemo : false)), [q.data, s, type, tab]);
  const testClients = tab === "test" ? (q.data?.clients ?? []).filter((c: any) => c.is_test_demo) : [];

  const act = async (fn: () => Promise<any>, msg: string) => { try { await fn(); toast.success(msg); await qc.invalidateQueries(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl">{tab === "test" ? "Test & Demo users" : "All users"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Everyone with an account or an open invitation. Revoke, archive or restore access; mark test and demo records so they're left out of totals.</p>
      </header>
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "outline"} onClick={() => setTab(t.id)}>{t.label}</Button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <select aria-label="Filter by type" className="rounded border bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      {tab !== "invited" && q.data && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Person</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Last signed in</th><th className="p-3" /></tr></thead>
            <tbody className="divide-y">
              {people.map((p: any) => (
                <tr key={p.id}>
                  <td className="p-3"><div className="font-medium">{p.name || p.email}</div><div className="text-xs text-muted-foreground">{p.email}{p.isSelf ? " · you" : ""}</div></td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{p.types.map((t: string) => <Badge key={t} variant="outline">{t}</Badge>)}</div></td>
                  <td className="p-3">{p.status === "active" && !p.scopedRevokes.length && !p.isTestDemo ? "Active" : <AccessBadge info={{ userId: p.id, status: p.status, isTestDemo: p.isTestDemo, scoped: p.scopedRevokes.length }} />}</td>
                  <td className="whitespace-nowrap p-3">{when(p.lastSignIn)}</td>
                  <td className="p-3 text-right">{!p.isSelf && <PeopleActions userId={p.id} email={p.email} name={p.name} info={{ userId: p.id, status: p.status, isTestDemo: p.isTestDemo, scoped: p.scopedRevokes.length }} />}</td>
                </tr>
              ))}
              {!people.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No one here.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {(tab === "invited" || tab === "test") && q.data && (
        <section className="space-y-2">
          {tab === "test" && <h2 className="text-lg font-semibold">Test & Demo invitations</h2>}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Invited</th><th className="p-3">Type</th><th className="p-3">Invited by</th><th className="p-3">Sent</th><th className="p-3">Last reminder</th><th className="p-3" /></tr></thead>
              <tbody className="divide-y">
                {invites.map((i: any) => (
                  <tr key={i.table + i.id}>
                    <td className="p-3"><div className="font-medium">{i.name || i.email}</div><div className="text-xs text-muted-foreground">{i.email}</div></td>
                    <td className="p-3"><Badge variant="outline">{i.type}</Badge></td>
                    <td className="p-3">{i.invitedBy || "—"}</td>
                    <td className="whitespace-nowrap p-3">{when(i.sentAt)}</td>
                    <td className="whitespace-nowrap p-3">{when(i.lastSent)}</td>
                    <td className="space-x-1 whitespace-nowrap p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => act(() => flag({ data: { kind: i.table, id: i.id, value: !i.isTestDemo } }), i.isTestDemo ? "Unmarked." : "Marked as test/demo.")}>{i.isTestDemo ? "Unmark test" : "Mark test"}</Button>
                      <Button size="sm" variant="outline" onClick={() => { const r = window.prompt("Reason for cancelling this invitation"); if (r && r.trim().length >= 3) void act(() => cancel({ data: { table: i.table, id: i.id, reason: r } }), "Invitation cancelled."); }}>Cancel invite</Button>
                    </td>
                  </tr>
                ))}
                {!invites.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No open invitations.</td></tr>}
              </tbody>
            </table>
          </div>
          {tab === "invited" && <p className="text-xs text-muted-foreground">To resend, use Resend on the Fund Managers, Founders or Invite & access pages.</p>}
        </section>
      )}

      {tab === "test" && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Test & Demo clients</h2>
          {!testClients.length ? <p className="text-sm text-muted-foreground">None marked. Use "Mark test" on the Clients list.</p> : (
            <ul className="divide-y rounded-lg border text-sm">{testClients.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between p-3"><span>{c.name}</span>
                <Button size="sm" variant="ghost" onClick={() => act(() => flag({ data: { kind: "client", id: c.id, value: false } }), "Unmarked.")}>Unmark test</Button></li>))}</ul>
          )}
        </section>
      )}
    </main>
  );
}
