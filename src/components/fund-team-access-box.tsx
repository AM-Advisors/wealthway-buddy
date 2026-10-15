import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeFundTeamAccess, grantFundTeamAccess, listFundTeamGrants, listGrantableFunds } from "@/lib/fund-team-access.functions";
import { fundTeamRoleLabel, fundTeamScopeLabel, type FundTeamRole, type FundTeamScope } from "@/lib/fund-team-access";

const STATUS: Record<string, string> = {
  active: "Active",
  revoked: "Removed",
  expired: "Expired",
  needs_review: "Paused - granting manager left",
};

type Target = { kind: "this" } | { kind: "all" } | { kind: "pick"; ids: string[] };

export function FundTeamAccessBox({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listFundTeamGrants);
  const grant = useServerFn(grantFundTeamAccess);
  const change = useServerFn(changeFundTeamAccess);
  const grantable = useServerFn(listGrantableFunds);
  const key = ["fund-team-grants", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { fundId } }) });
  const fundsQ = useQuery({ queryKey: ["grantable-funds"], queryFn: () => grantable({}) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FundTeamRole>("fund_viewer");
  const [expires, setExpires] = useState("");
  const [target, setTarget] = useState<Target>({ kind: "this" });
  const [busy, setBusy] = useState(false);

  const funds = fundsQ.data?.funds ?? [];
  const isStaff = !!fundsQ.data?.staff;
  const otherFunds = funds.filter((f) => f.id !== fundId);

  async function add() {
    setBusy(true);
    try {
      const payload: any = { fundId, email, role, expiresAt: expires ? new Date(expires).toISOString() : null };
      if (target.kind === "all") payload.scope = isStaff ? "all_funds" : "all_managed";
      if (target.kind === "pick") payload.fundIds = [fundId, ...target.ids];
      const res = await grant({ data: payload });
      const failed = (res?.results ?? []).filter((r: any) => !r.ok);
      if (failed.length) toast.warning(`Added to ${(res?.results ?? []).length - failed.length} fund(s); ${failed.length} skipped: ${failed[0].error}`);
      else toast.success("Access granted");
      setEmail("");
      setTarget({ kind: "this" });
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
        <div className="space-y-2">
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
            <Button onClick={add} disabled={busy || !email || (target.kind === "pick" && target.ids.length === 0)}>Add person</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Add to:</span>
            <label className="flex items-center gap-1">
              <input type="radio" checked={target.kind === "this"} onChange={() => setTarget({ kind: "this" })} /> This fund
            </label>
            {otherFunds.length > 0 && (
              <label className="flex items-center gap-1">
                <input type="radio" checked={target.kind === "pick"} onChange={() => setTarget({ kind: "pick", ids: [] })} /> Choose funds
              </label>
            )}
            {(isStaff || otherFunds.length > 0) && (
              <label className="flex items-center gap-1">
                <input type="radio" checked={target.kind === "all"} onChange={() => setTarget({ kind: "all" })} /> {isStaff ? "All funds" : "All my funds"}
              </label>
            )}
          </div>
          {target.kind === "pick" && (
            <div className="max-h-40 overflow-auto rounded-md border border-border p-2 grid gap-1 sm:grid-cols-2">
              {otherFunds.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={target.ids.includes(f.id)}
                    onChange={(e) =>
                      setTarget({ kind: "pick", ids: e.target.checked ? [...target.ids, f.id] : target.ids.filter((x) => x !== f.id) })
                    }
                  />
                  {f.name}
                </label>
              ))}
            </div>
          )}
          {target.kind === "all" && (
            <p className="text-xs text-muted-foreground">
              {isStaff ? "Covers every fund on the platform, including ones added later." : "Covers every fund you manage, including ones added later."}
            </p>
          )}
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
                  {fundTeamRoleLabel(g.role)} · {fundTeamScopeLabel((g.scope as FundTeamScope) ?? "fund")} · {STATUS[g.status] ?? g.status}
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
        No email is sent automatically - let them know to sign in with that email, then open Shared funds.
      </p>
    </section>
  );
}
