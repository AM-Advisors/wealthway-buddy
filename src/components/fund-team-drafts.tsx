import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listFundDraftsForReview,
  listMyFundDrafts,
  reviewFundDraft,
  saveFundDraft,
  withdrawFundDraft,
} from "@/lib/fund-team-drafts.functions";

type Kind = "investor_invitation" | "investor_message" | "document_send";
const KIND_LABEL: Record<string, string> = {
  investor_invitation: "Investor invitation",
  investor_message: "Investor message",
  document_send: "Document to send",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "With manager",
  used: "Used by manager",
  returned: "Returned for changes",
  withdrawn: "Withdrawn",
};

/** Assistant view: prepare drafts for the Fund Manager to review and send. */
export function AssistantDrafts({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyFundDrafts);
  const saveFn = useServerFn(saveFundDraft);
  const withdrawFn = useServerFn(withdrawFundDraft);
  const key = ["my-fund-drafts", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { fundId } }) });
  const empty = { id: null as string | null, kind: "investor_invitation" as Kind, title: "", recipientEmail: "", body: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function save(submit: boolean) {
    setBusy(true);
    try {
      await saveFn({ data: { fundId, draftId: f.id, kind: f.kind, title: f.title, recipientEmail: f.recipientEmail, body: f.body, submit } });
      toast.success(submit ? "Sent to the manager for review" : "Draft saved");
      setF(empty);
      qc.invalidateQueries({ queryKey: key });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-heading text-lg text-foreground">Prepare drafts</h2>
        <p className="text-sm text-muted-foreground">
          Draft invitations, messages and document sends. Nothing goes out until the Fund Manager reviews and sends it.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}
          aria-label="Draft type"
        >
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <Input placeholder="Recipient email (optional)" value={f.recipientEmail} onChange={(e) => setF({ ...f, recipientEmail: e.target.value })} />
        <Input className="sm:col-span-2" placeholder="Title or subject" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea
          className="sm:col-span-2 min-h-32"
          placeholder={f.kind === "document_send" ? "Which document, who it's for and any note for the investor" : "Message text"}
          value={f.body}
          onChange={(e) => setF({ ...f, body: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy || !f.title} onClick={() => save(false)}>Save draft</Button>
        <Button disabled={busy || !f.title} onClick={() => save(true)}>Send to manager</Button>
        {f.id && <Button variant="ghost" onClick={() => setF(empty)}>Cancel edit</Button>}
      </div>

      <ul className="divide-y divide-border">
        {(q.data?.drafts ?? []).map((d) => (
          <li key={d.id} className="py-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{d.title}</div>
              <div className="text-xs text-muted-foreground">
                {KIND_LABEL[d.kind]} · {STATUS_LABEL[d.status] ?? d.status}
                {d.reviewNote ? ` · Manager note: ${d.reviewNote}` : ""}
              </div>
            </div>
            {["draft", "returned", "submitted"].includes(d.status) && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setF({ id: d.id, kind: d.kind, title: d.title, recipientEmail: d.recipientEmail, body: d.body })}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await withdrawFn({ data: { draftId: d.id } });
                    qc.invalidateQueries({ queryKey: key });
                  }}
                >
                  Withdraw
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Manager view: review assistant drafts, then send through the usual screens. */
export function ManagerDraftReview({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listFundDraftsForReview);
  const reviewFn = useServerFn(reviewFundDraft);
  const key = ["fund-drafts-review", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { fundId } }) });
  const drafts = q.data?.drafts ?? [];
  if (drafts.length === 0) return null;

  async function decide(id: string, decision: "used" | "returned") {
    const note = decision === "returned" ? window.prompt("What should the assistant change?") ?? "" : undefined;
    if (decision === "returned" && !note?.trim()) return;
    try {
      await reviewFn({ data: { draftId: id, decision, note } });
      qc.invalidateQueries({ queryKey: key });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update");
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-3">
      <h2 className="font-heading text-lg text-foreground">Drafts from assistants</h2>
      <p className="text-sm text-muted-foreground">Copy a draft into the usual invite, message or document screen to send it, then mark it used.</p>
      <ul className="divide-y divide-border">
        {drafts.map((d) => (
          <li key={d.id} className="py-3 space-y-1">
            <div className="flex flex-wrap justify-between gap-2">
              <div className="text-sm font-medium text-foreground">
                {d.title} <span className="text-xs text-muted-foreground">· {KIND_LABEL[d.kind]} · {d.author} · {STATUS_LABEL[d.status]}</span>
              </div>
              {d.status === "submitted" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(d.body)}>Copy text</Button>
                  <Button size="sm" onClick={() => decide(d.id, "used")}>Mark used</Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(d.id, "returned")}>Return</Button>
                </div>
              )}
            </div>
            {d.recipientEmail && <div className="text-xs text-muted-foreground">To: {d.recipientEmail}</div>}
            <p className="whitespace-pre-wrap text-sm text-foreground">{d.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
