import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessBadge, PeopleActions } from "@/components/people-actions";
import { cancelInvitation, getPeopleDirectory, setTestDemoFlag } from "@/lib/user-access.functions";
import { ResendInviteButton } from "@/components/invite-resend";
import { DeliveryBadge, insightTime } from "@/components/user-insights";

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
  const [attention, setAttention] = useState("all");
  const [busy, setBusy] = useState(false);
  const s = search.toLowerCase();

  const people = useMemo(() => (q.data?.people ?? []).filter((p: any) =>
    `${p.name} ${p.email}`.toLowerCase().includes(s) && (type === "all" || p.types.includes(type)) && (attention === "all" || attention === "never" && !p.lastSignIn || attention === "setup" && p.gaps?.length > 0 || attention === "email" && ["Failed", "Bounced", "Blocked"].includes(p.latestInvite?.outcome.status)) &&
    (tab === "test" ? p.isTestDemo : tab === "archived" ? p.status === "archived" : tab === "revoked" ? (p.status === "revoked" || p.scopedRevokes.length > 0) : tab === "all" ? p.status === "active" && !p.isTestDemo : false)), [q.data, s, type, tab, attention]);
  const invites = useMemo(() => (q.data?.invites ?? []).filter((i: any) =>
    `${i.name ?? ""} ${i.email}`.toLowerCase().includes(s) && (type === "all" || i.type === type) && (attention === "all" || attention === "expired" && i.expiresAt && Date.parse(i.expiresAt) < Date.now() || attention === "email" && ["Failed", "Bounced", "Blocked"].includes(i.outcome.status)) && (tab === "invited" ? !i.isTestDemo : tab === "test" ? i.isTestDemo : false)), [q.data, s, type, tab, attention]);
  const testClients = tab === "test" ? (q.data?.clients ?? []).filter((c: any) => c.is_test_demo) : [];

  const act = async (fn: () => Promise<any>, msg: string) => { setBusy(true); try { await fn(); toast.success(msg); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } finally { await qc.invalidateQueries(); setBusy(false); } };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl">{tab === "test" ? "Test & Demo users" : "All users"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Everyone with an account or an open invitation. Revoke, archive or restore access; mark test and demo records so they're left out of totals.</p>
      </header>
      {q.data && <div className="flex flex-wrap gap-3 border-y py-3 text-sm"><span>Pending invites: {q.data.invites.filter((i: any) => !i.isTestDemo).length}</span><span>Expired: {q.data.invites.filter((i: any) => !i.isTestDemo && i.expiresAt && Date.parse(i.expiresAt) < Date.now()).length}</span><span>Never signed in: {q.data.people.filter((p: any) => !p.isTestDemo && !p.lastSignIn).length}</span><span>Incomplete setup: {q.data.people.filter((p: any) => !p.isTestDemo && p.gaps.length).length}</span><span>Email failures: {q.data.invites.filter((i: any) => !i.isTestDemo && ["Failed", "Bounced", "Blocked"].includes(i.outcome.status)).length}</span></div>}
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "outline"} onClick={() => setTab(t.id)}>{t.label}</Button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <select aria-label="Filter by type" className="rounded border bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Filter by attention needed" className="rounded border bg-background px-2 text-sm" value={attention} onChange={e => { setAttention(e.target.value); if (e.target.value === "expired") setTab("invited"); }}><option value="all">All statuses</option><option value="never">Never signed in</option><option value="setup">Incomplete setup</option><option value="email">Email problems</option><option value="expired">Expired invitations</option></select>
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data?.providerError && <p className="text-sm text-muted-foreground">{q.data.providerError} <Button variant="outline" size="sm" onClick={() => q.refetch()}>Refresh email status</Button></p>}

      {tab !== "invited" && q.data && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Person</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Last signed in</th><th className="p-3" /></tr></thead>
            <tbody className="divide-y">
              {people.map((p: any) => (
                <tr key={p.id}>
                  <td className="p-3"><Link to="/ops/people/$userId" params={{ userId: p.id }} className="font-medium text-primary hover:underline">{p.name || p.email}</Link><div className="text-xs text-muted-foreground">{p.email}{p.isSelf ? " · you" : ""}</div></td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{p.types.map((t: string) => <Badge key={t} variant="outline">{t}</Badge>)}</div></td>
                  <td className="space-y-2 p-3">{p.status === "active" && !p.scopedRevokes.length && !p.isTestDemo ? "Active" : <AccessBadge info={{ userId: p.id, status: p.status, isTestDemo: p.isTestDemo, scoped: p.scopedRevokes.length }} />}<div><DeliveryBadge outcome={p.latestInvite?.outcome} /></div><p className="text-xs text-muted-foreground">Invite: {insightTime(p.latestInvite?.lastSent)}</p>{p.gaps?.length > 0 && <p className="text-xs text-muted-foreground">Missing: {p.gaps.join(", ")}</p>}</td>
                  <td className="whitespace-nowrap p-3">{when(p.lastSignIn)}</td>
                  <td className="p-3 text-right">{!p.isSelf && q.data?.canManage && <PeopleActions userId={p.id} email={p.email} name={p.name} info={{ userId: p.id, status: p.status, isTestDemo: p.isTestDemo, scoped: p.scopedRevokes.length }} resend={p.latestInvite && ["pending", "accepted"].includes(p.latestInvite.status) ? { kind: "directory", table: p.latestInvite.table, id: p.latestInvite.id } : null} />}</td>
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
                    <td className="space-y-2 p-3"><Link to="/ops/people/invitations/$invitationId" params={{ invitationId: i.id }} search={{ source: i.table }} className="font-medium text-primary hover:underline">{i.name || i.email}</Link><div className="text-xs text-muted-foreground">{i.email}</div><DeliveryBadge outcome={i.outcome} /><div className="text-xs text-muted-foreground">Expires: {insightTime(i.expiresAt)}</div></td>
                    <td className="p-3"><Badge variant="outline">{i.type}</Badge></td>
                    <td className="p-3">{i.invitedBy || "—"}</td>
                    <td className="whitespace-nowrap p-3">{insightTime(i.sentAt)}</td>
                    <td className="whitespace-nowrap p-3">{insightTime(i.lastSent)}<div className="text-xs text-muted-foreground">{i.lastSender ?? ""}</div></td>
                    <td className="space-x-1 whitespace-nowrap p-3 text-right">{q.data?.canManage && <>
                       <ResendInviteButton target={{ kind: "directory", table: i.table, id: i.id }} label="Resend" />
                       <Button size="sm" variant="ghost" onClick={() => act(() => flag({ data: { kind: i.table, id: i.id, value: !i.isTestDemo } }), i.isTestDemo ? "Unmarked." : "Marked as test/demo.")}>{i.isTestDemo ? "Unmark test" : "Mark test"}</Button>
                      {i.status === "pending" && <Button size="sm" variant="outline" onClick={() => { const r = window.prompt("Reason for cancelling this invitation"); if (r && r.trim().length >= 3) void act(() => cancel({ data: { table: i.table, id: i.id, reason: r } }), "Invitation cancelled."); }}>Cancel invite</Button>}</>}
                    </td>
                  </tr>
                ))}
                {!invites.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No open invitations.</td></tr>}
              </tbody>
            </table>
          </div>
          {tab === "invited" && <p className="text-xs text-muted-foreground">Resend emails a fresh one-time link; the old link stops working.</p>}
        </section>
      )}

      {tab === "test" && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Test & Demo clients</h2>
          {!testClients.length ? <p className="text-sm text-muted-foreground">None marked. Use "Mark test" on the Clients list.</p> : (
            <ul className="divide-y rounded-lg border text-sm">{testClients.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between p-3"><span>{c.name}</span>
                {q.data?.canManage && <Button size="sm" variant="ghost" onClick={() => act(() => flag({ data: { kind: "client", id: c.id, value: false } }), "Unmarked.")}>Unmark test</Button>}</li>))}</ul>
          )}
        </section>
      )}
    </main>
  );
}
