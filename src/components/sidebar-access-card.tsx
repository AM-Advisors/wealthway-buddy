import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { grantNavItemFn, navGrantsFn, revokeNavItemFn } from "@/lib/billing-records.functions";
import { grantableItems } from "@/lib/ops-nav-registry";

/** Super Admins give one person individual extra sidebar items (view access to that screen), with a logged reason. */
export function SidebarAccessCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(navGrantsFn);
  const q = useQuery({ queryKey: ["nav-grants", userId], queryFn: () => load({ data: { userId } }), retry: false });
  const grant = useServerFn(grantNavItemFn);
  const revoke = useServerFn(revokeNavItemFn);
  const items = useMemo(() => grantableItems(), []);
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("");
  if (!q.data) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["nav-grants", userId] });
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const areas = [...new Set(items.map((i) => i.areaTitle))];
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div><h2 className="text-lg">Sidebar access</h2><p className="text-sm text-muted-foreground">Extra items beyond this person's role. Each grant opens view access to that screen; money, tax and administration keep their own approvals. The change shows after they next sign in or refresh.</p></div>
      <ul className="space-y-1 text-sm">
        {(q.data.grants as any[]).map((g) => (
          <li key={g.id} className="flex items-center gap-2"><span className="font-medium">{g.item_title}</span><span className="text-muted-foreground">· {g.reason}</span>
            {q.data.canGrant && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => run(() => revoke({ data: { grantId: g.id } }), "Removed")}>Remove</Button>}</li>
        ))}
        {!q.data.grants.length && <li className="text-muted-foreground">No extra items.</li>}
      </ul>
      {q.data.canGrant && (
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!url) return; run(() => grant({ data: { userId, url, reason } }), "Item added"); setUrl(""); setReason(""); }}>
          <select className="h-9 min-w-56 rounded-md border bg-background px-2 text-sm" value={url} onChange={(e) => setUrl(e.target.value)}>
            <option value="">Choose a screen…</option>
            {areas.map((a) => <optgroup key={a} label={a}>{items.filter((i) => i.areaTitle === a).map((i) => <option key={i.url} value={i.url}>{i.title}</option>)}</optgroup>)}
          </select>
          <Input className="max-w-xs" placeholder="Reason (logged)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" size="sm" disabled={!url || reason.trim().length < 3}>Give access</Button>
        </form>
      )}
    </section>
  );
}
