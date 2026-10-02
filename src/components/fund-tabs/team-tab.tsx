import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TEAM_PERMISSIONS, TEAM_ROLES } from "@/lib/fund-doc-templates";
import { decideFeesFn, fundTeamFn, removeTeamMemberFn, saveTeamMemberFn, setFeesFn } from "@/lib/fund-tabs.functions";
import { fmtDate, toPct } from "./shared";

const roleLabel = (v: string) => TEAM_ROLES.find((r) => r.value === v)?.label ?? v;
const permLabel = (v: string) => TEAM_PERMISSIONS.find((r) => r.value === v)?.label ?? v;
const PROVIDERS = ["counsel", "auditor", "tax_preparer", "accountant"];

export function TeamTab({ fundId }: { fundId: string }) {
  const load = useServerFn(fundTeamFn);
  const q = useQuery({ queryKey: ["fund-team", fundId], queryFn: () => load({ data: { fundId } }) });
  const [editing, setEditing] = useState<any | null>(null);
  const d = q.data;
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !d) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Couldn't load the team."}</p>;
  const people = d.members.filter((m: any) => !PROVIDERS.includes(m.team_role));
  const providers = d.members.filter((m: any) => PROVIDERS.includes(m.team_role));

  const list = (rows: any[], empty: string) => rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
    <div className="divide-y rounded-md border">
      {rows.map((m) => (
        <div key={m.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
          <div>
            <p className="font-medium">{m.full_name} <span className="font-normal text-muted-foreground">· {roleLabel(m.team_role)}{m.company ? ` · ${m.company}` : ""}</span></p>
            <p className="text-xs text-muted-foreground">{[m.email, m.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
            <div className="mt-1 flex flex-wrap gap-1">{(m.permissions as string[]).map((p) => <Badge key={p} variant={p === "authorized_signatory" ? "default" : "secondary"}>{permLabel(p)}</Badge>)}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing(m)}>Edit</Button>
        </div>
      ))}
    </div>
  );

  const mine = d.members.find((m: any) => m.user_id === d.me && !m.roles_confirmed_at);
  return (
    <div className="space-y-5">
      {mine && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Confirm your role on this fund</CardTitle>
            <CardDescription>
              You were added to the Team because you requested this fund. Check your role and permissions: are you the GP or a manager, an authorized signatory, and do you need banking access?
            </CardDescription>
          </CardHeader>
          <CardContent><Button size="sm" onClick={() => setEditing(mine)}>Review my role</Button></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Manager / GP and team</CardTitle>
            <CardDescription>Give each person the permissions they need. Authorized signatory is a permission.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing({ team_role: "member", permissions: ["view"] })}>Add team member</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {d.signedInManagers.length > 0 && <p className="text-xs text-muted-foreground">Signed-in fund managers: {d.signedInManagers.map((m: any) => m.name).join(", ")}</p>}
          {list(people, "No Manager / GP details yet. Add the GP first.")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Counsel, auditor, tax preparer and accountant</CardTitle>
            <CardDescription>The firms that work on this fund.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing({ team_role: "counsel", permissions: [] })}>Add provider</Button>
        </CardHeader>
        <CardContent>{list(providers, "No providers added yet.")}</CardContent>
      </Card>

      <FeesCard fundId={fundId} d={d} />
      {editing && <MemberEditor key={editing.id ?? `new-${editing.team_role}`} fundId={fundId} member={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberEditor({ fundId, member, onClose }: { fundId: string; member: any; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveTeamMemberFn);
  const remove = useServerFn(removeTeamMemberFn);
  const [f, setF] = useState({ fullName: member.full_name ?? "", email: member.email ?? "", phone: member.phone ?? "", company: member.company ?? "", teamRole: member.team_role, permissions: new Set<string>(member.permissions ?? []) });
  const done = () => { qc.invalidateQueries({ queryKey: ["fund-team", fundId] }); onClose(); };
  const m = useMutation({
    mutationFn: () => save({ data: { fundId, id: member.id ?? null, fullName: f.fullName, email: f.email, phone: f.phone, company: f.company, teamRole: f.teamRole, permissions: [...f.permissions] as any } }),
    onSuccess: () => { toast.success("Saved"); done(); }, onError: (e: Error) => toast.error(e.message),
  });
  const r = useMutation({ mutationFn: () => remove({ data: { fundId, id: member.id } }), onSuccess: () => { toast.success("Removed"); done(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Card className="border-primary/40">
      <CardHeader><CardTitle className="text-base">{member.id ? "Edit" : "Add"} person</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Name</Label><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
          <div className="space-y-1"><Label>Role</Label>
            <Select value={f.teamRole} onValueChange={(v) => setF({ ...f, teamRole: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TEAM_ROLES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Company / firm</Label><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
        </div>
        <div className="space-y-1">
          <Label>Permissions</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEAM_PERMISSIONS.map((p) => (
              <label key={p.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.permissions.has(p.value)} onCheckedChange={() => { const n = new Set(f.permissions); n.has(p.value) ? n.delete(p.value) : n.add(p.value); setF({ ...f, permissions: n }); }} />
                {p.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">These record who does what on the fund. Portal sign-in access is still granted separately.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={m.isPending || f.fullName.trim().length < 2} onClick={() => m.mutate()}>Save</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {member.id && <Button variant="destructive" className="ml-auto" disabled={r.isPending} onClick={() => r.mutate()}>Remove</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function FeesCard({ fundId, d }: { fundId: string; d: any }) {
  const qc = useQueryClient();
  const set = useServerFn(setFeesFn);
  const decide = useServerFn(decideFeesFn);
  const a = d.activeFee;
  const [f, setF] = useState({ mgmt: a?.management_fee_pct?.toString() ?? "", basis: a?.management_fee_basis ?? "Committed capital", carry: a?.carry_pct?.toString() ?? "", hurdle: a?.hurdle_pct?.toString() ?? "", notes: "" });
  const m = useMutation({
    mutationFn: () => set({ data: { fundId, managementFeePct: toPct(f.mgmt), managementFeeBasis: f.basis, carryPct: toPct(f.carry), hurdlePct: toPct(f.hurdle), notes: f.notes } }),
    onSuccess: (r) => { toast.success(r.applied ? "Fees updated" : "Sent to Harmonious for approval"); qc.invalidateQueries({ queryKey: ["fund-team", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dm = useMutation({
    mutationFn: (approve: boolean) => decide({ data: { feeId: d.pendingFee.id, approve } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fund-team", fundId] }), onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Management fee and carried interest</CardTitle>
        <CardDescription>
          {d.investorsSigned ? "An investor has signed fund documents, so changes go to Harmonious for approval first." : "No investor has signed yet, so changes take effect immediately."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">Current: {a ? `${a.management_fee_pct ?? "-"}% management fee (${a.management_fee_basis ?? "basis not set"}) · ${a.carry_pct ?? "-"}% carry${a.hurdle_pct != null ? ` · ${a.hurdle_pct}% hurdle` : ""}` : "Not set yet"}</p>
        {d.pendingFee && (
          <div className="rounded-md border border-primary/40 p-3 text-sm">
            <p>Waiting for Harmonious approval: {d.pendingFee.management_fee_pct ?? "-"}% management fee · {d.pendingFee.carry_pct ?? "-"}% carry (requested {fmtDate(d.pendingFee.created_at)})</p>
            {d.staff && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => dm.mutate(true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => dm.mutate(false)}>Reject</Button></div>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1"><Label>Management fee %</Label><Input inputMode="decimal" value={f.mgmt} onChange={(e) => setF({ ...f, mgmt: e.target.value })} placeholder="2" /></div>
          <div className="space-y-1"><Label>Fee basis</Label><Input value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} /></div>
          <div className="space-y-1"><Label>Carried interest %</Label><Input inputMode="decimal" value={f.carry} onChange={(e) => setF({ ...f, carry: e.target.value })} placeholder="20" /></div>
          <div className="space-y-1"><Label>Hurdle % (optional)</Label><Input inputMode="decimal" value={f.hurdle} onChange={(e) => setF({ ...f, hurdle: e.target.value })} /></div>
        </div>
        <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes (who receives carry, splits, etc.)" maxLength={2000} />
        <Button disabled={m.isPending} onClick={() => m.mutate()}>{d.investorsSigned ? "Request change" : "Save fees"}</Button>
      </CardContent>
    </Card>
  );
}
