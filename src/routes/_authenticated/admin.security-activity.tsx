import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, RefreshCw } from "lucide-react";
import { decideMfaReset, listSecurityActivity, requestMfaReset } from "@/lib/account-security.functions";

export const Route = createFileRoute("/_authenticated/admin/security-activity")({
  head: () => ({
    meta: [
      { title: "Security Activity | Harmonious Admin" },
      { name: "description", content: "Sign-ins, page views and sensitive actions with IP address, location and device for every user." },
      { property: "og:title", content: "Security Activity | Harmonious Admin" },
      { property: "og:description", content: "Account security activity with IP and location." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityActivityPage,
});

function SecurityActivityPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSecurityActivity);
  const request = useServerFn(requestMfaReset);
  const decide = useServerFn(decideMfaReset);
  const [f, setF] = useState({ email: "", ip: "", country: "", eventType: "", sessionId: "" });
  const [page, setPage] = useState(0);
  const [reset, setReset] = useState({ email: "", reason: "", identityCheck: "" });
  const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["security-activity", filters, page],
    queryFn: () => list({ data: { ...filters, page } }),
  });

  if (error) return <div className="p-6"><p className="text-sm text-destructive">Security activity could not be loaded. Your account must have administrator access.</p><Button variant="outline" className="mt-3" onClick={() => void refetch()}>Try again</Button></div>;

  function exportEvidence() {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), filters, page, totalMatchingEvents: data.total, events: data.rows }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harmonious-security-evidence-page-${page + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-heading text-2xl">Security activity</h1><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw className="mr-2 size-4" />Refresh</Button><Button variant="outline" size="sm" disabled={!data?.rows.length} onClick={exportEvidence}><Download className="mr-2 size-4" />Export this page</Button></div></div>
      <Card>
        <CardContent className="grid gap-2 pt-6 sm:grid-cols-3">
          <Input placeholder="Email" value={f.email} onChange={(e) => { setPage(0); setF({ ...f, email: e.target.value }); }} />
          <Input placeholder="IP address" value={f.ip} onChange={(e) => { setPage(0); setF({ ...f, ip: e.target.value }); }} />
          <Input placeholder="Country (US)" value={f.country} onChange={(e) => { setPage(0); setF({ ...f, country: e.target.value }); }} />
          <select className="rounded-md border bg-background px-2 text-sm" value={f.eventType} onChange={(e) => { setPage(0); setF({ ...f, eventType: e.target.value }); }}>
            <option value="">All events</option>
            {["sign_in", "sign_out", "page_view", "client_error", "sensitive_action", "mfa_verified", "mfa_failed", "mfa_enrolled", "mfa_removed", "recovery_code_used", "session_timeout"].map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
          <Input aria-label="Session ID" placeholder="Session ID" value={f.sessionId} onChange={(e) => { setPage(0); setF({ ...f, sessionId: e.target.value }); }} />
          <p className="self-center text-sm text-muted-foreground">{isPending ? "Loading events…" : `${data?.total ?? 0} events`}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="p-2">When</th><th>User</th><th>Event</th><th>Page / action</th><th>Session / device</th><th>IP</th><th>Location</th><th>Precise</th></tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.email ?? r.user_id?.slice(0, 8) ?? "-"}</td>
                  <td><Badge variant="outline">{r.event_type.replace(/_/g, " ")}</Badge></td>
                  <td className="min-w-40 max-w-[220px] break-words">{r.action ?? "-"}<div className="text-xs text-muted-foreground">{r.path}</div></td>
                  <td className="min-w-40 max-w-64 break-words"><Button variant="link" size="sm" className="h-auto max-w-full whitespace-normal break-all p-0 text-xs" disabled={!r.session_id} onClick={() => { setPage(0); setF({ ...f, sessionId: r.session_id }); }}>{r.session_id ?? "Not recorded"}</Button><div className="mt-1 text-xs text-muted-foreground">{r.user_agent ?? "Device not recorded"}</div></td>
                  <td>{r.ip ?? "-"}</td>
                  <td>{[r.city, r.region, r.country].filter(Boolean).join(", ") || "-"}</td>
                  <td>
                    {r.lat != null ? (
                      <a className="underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=15/${r.lat}/${r.lng}`}>
                        {r.lat.toFixed(4)}, {r.lng.toFixed(4)} (±{Math.round(r.accuracy_m ?? 0)}m)
                      </a>
                    ) : r.gps_declined ? "Declined" : "-"}
                  </td>
                </tr>
              ))}
              {!isPending && !data?.rows.length && <tr><td colSpan={8} className="p-4 text-muted-foreground">No recorded events match these filters.</td></tr>}
            </tbody>
          </table>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * 50 >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-heading text-lg">Two-step sign-in resets</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Confirm the person's identity first. One administrator approval removes their methods; every reset is logged.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="User email" value={reset.email} onChange={(e) => setReset({ ...reset, email: e.target.value })} />
            <Input placeholder="Reason" value={reset.reason} onChange={(e) => setReset({ ...reset, reason: e.target.value })} />
            <Input placeholder="How identity was confirmed" value={reset.identityCheck} onChange={(e) => setReset({ ...reset, identityCheck: e.target.value })} />
          </div>
          <Button size="sm" onClick={async () => {
            try { await request({ data: reset }); toast.success("Reset requested"); setReset({ email: "", reason: "", identityCheck: "" }); void qc.invalidateQueries({ queryKey: ["security-activity"] }); }
            catch (e) { toast.error((e as Error).message); }
          }}>Request reset</Button>
          {(data?.resets ?? []).map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">{r.target_email} <Badge variant="outline">{r.status}</Badge></p>
                <p className="text-xs text-muted-foreground">{r.reason} · identity: {r.identity_check}{r.decision_reason ? ` · decision: ${r.decision_reason}` : ""}</p>
              </div>
              {r.canDecide && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => { try { await decide({ data: { id: r.id, approve: true } }); toast.success("Approved"); void qc.invalidateQueries({ queryKey: ["security-activity"] }); } catch (e) { toast.error((e as Error).message); } }}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    const reason = window.prompt("Reason for declining");
                    if (!reason) return;
                    try { await decide({ data: { id: r.id, approve: false, reason } }); void qc.invalidateQueries({ queryKey: ["security-activity"] }); } catch (e) { toast.error((e as Error).message); }
                  }}>Decline</Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
