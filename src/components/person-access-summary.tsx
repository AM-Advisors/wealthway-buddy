import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getPersonAccessSummary } from "@/lib/user-access.functions";
import { getPersonAccessSetup, setClientMembership, setFundManagerAccess } from "@/lib/access-admin.functions";
import { changeFundTeamAccess, grantFundTeamAccess } from "@/lib/fund-team-access.functions";

const KIND: Record<string, string> = {
  staff: "Staff role",
  fund_manager: "Fund manager",
  client_member: "Client member",
  fund_team: "Fund team",
  investor: "Investor",
};
type Grant = "fund_manager" | "client_member" | "fund_viewer" | "fund_assistant" | "fund_reviewer";
const GRANTS: { value: Grant; label: string; fund: boolean }[] = [
  { value: "fund_manager", label: "Fund manager", fund: true },
  { value: "fund_viewer", label: "Fund team · Viewer", fund: true },
  { value: "fund_assistant", label: "Fund team · Assistant", fund: true },
  { value: "fund_reviewer", label: "Fund team · Routine reviewer", fund: true },
  { value: "client_member", label: "Client member · View only", fund: false },
];

/** Everything this person can open, and why, with grant and remove for access administrators. Every change needs a reason and is logged. */
export function PersonAccessSummary({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getPersonAccessSummary);
  const loadSetup = useServerFn(getPersonAccessSetup);
  const setClient = useServerFn(setClientMembership);
  const setFund = useServerFn(setFundManagerAccess);
  const grantTeam = useServerFn(grantFundTeamAccess);
  const changeTeam = useServerFn(changeFundTeamAccess);
  const q = useQuery({ queryKey: ["person-access-summary", userId], queryFn: () => load({ data: { userId } }), retry: false });
  const setup = useQuery({ queryKey: ["person-access-setup", userId], queryFn: () => loadSetup({ data: { userId } }), retry: false });
  const [why, setWhy] = useState("");
  const [kind, setKind] = useState<Grant>("fund_manager");
  const [target, setTarget] = useState("");

  const refresh = () => {
    for (const k of ["person-access-summary", "person-access-setup", "person-activity", "access-profile"]) void qc.invalidateQueries({ queryKey: [k, userId] });
  };
  const run = useMutation({
    mutationFn: async (v: { action: "add" | "remove"; kind: string; fundId?: string; clientId?: string; grantId?: string }) => {
      const reason = why.trim();
      if (v.kind === "fund_manager") return setFund({ data: { targetUserId: userId, fundId: v.fundId!, add: v.action === "add", reason } });
      if (v.kind === "client_member") return setClient({ data: { targetUserId: userId, clientId: v.clientId!, add: v.action === "add", change: false, role: "client_readonly", canApprove: false, reason } });
      if (v.action === "remove") return changeTeam({ data: { grantId: v.grantId!, action: "revoke", reason } });
      if (!q.data?.email) throw new Error("This login has no email on file, so fund team access can't be given.");
      return grantTeam({ data: { fundId: v.fundId!, email: q.data.email, role: v.kind } });
    },
    onSuccess: (_r, v) => { toast.success(v.action === "add" ? "Access given." : "Access removed."); setTarget(""); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const s = setup.data;
  const edit = !!s?.canEdit && !s?.self;
  const reasonOk = why.trim().length >= 5;
  const fundGrant = GRANTS.find((g) => g.value === kind)!.fund;
  const options = fundGrant
    ? (s?.fundOptions ?? []).map((f: any) => ({ value: f.id, label: f.name }))
    : (s?.clientOptions ?? []).map((c: any) => ({ value: c.id, label: c.name }));
  const removable = (k: string) => k === "fund_manager" || k === "client_member" || k === "fund_team";

  return (
    <section className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <h2 className="mr-auto text-lg">Access</h2>
        {q.data && <Badge variant={q.data.hasPerson ? "outline" : "destructive"}>{q.data.hasPerson ? "Linked to person record" : "No person record"}</Badge>}
      </div>
      {edit && (
        <label className="block space-y-1 border-b p-4 text-sm">
          <span className="font-medium">Reason for any change (required, saved in the access history)</span>
          <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: Joining Blacklake as a fund manager" />
        </label>
      )}
      {s && !s.canEdit && <p className="border-b p-4 text-sm text-muted-foreground">You can view this. Only access administrators can change it.</p>}
      {s?.self && s.canEdit && <p className="border-b p-4 text-sm text-muted-foreground">You can't change your own access. Ask another access administrator.</p>}
      {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && !q.data.lines.length && <p className="p-4 text-sm text-muted-foreground">This person can't open any fund or client.</p>}
      {q.data && q.data.lines.length > 0 && (
        <ul className="divide-y text-sm">
          {q.data.lines.map((l, i) => (
            <li key={`${l.kind}-${l.grantId ?? l.fundId ?? l.clientId ?? i}`} className="flex flex-wrap items-center gap-2 p-3">
              <Badge variant="outline">{KIND[l.kind]}</Badge><span className="mr-auto">{l.label}</span>
              {edit && removable(l.kind) && (l.kind !== "fund_team" || l.grantId) && (
                <Button size="sm" variant="ghost" disabled={run.isPending || !reasonOk}
                  onClick={() => { if (window.confirm(`Remove ${KIND[l.kind]?.toLowerCase()} access to ${l.label}?`)) run.mutate({ action: "remove", kind: l.kind, ...(l.fundId ? { fundId: l.fundId } : {}), ...(l.clientId ? { clientId: l.clientId } : {}), ...(l.grantId ? { grantId: l.grantId } : {}) }); }}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <div className="flex flex-wrap items-end gap-2 border-t p-4 text-sm">
          <label className="space-y-1">Give
            <select aria-label="Kind of access" className="block h-9 rounded-md border bg-background px-2" value={kind} onChange={(e) => { setKind(e.target.value as Grant); setTarget(""); }}>
              {GRANTS.filter((g) => !(s?.staffEmail && g.value === "fund_manager")).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </label>
          <label className="min-w-64 flex-1 space-y-1">{fundGrant ? "Fund" : "Client"}
            <SearchableSelect aria-label={fundGrant ? "Fund" : "Client"} placeholder={fundGrant ? "Choose a fund…" : "Choose a client…"} options={options} value={target} onValueChange={setTarget} />
          </label>
          <Button disabled={!target || run.isPending || !reasonOk}
            onClick={() => run.mutate({ action: "add", kind, ...(fundGrant ? { fundId: target } : { clientId: target }) })}>
            Give access
          </Button>
          {s?.staffEmail && <p className="w-full text-xs text-muted-foreground">Harmonious staff work on funds through client assignments, so they can't be added as fund managers.</p>}
        </div>
      )}
    </section>
  );
}
