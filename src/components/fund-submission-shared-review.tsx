/**
 * Fund manager setup submissions shown through the shared administration presentation
 * (requirement rows, review states, Approve & apply / Send back). Compatibility candidate:
 * mounted only in the fictional QA sandbox until a broader migration is approved; the live
 * fund Setup tab keeps its existing screen. Decisions go to the unchanged reviewFundSubmissionFn,
 * which still enforces staff-only review, never the submitter, and a note to send back.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/load-error";
import { RequirementList, ReviewDecisionBar, ReviewStateBadge, reviewBlockedReason } from "@/components/admin-review";
import { DOC_KINDS, SECTION_LABEL, type Section } from "@/components/fund-manager-setup-loader";
import { listFundSubmissionsFn, reviewFundSubmissionFn } from "@/lib/fund-manager-submissions.functions";
import { fromFundSetupSection, type RequirementRow } from "@/lib/admin-review-framework";

const itemLabel = (i: any) => `${SECTION_LABEL[i.section as Section] ?? i.section}${i.doc_kind ? ` · ${DOC_KINDS.find((d) => d[0] === i.doc_kind)?.[1] ?? "Document"}` : ""}`;

export function FundSubmissionSharedReview({ offeringId, viewerId }: { offeringId: string; viewerId?: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listFundSubmissionsFn);
  const review = useServerFn(reviewFundSubmissionFn);
  const q = useQuery({ queryKey: ["fund-submissions", offeringId], queryFn: () => list({ data: { offeringId } }) });
  const m = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "return"; note?: string }) => review({ data: { id: v.id, decision: v.decision, note: v.note ?? null } }),
    onSuccess: (_r, v) => { toast.success(v.decision === "approve" ? "Approved and applied to the fund" : "Sent back to the fund manager"); qc.invalidateQueries({ queryKey: ["fund-submissions", offeringId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (q.isPending) return <Skeleton className="h-24 w-full" />;
  if (q.error) return <LoadError error={q.error} what="Fund submissions" onRetry={() => q.refetch()} />;
  const d = q.data as any;
  const items = (d.items as any[]) ?? [];
  const latest = (s: Section) => items.find((i) => i.section === s && i.status !== "withdrawn");
  const rows: RequirementRow[] = (Object.keys(SECTION_LABEL) as Section[]).map((s) => ({ key: s, label: SECTION_LABEL[s], state: fromFundSetupSection(latest(s)?.status, s === "bank" && !!d.onFile?.bankOnFile), note: latest(s)?.status === "returned" ? `Harmonious asked: ${latest(s)?.review_note ?? "please review and resubmit."}` : null }));
  const shown = items.filter((i) => i.status !== "withdrawn");
  return (
    <div className="space-y-4">
      <section className="space-y-2"><h4 className="font-semibold">Setup sections</h4><RequirementList audience="staff" rows={rows} /></section>
      <section className="space-y-2"><h4 className="font-semibold">Submissions to review</h4>
        <ul className="space-y-2">{shown.map((i) => (
          <li key={i.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-base font-medium">{itemLabel(i)}</span><span className="flex items-center gap-2 text-sm text-muted-foreground">{new Date(i.submitted_at).toLocaleDateString()} <ReviewStateBadge engine="fund_manager_submission" status={i.status} /></span></div>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{Object.entries(i.payload ?? {}).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{k}:</dt><dd>{String(v)}</dd></div>)}</dl>
            {i.status === "returned" && i.review_note && <p className="text-sm text-destructive">Harmonious asked: {i.review_note}</p>}
            {i.status === "submitted" && <ReviewDecisionBar blockedReason={reviewBlockedReason(!!viewerId && i.submitted_by === viewerId, !!d.isStaff)} pending={m.isPending}
              approveTitle="Approve and apply this submission?" approveDescription="The values are applied to the fund through the same setup services staff use, with the usual history."
              onApprove={() => m.mutate({ id: i.id, decision: "approve" })} onSendBack={(note) => m.mutate({ id: i.id, decision: "return", note })} recipient="the fund manager" />}
          </li>))}</ul>
      </section>
    </div>
  );
}
