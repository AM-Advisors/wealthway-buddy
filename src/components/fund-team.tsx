import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { addFundTeamMember, getFundTeam, removeFundTeamMember, searchFundTeamCandidates } from "@/lib/invitations.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Member = { userId: string; name: string; email: string; role: string; since: string | null; source: string };

export function FundTeam({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundTeam);
  const search = useServerFn(searchFundTeamCandidates);
  const add = useServerFn(addFundTeamMember);
  const remove = useServerFn(removeFundTeamMember);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-team", fundId], queryFn: () => load({ data: { fundId } }) });
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-team", fundId] });
  const err = (e: any) => toast.error(e?.message ?? "Something went wrong.");
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  const section = (title: string, desc: string, rows: Member[], removable: boolean) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!rows.length ? <p className="text-sm text-muted-foreground">No one.</p> : null}
        {rows.map((m) => (
          <div key={`${m.source}:${m.userId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div>
              <p className="font-medium">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.email} · {m.source}{m.since ? ` · since ${new Date(m.since).toLocaleDateString()}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{m.role.replace(/_/g, " ")}</Badge>
              {removable && d.canManage ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
                  if (!confirm(`Remove ${m.name} from this fund's team? Only access to this fund is removed.`)) return;
                  setBusy(true);
                  remove({ data: { fundId, userId: m.userId } }).then(() => { toast.success("Removed from this fund."); refresh(); }, err).finally(() => setBusy(false));
                }}>Remove from fund</Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Team</h2>
        <p className="text-sm text-muted-foreground">People with explicit access to this fund. Email domain or client affiliation alone never grants access.</p>
      </div>
      {d.canManage ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add fund manager</CardTitle>
            <CardDescription>Harmonious staff only. Adds an existing person to this fund only. No email is sent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Search by name or email" value={term} onChange={(e) => setTerm(e.target.value)} />
              <Button variant="outline" disabled={term.trim().length < 2} onClick={() => search({ data: { fundId, q: term } }).then(setHits, err)}>Search</Button>
            </div>
            {hits?.map((h) => (
              <div key={h.userId} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                <span>{h.name} <span className="text-xs text-muted-foreground">{h.email}</span></span>
                {h.onTeam ? <Badge variant="outline">Already on team</Badge> : (
                  <Button size="sm" disabled={busy} onClick={() => { setBusy(true); add({ data: { fundId, userId: h.userId } }).then(() => { toast.success("Added as fund manager for this fund."); setHits(null); setTerm(""); refresh(); }, err).finally(() => setBusy(false)); }}>Add to team</Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">Only Harmonious can change this fund's team.</p>
      )}
      {section("Fund managers", "Explicit fund manager assignments for this fund.", d.managers as Member[], true)}
      {section("Harmonious staff", "Staff assigned to this fund's client. Changed from the client record.", d.staff as Member[], false)}
      {section("Delegated professionals", "Active delegations scoped to this fund. Managed through the delegation workflow.", d.delegates as Member[], false)}
    </div>
  );
}
