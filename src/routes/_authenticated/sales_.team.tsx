import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSalesTeam, setSalesManager, setSalesTarget } from "@/lib/sales-hub.functions";
import { MANAGED_ROLE_LABEL } from "@/lib/staff-role-hierarchy";
import { Panel } from "@/components/sales/sales-ui";

export const Route = createFileRoute("/_authenticated/sales_/team")({
  head: () => ({
    meta: [
      { title: "Sales team - Harmonious" },
      { name: "description", content: "Harmonious Sales team: roles, managers, targets and each rep's overview." },
      { property: "og:title", content: "Sales team - Harmonious" },
      { property: "og:description", content: "Manage reporting lines and quotas for CRO, Sales Managers, AEs and BDRs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TeamPage,
});

const roleLabel = (r: string) => (MANAGED_ROLE_LABEL as Record<string, string>)[r] ?? r;

function TeamPage() {
  const load = useServerFn(getSalesTeam);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sales-team"], queryFn: () => load() });
  const setMgr = useServerFn(setSalesManager);
  const mgr = useMutation({ mutationFn: (v: { repId: string; managerId: string | null }) => setMgr({ data: v }), onSuccess: () => { toast.success("Manager updated"); qc.invalidateQueries({ queryKey: ["sales-team"] }); }, onError: (e: Error) => toast.error(e.message) });
  const [targetFor, setTargetFor] = useState<{ id: string; name: string } | null>(null);
  const d = q.data;
  const managers = (d?.team ?? []).filter((t) => t.roles.some((r) => ["sales_management", "cro"].includes(r)));
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl">Sales team</h1>
        <p className="mt-1 text-sm text-muted-foreground">Roles are assigned on the Harmonious Roles page. CRO and CEO set who reports to whom; managers set targets for their team.</p>
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (
        <Panel title="Team members" action={<Button asChild size="sm" variant="outline"><Link to="/sales/reps/$id" params={{ id: d.me }}>My overview</Link></Button>}>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Roles</TableHead><TableHead>Reports to</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {d.team.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><Link to="/sales/reps/$id" params={{ id: t.id }} className="font-medium text-foreground hover:underline">{t.name}</Link></TableCell>
                  <TableCell className="space-x-1">{t.roles.map((r) => <Badge key={r} variant="secondary">{roleLabel(r)}</Badge>)}</TableCell>
                  <TableCell>
                    {d.scope === "all" ? (
                      <Select value={t.managerId ?? "none"} onValueChange={(v) => mgr.mutate({ repId: t.id, managerId: v === "none" ? null : v })}>
                        <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No manager</SelectItem>
                          {managers.filter((m) => m.id !== t.id).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : <span className="text-sm text-muted-foreground">{managers.find((m) => m.id === t.managerId)?.name ?? "-"}</span>}
                  </TableCell>
                  <TableCell className="text-right">{d.scope !== "own" && <Button size="sm" variant="outline" onClick={() => setTargetFor({ id: t.id, name: t.name })}>Set target</Button>}</TableCell>
                </TableRow>
              ))}
              {!d.team.length && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No Sales team members yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Panel>
      )}
      <TargetDialog rep={targetFor} onClose={() => setTargetFor(null)} />
    </main>
  );
}

function TargetDialog({ rep, onClose }: { rep: { id: string; name: string } | null; onClose: () => void }) {
  const save = useServerFn(setSalesTarget);
  const now = new Date();
  const q0 = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  const q1 = new Date(Date.UTC(q0.getUTCFullYear(), q0.getUTCMonth() + 3, 0));
  const [f, setF] = useState({ start: q0.toISOString().slice(0, 10), end: q1.toISOString().slice(0, 10), revenue: "", outreach: "" });
  const m = useMutation({
    mutationFn: () => save({ data: { repId: rep!.id, periodStart: f.start, periodEnd: f.end, revenueTargetCents: Math.round(Number(f.revenue || 0) * 100), outreachTarget: Number(f.outreach || 0) } }),
    onSuccess: () => { toast.success("Target saved"); onClose(); }, onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!rep} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Target for {rep?.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>From<Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label>To<Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
          <label>Revenue target ($)<Input inputMode="decimal" value={f.revenue} onChange={(e) => setF({ ...f, revenue: e.target.value })} /></label>
          <label>Outreach target<Input inputMode="numeric" value={f.outreach} onChange={(e) => setF({ ...f, outreach: e.target.value })} /></label>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Save target</Button>
      </DialogContent>
    </Dialog>
  );
}
