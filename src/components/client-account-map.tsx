import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listClientAccountsForAccess, setClientMembership } from "@/lib/access-admin.functions";

/** Every client account a person belongs to, with add/remove for access administrators. */
export function ClientAccountMap({ userId, memberships, managedFunds }: { userId: string; memberships: { id: string; name: string }[]; managedFunds: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const list = useServerFn(listClientAccountsForAccess);
  const set = useServerFn(setClientMembership);
  const clients = useQuery({ queryKey: ["access-client-accounts"], queryFn: () => list() });
  const [pick, setPick] = useState("");
  const [why, setWhy] = useState("");
  const m = useMutation({
    mutationFn: (v: { clientId: string; add: boolean }) => set({ data: { targetUserId: userId, clientId: v.clientId, add: v.add, role: "member", reason: why } }),
    onSuccess: () => { toast.success("Client accounts updated."); setPick(""); qc.invalidateQueries({ queryKey: ["access-profile", userId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mine = new Set(memberships.map((x) => x.id));
  return (
    <div className="space-y-3 text-sm">
      {memberships.length === 0 ? <p className="text-muted-foreground">Not a member of any client account.</p> : (
        <ul className="space-y-1">
          {memberships.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
              <span>{c.name}</span>
              <Button size="sm" variant="ghost" disabled={m.isPending || why.trim().length < 5} onClick={() => m.mutate({ clientId: c.id, add: false })}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      {managedFunds.length ? <p className="text-xs text-muted-foreground">Also reaches clients through managed funds: {managedFunds.map((f) => f.name).join(", ")}.</p> : null}
      <div className="flex flex-wrap gap-2">
        <select aria-label="Client account" className="h-9 min-w-48 rounded-md border bg-background px-2" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Add to client account…</option>
          {(clients.data ?? []).filter((c) => !mine.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button size="sm" disabled={!pick || m.isPending || why.trim().length < 5} onClick={() => m.mutate({ clientId: pick, add: true })}>Add</Button>
      </div>
      <Input placeholder="Reason (required, recorded in the audit log)" value={why} onChange={(e) => setWhy(e.target.value)} />
    </div>
  );
}
