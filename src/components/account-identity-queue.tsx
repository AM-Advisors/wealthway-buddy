import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { accountCheckQueueFn, decideAccountCheckFn } from "@/lib/account-kyc.functions";

const LABEL: Record<string, string> = { not_started: "Not started", pending: "In progress", review: "Needs review", approved: "Approved", declined: "Declined", expired: "ID expired", sent_back: "Sent back" };

/** Harmonious compliance queue for account identity checks (portal access gate). */
export function AccountIdentityQueue() {
  const qc = useQueryClient();
  const list = useServerFn(accountCheckQueueFn);
  const decide = useServerFn(decideAccountCheckFn);
  const q = useQuery({ queryKey: ["account-identity-queue"], queryFn: () => list() });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"review" | "all">("review");
  const m = useMutation({
    mutationFn: (v: { checkId: string; action: "approve" | "decline" | "send_back" }) => decide({ data: { ...v, note: notes[v.checkId]?.trim() || null } }),
    onSuccess: () => { toast.success("Decision saved."); qc.invalidateQueries({ queryKey: ["account-identity-queue"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = (q.data ?? []).filter((r: any) => filter === "all" || r.status === "review");
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div><CardTitle className="text-base">Account identity checks</CardTitle><CardDescription>Everyone except Harmonious staff must pass before using the portal. Approve or decline checks marked Needs review. You can't decide your own.</CardDescription></div>
        <div className="flex gap-1"><Button size="sm" variant={filter === "review" ? "default" : "outline"} onClick={() => setFilter("review")}>Needs review</Button><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button></div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : !rows.length ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting.</p> : rows.map((r: any) => {
          const d = r.decision_summary ?? {};
          return (
            <div key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{r.email}</span><Badge variant={r.status === "review" ? "destructive" : "outline"}>{LABEL[r.status] ?? r.status}</Badge></div>
              <p className="text-xs text-muted-foreground">Started {new Date(r.created_at).toLocaleDateString()} · ID {d.document?.type ?? "-"} {d.document?.country ?? ""}{d.document?.last4 ? ` ••••${d.document.last4}` : ""} · Liveness {d.liveness ?? "-"} · Face {d.faceMatch ?? "-"} · Address {d.address ?? "-"} · AML {d.aml?.status ?? "-"}{d.aml?.hits ? ` (${d.aml.hits} hit${d.aml.hits > 1 ? "s" : ""})` : ""}</p>
              {!!(r.warnings ?? []).length && <ul className="list-disc pl-5 text-xs text-destructive">{r.warnings.slice(0, 6).map((w: string) => <li key={w}>{w}</li>)}</ul>}
              {r.decision_note && <p className="text-xs">Note: {r.decision_note}</p>}
              {["review", "approved", "declined", "expired"].includes(r.status) && (
                <div className="space-y-2">
                  <Textarea rows={2} placeholder="Note (required to decline or send back)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    {r.status === "review" && <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ checkId: r.id, action: "approve" })}>Approve</Button>}
                    {r.status === "review" && <Button size="sm" variant="destructive" disabled={m.isPending} onClick={() => m.mutate({ checkId: r.id, action: "decline" })}>Decline</Button>}
                    <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ checkId: r.id, action: "send_back" })}>Ask to verify again</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
