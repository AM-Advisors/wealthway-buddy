import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Link, useRouterState } from "@tanstack/react-router";
import { myHiddenTabsFn, setTabAccessFn, staffTabAccessFn } from "@/lib/client-tab-access.functions";
import { tabForPath } from "@/lib/client-tab-access";

/** Staff-only: switch each client area on or off. Off hides it from the client completely. */
export function ClientTabAccessPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(staffTabAccessFn);
  const save = useServerFn(setTabAccessFn);
  const q = useQuery({ queryKey: ["client-tab-access", clientId], queryFn: () => load({ data: { clientId } }) });
  const m = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) => save({ data: { clientId, ...v } }),
    onSuccess: (_r, v) => { toast.success(v.enabled ? "Turned on. The client can now see it." : "Turned off. The client no longer sees it."); qc.invalidateQueries({ queryKey: ["client-tab-access", clientId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <p className="text-base text-muted-foreground">Loading access…</p>;
  if (q.error) return <p className="text-base text-destructive">{(q.error as Error).message}</p>;
  const d = q.data as any;
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-heading text-xl font-semibold">What this client can see</h2>
        <p className="text-base text-muted-foreground">Turn an area off and it disappears from the client's menu and pages. Nothing is deleted; turning it back on brings it back.</p>
      </div>
      <ul className="divide-y">
        {(d.tabs as any[]).map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-base font-medium">{t.label}</p>
              <p className="text-sm text-muted-foreground">
                {t.enabled ? "Visible to the client" : "Not included · hidden"}
                {t.overridden ? ` · set by staff (default: ${t.defaultEnabled ? "on" : "off"})` : " · follows their services"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={t.enabled ? "default" : "outline"}>{t.enabled ? "On" : "Off"}</Badge>
              <Switch aria-label={`${t.label} access`} checked={t.enabled} disabled={m.isPending} onCheckedChange={(v) => m.mutate({ key: t.key, enabled: v })} />
            </div>
          </li>
        ))}
      </ul>
      {(d.events as any[]).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Recent changes</h3>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            {(d.events as any[]).map((e, i) => <li key={i}>{new Date(e.created_at).toLocaleString()} · {e.actor} turned {e.label} {e.enabled ? "on" : "off"}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Overview: how this client connects to its entities, funds, companies and people. Each box opens its tab. */
export function ClientRelationshipMap({ record, goTo }: { record: any; goTo: (tab: string) => void }) {
  const boxes = [
    { tab: "services", label: "Agreements & services", value: "MSA, SOWs, quotes" },
    { tab: "funds", label: "Funds & SPVs", value: String(record.fundCount ?? 0) },
    { tab: "companies", label: "Companies", value: String(record.companyCount ?? 0) },
    { tab: "contacts", label: "People & team", value: record.contact ? `Primary: ${record.contact}` : "Add people" },
    { tab: "documents", label: "Documents", value: "All files" },
    { tab: "access", label: "Client access", value: "What they see" },
  ];
  return (
    <section aria-label="Relationship map" className="rounded-lg border bg-card p-5">
      <h2 className="font-heading text-lg font-semibold">Relationship</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {boxes.map((b) => (
          <button key={b.tab} type="button" onClick={() => goTo(b.tab)} className="rounded-md border p-4 text-left transition-colors hover:bg-accent">
            <p className="text-sm text-muted-foreground">{b.label}</p>
            <p className="text-lg font-semibold">{b.value}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Client pages: an area switched off for this client shows a plain notice instead of the page. */
export function TabAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const fn = useServerFn(myHiddenTabsFn);
  const q = useQuery({ queryKey: ["my-hidden-tabs"], queryFn: () => fn(), staleTime: 60_000 });
  const key = tabForPath(pathname);
  if (key && (q.data ?? []).includes(key)) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border bg-card p-8 text-center">
        <h1 className="font-heading text-xl font-semibold">This area isn't part of your services</h1>
        <p className="mt-2 text-base text-muted-foreground">Contact your Harmonious team if you'd like it added.</p>
        <Link to="/client/home" className="mt-4 inline-block text-primary underline">Back to home</Link>
      </div>
    );
  }
  return <>{children}</>;
}
