import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";

import { getApprovalsInbox } from "@/lib/ops-work-queue.functions";
import { getApprovalQueue } from "@/lib/application-approval.functions";

/** Shared query so the menu count, home banner and inbox page agree. */
export function useApprovalsInbox(enabled = true) {
  const load = useServerFn(getApprovalsInbox);
  return useQuery({ queryKey: ["approvals-inbox"], queryFn: () => load(), enabled, refetchInterval: 60_000, staleTime: 30_000, retry: false });
}

function Banner({ count, stalled, to, label }: { count: number; stalled: number; to: string; label: string }) {
  if (!count) return null;
  return (
    <Link to={to as never} className="mb-6 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-4 hover:bg-primary/10">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{count}</div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{stalled ? `${stalled} waiting 3+ days. ` : ""}Oldest first, all in one list.</p>
      </div>
      <span className="flex items-center gap-1 text-sm font-medium text-primary">Open <ArrowRight className="h-4 w-4" /></span>
    </Link>
  );
}

export function StaffApprovalsBanner() {
  const q = useApprovalsInbox();
  if (!q.data) return null;
  return <div className="mx-auto w-full max-w-6xl px-4 pt-6"><Banner count={q.data.total} stalled={q.data.stalled} to="/ops/approvals" label={q.data.total === 1 ? "1 approval waiting" : `${q.data.total} approvals waiting`} /></div>;
}

export function ManagerApprovalsBanner() {
  const load = useServerFn(getApprovalQueue);
  const q = useQuery({ queryKey: ["manager-approval-queue-count"], queryFn: () => load(), refetchInterval: 60_000, retry: false });
  const waiting = (q.data?.applications ?? []).filter((a) => a.manager_review_status === "pending" && a.readyForApproval);
  const stalled = waiting.filter((a) => Date.now() - new Date(a.created_at).getTime() >= 3 * 86_400_000).length;
  return <Banner count={waiting.length} stalled={stalled} to="/manager/approvals" label={waiting.length === 1 ? "1 investor ready for your approval" : `${waiting.length} investors ready for your approval`} />;
}
