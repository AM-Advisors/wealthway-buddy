import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { accountCheckQueueFn, decideAccountCheckFn } from "@/lib/account-kyc.functions";
import { AmlMatchReview } from "@/components/aml-match-review";
import { KycReviewPanel } from "@/components/kyc-review-panel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const LABEL: Record<string, string> = { not_started: "Not started", pending: "In progress", review: "Needs review", approved: "Approved", declined: "Declined", expired: "ID expired", sent_back: "Sent back" };

/** Harmonious compliance queue for account identity checks (portal access gate). */
export function AccountIdentityQueue({ userId, investorName, investorEmail }: { userId?: string | undefined; investorName?: string | undefined; investorEmail?: string | undefined } = {}) {
  const qc = useQueryClient();
  const list = useServerFn(accountCheckQueueFn);
  const decide = useServerFn(decideAccountCheckFn);
  const q = useQuery({ queryKey: ["account-identity-queue"], queryFn: () => list() });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openMatches, setOpenMatches] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"review" | "all">("review");
  const m = useMutation({
    mutationFn: (v: { checkId: string; action: "approve" | "decline" | "send_back" }) => decide({ data: { ...v, note: notes[v.checkId]?.trim() || null } }),
    onSuccess: () => { toast.success("Decision saved."); qc.invalidateQueries({ queryKey: ["account-identity-queue"] }); qc.invalidateQueries({ queryKey: ["investor-record"] }); qc.invalidateQueries({ queryKey: ["investment-readiness"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = (q.data ?? []).filter((r: any) => (!userId || r.user_id === userId) && (userId ? true : filter === "all" || r.status === "review"));
  const selected = (q.data ?? []).find((r: any) => r.id === selectedId);
  const decisionControls = (r: any) => ["review", "approved", "declined", "expired"].includes(r.status) ? (
    <div className="space-y-2">
      <Textarea rows={2} aria-label={`Review note for ${r.email}`} placeholder="Note (required to decline or send back)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        {r.status === "review" && <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ checkId: r.id, action: "approve" })}>Approve: it's good</Button>}
        {r.status === "review" && <Button size="sm" variant="destructive" disabled={m.isPending} onClick={() => m.mutate({ checkId: r.id, action: "decline" })}>Decline</Button>}
        <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ checkId: r.id, action: "send_back" })}>Ask to verify again</Button>
      </div>
    </div>
  ) : null;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div><CardTitle className="text-base">{userId ? "Identity & compliance screening" : "Account identity checks"}</CardTitle><CardDescription>{userId ? "Review the results, then approve to confirm it's good. You can't decide your own." : "Everyone except Harmonious staff must pass before using the portal. Approve or decline checks marked Needs review. You can't decide your own."}</CardDescription></div>
        {!userId && <div className="flex gap-1"><Button size="sm" variant={filter === "review" ? "default" : "outline"} onClick={() => setFilter("review")}>Needs review</Button><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button></div>}
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : !rows.length ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting.</p> : rows.map((r: any) => {
          const d = r.decision_summary ?? {};
          return (
            <div key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="link" className="h-auto min-w-0 max-w-full justify-start whitespace-normal p-0 text-left" onClick={() => setSelectedId(r.id)} aria-label={`Review identity check for ${investorName || r.email}`}><span className="break-words">{investorName || r.email}</span><ChevronRight className="ml-1 h-4 w-4 shrink-0" /></Button><Badge variant={r.status === "review" ? "destructive" : "outline"}>{LABEL[r.status] ?? r.status}</Badge></div>
              {investorName && investorEmail ? <p className="break-all text-muted-foreground">{investorEmail}</p> : null}
              <p className="text-xs text-muted-foreground">Started {new Date(r.created_at).toLocaleDateString()} · ID {d.document?.type ?? "Not recorded"} {d.document?.country ?? ""}{d.document?.last4 ? ` ••••${d.document.last4}` : ""} · Liveness {d.liveness ?? "Not recorded"} · Face {d.faceMatch ?? "Not recorded"} · Address {d.address ?? "Not recorded"} · AML {d.aml?.status ?? "Not recorded"}{d.aml?.hits ? ` (${d.aml.hits} hit${d.aml.hits > 1 ? "s" : ""})` : ""}</p>
              <Button size="sm" variant="outline" onClick={() => setSelectedId(r.id)}>Review details<ChevronRight className="ml-1 h-4 w-4" /></Button>
              {!!(r.warnings ?? []).length && <ul className="list-disc pl-5 text-xs text-destructive">{r.warnings.slice(0, 6).map((w: string) => <li key={w}>{w}</li>)}</ul>}
              {r.decision_note && <p className="text-xs">Note: {r.decision_note}</p>}
              {(d.aml?.hits ?? 0) > 0 && <Button size="sm" variant="outline" onClick={() => setOpenMatches(openMatches === r.id ? null : r.id)}>{openMatches === r.id ? "Hide possible matches" : `Review ${d.aml.hits} possible match${d.aml.hits > 1 ? "es" : ""}`}</Button>}
              {openMatches === r.id && <AmlMatchReview checkId={r.id} />}
              {decisionControls(r)}
            </div>
          );
        })}
      </CardContent>
      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-5xl p-4 sm:p-6">
          <DialogHeader className="pr-6 text-left">
            <DialogTitle>Identity check review</DialogTitle>
            <DialogDescription className="break-words">{investorName || selected?.email}{investorName && investorEmail ? ` · ${investorEmail}` : ""}</DialogDescription>
          </DialogHeader>
          {selected && <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={selected.status === "review" ? "destructive" : "outline"}>{LABEL[selected.status] ?? selected.status}</Badge><span className="text-xs text-muted-foreground">Updated {new Date(selected.updated_at).toLocaleString()}</span></div>
            {selected.review_details ? <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Original verification evidence</summary><p className="my-3 text-sm text-muted-foreground">Names and email addresses below were captured when this check began. They are historical evidence, not current investor details. The current Harmonious decision is shown above.</p><KycReviewPanel key={selected.id} rd={selected.review_details} checkId={selected.id} /></details> : <p className="text-sm text-muted-foreground">Detailed evidence has not been recorded for this check.</p>}
            {!!selected.warnings?.length && <section><h3 className="mb-2 text-sm font-semibold">Recorded warnings</h3><ul className="list-disc space-y-1 pl-5 text-sm text-destructive">{selected.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></section>}
            {(selected.review_details?.aml?.totalHits ?? selected.decision_summary?.aml?.hits ?? 0) > 0 && <AmlMatchReview key={selected.id} checkId={selected.id} />}
            {selected.decision_note && <p className="break-words text-sm">Decision note: {selected.decision_note}</p>}
            <section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Review decision</h3>{decisionControls(selected)}</section>
          </div>}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
