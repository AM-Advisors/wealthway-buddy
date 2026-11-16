import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFundSetupOverview } from "@/lib/fund-setup-canonical.functions";
import { STEP_DETAIL_KEYS, type CheckRow, type CheckState, type QuestionsStatus, type SetupPlace } from "@/lib/setup-request-check";
import { FundSetupMoreDetails } from "@/components/fund-setup-more-details";

type Check = { hasRequest: boolean; submittedAt: string | null; rows: CheckRow[]; questions: QuestionsStatus; summary: { missing: number; changed: number; inSetup: number; reference: number; toDo: string[] } };

/** Same cached read as Fees & terms; nothing here saves. */
export function useSetupRequestCheck(offeringId: string) {
  const load = useServerFn(getFundSetupOverview);
  const q = useQuery({ queryKey: ["fund-setup-canonical", offeringId], queryFn: () => load({ data: { offeringId } }) });
  return { ...q, check: (q.data as any)?.requestCheck as Check | undefined };
}

const STATE: Record<CheckState, [string, string]> = {
  in_setup: ["In Setup", "bg-accent/15 text-foreground"],
  changed: ["Setup differs", "bg-muted text-foreground"],
  missing: ["Not in Setup yet", "bg-destructive/10 text-destructive"],
  reference: ["Check by hand", "bg-secondary text-secondary-foreground"],
};

export function questionsLabel(q: QuestionsStatus | undefined) {
  if (!q) return "";
  if (q.state === "draft") return `Draft v${q.draftVersion} waiting for approval`;
  if (q.state === "approved_with_draft") return `Approved v${q.approvedVersion} · draft v${q.draftVersion} waiting`;
  if (q.state === "approved") return `Approved v${q.approvedVersion} · ${q.questionCount} question${q.questionCount === 1 ? "" : "s"}`;
  return "Standard questions only";
}

export function requestCheckLabel(c: Check | undefined) {
  if (!c?.hasRequest) return "No fund request on file";
  return c.summary.missing ? `${c.summary.missing} answer${c.summary.missing === 1 ? "" : "s"} not in Setup yet` : "All answers carried into Setup";
}

/**
 * The fund request questionnaire inside one Setup step: the step's request-only fields (edited
 * here) and each answer the client gave for this step beside what Setup holds. Nothing here
 * changes the fund except the field editor, which saves through the existing Setup save path.
 */
export function RequestAnswersHere({ offeringId, places, withFields = true, skipKeys, onSaved }: { offeringId: string; places: SetupPlace[]; withFields?: boolean; skipKeys?: readonly string[] | undefined; onSaved?: (() => void) | undefined }) {
  const { check } = useSetupRequestCheck(offeringId);
  const keys = withFields ? places.flatMap((p) => STEP_DETAIL_KEYS[p] ?? []).filter((k) => !skipKeys?.includes(k)) : [];
  const order: CheckState[] = ["missing", "reference", "changed", "in_setup"];
  const rows = check?.hasRequest ? check.rows.filter((r) => places.includes(r.place)).sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state)) : [];
  if (!keys.length && !rows.length) return null;
  return (
    <div className="space-y-3">
      {keys.length > 0 && <FundSetupMoreDetails offeringId={offeringId} only={keys} onSaved={onSaved} />}
      {rows.length > 0 && (
        <div className="rounded-xl border bg-background p-4">
          <p className="text-sm font-medium">From the fund request</p>
          <p className="text-xs text-muted-foreground">What the client answered for this step{check?.submittedAt ? ` on ${new Date(check.submittedAt).toLocaleDateString("en-US")}` : ""}. Setup is what investors and documents use.</p>
          <ul className="mt-2 divide-y text-sm">
            {rows.map((r) => {
              const [label, cls] = STATE[r.state];
              return (
                <li key={r.key} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.question}</p>
                    <p className="break-words text-muted-foreground">Client answered: <span className="text-foreground">{r.answer}</span></p>
                    {r.state !== "in_setup" && <p className="break-words text-xs text-muted-foreground">In Setup: {r.setupValue ?? (r.state === "reference" ? "No Setup field, check by hand" : "Not entered yet")}</p>}
                  </div>
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
