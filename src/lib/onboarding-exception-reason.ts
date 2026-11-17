/**
 * Plain-language reasons for open investment issues, and the self-healing plan for
 * funding shortfall/overage alerts. Pure; the server applies the plan inside the
 * existing money-recording paths and every change keeps its audit event.
 */
import { EXCEPTION_LABELS, isExceptionType } from "@/lib/investor-onboarding-model";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export const fundingExceptionDetail = (expectedCents: number, receivedCents: number) =>
  `Expected ${expectedCents} cents, received ${receivedCents} cents.`;

export function fundingAmounts(detail: string | null | undefined): { expectedCents: number; receivedCents: number } | null {
  const m = /Expected\s+(\d+)\s+cents,\s+received\s+(\d+)\s+cents/i.exec(String(detail ?? ""));
  return m ? { expectedCents: Number(m[1]), receivedCents: Number(m[2]) } : null;
}

export const exceptionLabel = (type: string | null | undefined) => (isExceptionType(type) ? EXCEPTION_LABELS[type] : "Open review issue");

/** One line a staff member can act on. Funding alerts show amounts; other types show their label only (no screening detail). */
export function exceptionReason(e: { type?: string | null; detail?: string | null }): string {
  const label = exceptionLabel(e.type);
  const a = e.type === "underfunding" || e.type === "overfunding" ? fundingAmounts(e.detail) : null;
  if (!a) return label;
  const diff = Math.abs(a.expectedCents - a.receivedCents);
  return e.type === "underfunding"
    ? `Underfunding: expected ${usd(a.expectedCents)}, received ${usd(a.receivedCents)} (short ${usd(diff)})`
    : `Overfunding: expected ${usd(a.expectedCents)}, received ${usd(a.receivedCents)} (over by ${usd(diff)})`;
}

/** Reason shown under "Blocked": the first open blocking issue, plus how many more. */
export function blockedReason(list: { type?: string | null; detail?: string | null }[]): string | undefined {
  if (!list.length) return undefined;
  const first = exceptionReason(list[0]!);
  const more = list.length - 1;
  return more > 0 ? `${first} · ${more} more open issue${more === 1 ? "" : "s"}` : first;
}

export interface FundingExceptionPlan {
  resolve: { id: string; resolution: string }[];
  raise: { type: "underfunding" | "overfunding"; detail: string } | null;
}

/**
 * After money is recorded: an older shortfall alert whose amounts are now out of date is closed
 * (with the reason recorded), and a current alert is raised only when the amount still does not match.
 * An overfunding alert is never closed by a full match: extra money needs a person to decide.
 */
export function fundingExceptionPlan(input: {
  status: string;
  expectedCents: number;
  receivedCents: number;
  open: { id: string; type: string }[];
}): FundingExceptionPlan {
  const { status, expectedCents: exp, receivedCents: got } = input;
  const under = input.open.filter((e) => e.type === "underfunding");
  const over = input.open.filter((e) => e.type === "overfunding");
  const now = `${usd(got)} received of ${usd(exp)}`;
  if (status === "funded") {
    return { resolve: under.map((e) => ({ id: e.id, resolution: `Cleared automatically: full amount received (${now}).` })), raise: null };
  }
  if (status === "partially_funded") {
    return {
      resolve: under.map((e) => ({ id: e.id, resolution: `Replaced by an updated shortfall check (${now}).` })),
      raise: { type: "underfunding", detail: fundingExceptionDetail(exp, got) },
    };
  }
  if (status === "overfunded") {
    return {
      resolve: [
        ...under.map((e) => ({ id: e.id, resolution: `Cleared automatically: shortfall covered (${now}); overage raised separately.` })),
        ...over.map((e) => ({ id: e.id, resolution: `Replaced by an updated overage check (${now}).` })),
      ],
      raise: { type: "overfunding", detail: fundingExceptionDetail(exp, got) },
    };
  }
  return { resolve: [], raise: null };
}
