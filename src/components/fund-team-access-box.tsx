import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeFundTeamAccess, grantFundTeamAccess, listFundTeamGrants } from "@/lib/fund-team-access.functions";
import { fundTeamRoleLabel, type FundTeamRole } from "@/lib/fund-team-access";

const STATUS: Record<string, string> = {
  active: "Active",
  revoked: "Removed",
  expired: "Expired",
  needs_review: "Paused — granting manager left",
};

export function FundTeamAccessBox({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listFundTeamGrants);
  const grant = useServerFn(grantFundTeamAccess);
  const change = useServerFn(changeFundTeamAccess);
  const key = ["fund-team-grants", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { fundId } }) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FundTeamRole>("fund_viewer");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await grant({ data: { fundId, email, role, expiresAt: expires ? new Date(expires).toISOString() : null } });
      toast.success("Access granted");
      setEmail("");
      qc.invalidateQueries({ queryKey: key });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not grant access");
    } finally {
      setBusy(false);
    }
  }

  async function act(grantId: string, action: "revoke" | "change_role", newRole?: FundTeamRole) {
    const reason = window.prompt(action === "revoke" ? "Reason for removing access" : "Reason for changing role");
    if (!reason || reason.trim().length < 3) return;
    try {
      await change({ data: { grantId, action, role: newRole, reason } });
      toast.success(action === "revoke" ? "Access removed" : "Role changed");
      qc.invalidateQueries({ queryKey: key });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update access");
    }
  }

  if (q.isError) return null;
  const grants = q.data?.grants ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-heading text-lg text-foreground">Team access</h2>
        <p className="text-sm text-muted-foreground">
          Give someone view-only or assistant access to this Fund. Neither role can see bank, tax ID or identity details, sign, approve, or move money. Assistants prepare drafts for you to send.
        </p>
      </div>

      {q.data?.canManage && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] items-end">
          <Input type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as FundTeamRole)}
            aria-label="Role"
          >
            <option value="fund_viewer">Viewer</option>
            <option value="fund_assistant">Assistant</option>
          </select>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Ends on (optional)" />
          <Button onClick={add} disabled={busy || !email}>Add person</Button>
        </div>
      )}

      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has been added yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {grants.map((g) => (
            <li key={g.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">{g.email}</div>
                <div className="text-xs text-muted-foreground">
                  {fundTeamRoleLabel(g.role)} · {STATUS[g.status] ?? g.status}
                  {!g.claimed && g.status === "active" ? " · not signed in yet" : ""}
                  {g.expiresAt ? ` · ends ${new Date(g.expiresAt).toLocaleDateString()}` : ""}
                  {g.revokeReason ? ` · ${g.revokeReason}` : ""}
                </div>
              </div>
              {q.data?.canManage && g.status !== "revoked" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act(g.id, "change_role", g.role === "fund_viewer" ? "fund_assistant" : "fund_viewer")}
                  >
                    Make {g.role === "fund_viewer" ? "Assistant" : "Viewer"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act(g.id, "revoke")}>Remove</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        No email is sent automatically — let them know to sign in with that email, then open Shared funds.
      </p>
    </section>
  );
}
