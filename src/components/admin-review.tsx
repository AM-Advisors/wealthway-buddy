/**
 * Shared review presentation for funds/SPVs and foundations: state badges, requirement rows and
 * the Approve / Send back decision pair. Purely presentational. Every decision still goes to the
 * resource's own server action, which enforces who may decide; these controls only render what
 * the caller already knows the viewer may do.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ApprovalButton } from "@/components/approval-button";
import {
  FOLLOW_UP_NOTE, REVIEW_ACTIONS, REVIEW_STATE_LABEL, REVIEW_STATE_TONE, requirementBadge, reviewState,
  type Audience, type RequirementRow, type ReviewEngine, type ReviewState,
} from "@/lib/admin-review-framework";

export function ReviewStateBadge({ state, engine, status, prefix }: { state?: ReviewState | null; engine?: ReviewEngine; status?: string | null; prefix?: string }) {
  const s = state ?? (engine ? reviewState(engine, status) : null);
  if (!s) return <Badge variant="outline">Status not recorded</Badge>;
  return <Badge variant={REVIEW_STATE_TONE[s]}>{prefix ? `${prefix} · ` : ""}{REVIEW_STATE_LABEL[s]}</Badge>;
}

/** Requirement rows with one status badge each; requirement calculation stays with each engine. */
export function RequirementList({ rows, audience, empty = "Nothing needed.", renderExtra }: { rows: RequirementRow[]; audience: Audience; empty?: string; renderExtra?: (row: RequirementRow) => React.ReactNode }) {
  if (!rows.length) return <p className="text-base text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">{rows.map((r) => {
      const b = requirementBadge(r.state, audience);
      return (
        <li key={r.key} className="rounded-md border p-3 text-base">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{r.label}</span><Badge variant={b.tone}>{b.label}</Badge></div>
          {(r.note || r.source) && <p className="text-sm text-muted-foreground">{[r.note, r.source ? `Source: ${r.source}` : null].filter(Boolean).join(" · ")}</p>}
          {audience === "client" && (r.state === "exception" || r.state === "follow_up") && <p className="text-sm">{FOLLOW_UP_NOTE}</p>}
          {r.items && r.items.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm">{r.items.map((i) => <li key={i}>{i}</li>)}</ul>}
          {renderExtra?.(r)}
        </li>);
    })}</ul>
  );
}

/** Send back with a required note, in a dialog instead of a browser prompt. */
export function SendBackButton({ onSendBack, disabled, label = REVIEW_ACTIONS.sendBack, question = "What needs to change?", recipient = "the sender" }: { onSendBack: (note: string) => void; disabled?: boolean; label?: string; question?: string; recipient?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const ok = note.trim().length >= 3;
  return <>
    <Button size="sm" variant="outline" className="min-h-11 text-base" disabled={disabled} onClick={() => setOpen(true)}>{label}</Button>
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">{label}</AlertDialogTitle>
          <AlertDialogDescription className="text-base">Your note is shown to {recipient}. Nothing on record changes.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1"><Label htmlFor="send-back-note">{question}</Label><Textarea id="send-back-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <AlertDialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11 text-base" onClick={() => setOpen(false)}>Go back</Button>
          <Button className="min-h-11 text-base" disabled={!ok || disabled} onClick={() => { onSendBack(note.trim()); setOpen(false); setNote(""); }}>{label}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

/**
 * The familiar decision pair. `blockedReason` is shown instead when the caller knows the viewer
 * can't decide (own submission, view-only role); the server still rechecks on every decision.
 */
export function ReviewDecisionBar({ blockedReason, approveLabel = REVIEW_ACTIONS.apply, approveTitle, approveDescription, onApprove, onSendBack, pending, approveDisabled, recipient }: {
  blockedReason?: string | null | undefined; approveLabel?: string; approveTitle: string; approveDescription: string; onApprove: () => void; onSendBack: (note: string) => void; pending?: boolean | undefined; approveDisabled?: boolean | undefined; recipient?: string | undefined;
}) {
  if (blockedReason) return <p className="text-sm text-muted-foreground">{blockedReason}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      <ApprovalButton size="sm" disabled={!!(pending || approveDisabled)} title={approveTitle} description={approveDescription} confirmLabel={approveLabel} undoLabel="Undo" waitingTitle="Decision waiting to send" waitingNote="You have 5 seconds to undo. Nothing has been decided yet." historyNote="Decisions stay in the history." onApprove={onApprove}>{approveLabel}</ApprovalButton>
      <SendBackButton disabled={!!pending} onSendBack={onSendBack} {...(recipient ? { recipient } : {})} />
    </div>
  );
}

/** Shared "who can decide" sentence for maker-checker reviews. */
export const reviewBlockedReason = (own: boolean, canReview: boolean) =>
  own ? "You sent this, so someone else must review it." : !canReview ? "Your role can view but not decide." : null;
