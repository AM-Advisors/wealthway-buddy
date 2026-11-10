import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { accountCheckQueueFn, decideAccountCheckFn, useIdNameForCheckFn, addOutsideIdentityReportFn, outsideReportLinkFn } from "@/lib/account-kyc.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const idName = useServerFn(useIdNameForCheckFn);
  const nameM = useMutation({
    mutationFn: (checkId: string) => idName({ data: { checkId } }),
    onSuccess: () => { toast.success("Legal name updated to the name on the ID."); qc.invalidateQueries({ queryKey: ["account-identity-queue"] }); qc.invalidateQueries({ queryKey: ["investor-record"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const extras = (r: any) => (
    <>
      {r.idFullName && r.personId && norm(r.idFullName) !== norm(r.personLegalName) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-xs">
          <span>Name on ID: <strong>{r.idFullName}</strong> · Recorded: {r.personLegalName || "None"}</span>
          <Button size="sm" variant="outline" disabled={nameM.isPending} onClick={() => nameM.mutate(r.id)}>Use ID name</Button>
        </div>
      )}
      {!!r.samePerson?.length && (
        <p className="rounded-md bg-muted p-2 text-xs">Possibly the same verified person as {r.samePerson.map((o: any) => o.email).join(", ")} (same date of birth and ID number). Staff only. Accounts stay separate.</p>
      )}
    </>
  );
  const reportLink = useServerFn(outsideReportLinkFn);
  const openReport = async (checkId: string) => {
    const w = window.open("", "_blank");
    try { const { url } = await reportLink({ data: { checkId } }); if (w) w.location.href = url; else window.location.href = url; }
    catch (e) { w?.close(); toast.error((e as Error).message); }
  };
  const outsideBlock = (r: any) => {
    const o = r.review_details?.outsideReport;
    if (!o) return null;
    return (
      <div className="space-y-1 rounded-md bg-muted p-2 text-xs">
        <p><strong>Outside verification report</strong> · {o.fileName} · report dated {o.reportDate}</p>
        {o.note ? <p className="break-words">What it shows: {o.note}</p> : null}
        <p className="text-muted-foreground">Approving confirms identity only. Screening stays as recorded. Someone other than the person who added the report should approve it.</p>
        <Button size="sm" variant="outline" onClick={() => void openReport(r.id)}>Open report</Button>
      </div>
    );
  };
  const [addOpen, setAddOpen] = useState(false);
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
        <div className="flex flex-wrap gap-1">
          {!userId && <><Button size="sm" variant={filter === "review" ? "default" : "outline"} onClick={() => setFilter("review")}>Needs review</Button><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button></>}
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>Add outside report</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : !rows.length ? <p className="py-6 text-center text-sm text-muted-foreground">{userId ? "No identity checks recorded for this investor yet. Checks appear here once the investor starts verification." : "Nothing waiting."}</p> : rows.map((r: any) => {
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
              {outsideBlock(r)}
              {extras(r)}
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
            {selected.review_details?.outsideReport ? outsideBlock(selected) : selected.review_details ? <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Original verification evidence</summary><p className="my-3 text-sm text-muted-foreground">Names and email addresses below were captured when this check began. They are historical evidence, not current investor details. The current Harmonious decision is shown above.</p><KycReviewPanel key={selected.id} rd={selected.review_details} checkId={selected.id} /></details> : <p className="text-sm text-muted-foreground">Detailed evidence has not been recorded for this check.</p>}
            {!!selected.warnings?.length && <section><h3 className="mb-2 text-sm font-semibold">Recorded warnings</h3><ul className="list-disc space-y-1 pl-5 text-sm text-destructive">{selected.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></section>}
            {(selected.review_details?.aml?.totalHits ?? selected.decision_summary?.aml?.hits ?? 0) > 0 && <AmlMatchReview key={selected.id} checkId={selected.id} />}
            {selected.decision_note && <p className="break-words text-sm">Decision note: {selected.decision_note}</p>}
            <section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Review decision</h3>{decisionControls(selected)}</section>
          </div>}
        </DialogContent>
      </Dialog>
      {addOpen && <OutsideReportDialog defaultEmail={investorEmail ?? ""} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); setFilter("review"); qc.invalidateQueries({ queryKey: ["account-identity-queue"] }); }} />}
    </Card>
  );
}

/** Staff: file a completed identity report from another provider; it lands in Needs review for a second person to approve. */
function OutsideReportDialog({ defaultEmail, onClose, onAdded }: { defaultEmail: string; onClose: () => void; onAdded: () => void }) {
  const add = useServerFn(addOutsideIdentityReportFn);
  const [email, setEmail] = useState(defaultEmail);
  const [reportDate, setReportDate] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose the report file.");
      if (file.size > 15 * 1024 * 1024) throw new Error("The report must be 15 MB or smaller.");
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const contentType = (["application/pdf", "image/png", "image/jpeg"].includes(file.type) ? file.type : "application/pdf") as "application/pdf" | "image/png" | "image/jpeg";
      return add({ data: { email: email.trim(), fileName: file.name, contentType, contentBase64: btoa(bin), reportDate, note: note.trim() } });
    },
    onSuccess: () => { toast.success("Report added. It's waiting in Needs review."); onAdded(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add outside verification report</DialogTitle>
          <DialogDescription>Use this when someone already passed an identity check elsewhere. The report goes to Needs review; approving it confirms identity only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="or-email">Their login email</Label><Input id="or-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
          <div className="space-y-1"><Label htmlFor="or-date">Date on the report</Label><Input id="or-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="or-file">Report (PDF or image, up to 15 MB)</Label><Input id="or-file" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="space-y-1"><Label htmlFor="or-note">What the report shows</Label><Textarea id="or-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Government ID and selfie match, verified on this date, result: passed" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={m.isPending || !email.trim() || !reportDate || !file || note.trim().length < 5} onClick={() => m.mutate()}>{m.isPending ? "Adding…" : "Add for review"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
