import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getHarmoniousTeam, getMyHarmoniousContacts, setClientTeamMember, setFundTeamOverride } from "@/lib/harmonious-team.functions";
import { TEAM_ROLE_LABEL, TEAM_SOURCE_LABEL, type TeamRole, type TeamSource } from "@/lib/harmonious-team";

/** Internal Harmonious Team for a Client or Fund. Ownership only - never a gate. */
export function HarmoniousTeamCard({ clientId, offeringId }: { clientId?: string; offeringId?: string }) {
  const load = useServerFn(getHarmoniousTeam);
  const setClient = useServerFn(setClientTeamMember);
  const setFund = useServerFn(setFundTeamOverride);
  const qc = useQueryClient();
  const key = ["harmonious-team", clientId ?? offeringId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: clientId ? { clientId } : { offeringId } }), retry: false });
  const [editing, setEditing] = useState<TeamRole | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const d = q.data as any;
  if (!d) return null;

  const save = async (role: TeamRole, userId: string | null) => {
    try {
      if (clientId) await setClient({ data: { clientId, role, userId } });
      else await setFund({ data: { offeringId: offeringId!, role, userId } });
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["harmonious-team"] });
      toast.success(userId ? "Assignment saved" : clientId ? "Assignment cleared" : "Reset to Client Assignment");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Harmonious Team</CardTitle>
          {d.followUp ? <Badge variant="outline">{d.followUp}</Badge> : null}
        </div>
        <CardDescription>Internal ownership for routing. It does not change anyone's access.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y text-sm">
          {d.members.map((m: any) => (
            <li key={m.role} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="text-xs text-muted-foreground">{TEAM_ROLE_LABEL[m.role as TeamRole]}</p>
                <p className="font-medium">{m.name ?? "Not assigned"}</p>
                {d.scope === "fund" ? <p className="text-xs text-muted-foreground">{TEAM_SOURCE_LABEL[m.source as TeamSource]}</p> : null}
              </div>
              {m.canManage ? (
                editing === m.role ? (
                  <select
                    aria-label={`Choose ${TEAM_ROLE_LABEL[m.role as TeamRole]}`}
                    className="rounded-md border bg-background px-2 py-1 text-sm"
                    defaultValue=""
                    onChange={(e) => e.target.value && save(m.role, e.target.value === "__clear" ? null : e.target.value)}
                  >
                    <option value="">Select…</option>
                    {d.staff.filter((s: any) => s.eligible[m.role]).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    {d.scope === "client" && m.userId ? <option value="__clear">Clear assignment</option> : null}
                  </select>
                ) : (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(m.role)}>{d.scope === "fund" ? "Override" : "Change"}</Button>
                    {d.scope === "fund" && m.source === "fund_override" ? (
                      <Button size="sm" variant="ghost" onClick={() => save(m.role, null)}>Reset to Client Assignment</Button>
                    ) : null}
                  </div>
                )
              ) : null}
            </li>
          ))}
        </ul>
        {d.history.length ? (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>{showHistory ? "Hide" : "Show"} change history</Button>
            {showHistory ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {d.history.map((h: any) => (
                  <li key={h.id}>
                    {new Date(h.at).toLocaleDateString()} · {TEAM_ROLE_LABEL[h.role as TeamRole]}: {h.prior ?? "none"} → {h.next ?? "none"}
                    {h.scope === "fund" ? ` (${TEAM_SOURCE_LABEL[h.newSource as TeamSource] ?? h.newSource})` : ""} · by {h.by ?? "system"}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Client/Fund Manager view: Account Manager and Operations Contact names only. */
export function YourHarmoniousTeam({ fundId }: { fundId: string }) {
  const load = useServerFn(getMyHarmoniousContacts);
  const q = useQuery({ queryKey: ["my-harmonious-contacts", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const contacts = ((q.data as any)?.contacts ?? []) as { role: string; name: string }[];
  if (!contacts.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Your Harmonious Team</CardTitle></CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm">
          {contacts.map((c) => (
            <li key={c.role} className="flex justify-between gap-3"><span className="text-muted-foreground">{c.role}</span><span className="font-medium">{c.name}</span></li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
