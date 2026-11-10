import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFundSetupOverview } from "@/lib/fund-setup-canonical.functions";
import { SETUP_PLACES, type CheckRow, type CheckState, type QuestionsStatus } from "@/lib/setup-request-check";

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

const ANCHOR: Partial<Record<string, string>> = { basic: "setup-form-basic", details: "setup-form-details", jurisdiction: "setup-form-jurisdiction", team: "setup-form-team", documents: "setup-form-documents" };
const goTo = (place: string) => (ANCHOR[place] ? `#${ANCHOR[place]}` : null);

/** Every answer from the client's fund request beside where it lives in Setup. */
export function SetupRequestCheck({ check }: { check: Check | undefined }) {
  if (!check) return <p className="text-sm text-muted-foreground">Checking the fund request…</p>;
  if (!check.hasRequest) return <p className="text-sm text-muted-foreground">This fund was not started from a client fund request, so there are no request answers to compare.</p>;
  const order: CheckState[] = ["missing", "reference", "changed", "in_setup"];
  const rows = [...check.rows].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Answers from the client's fund request{check.submittedAt ? ` sent ${new Date(check.submittedAt).toLocaleDateString("en-US")}` : ""}. Setup is the record investors and documents use; where Setup differs, Setup is used. Nothing here changes the fund.
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 font-medium text-destructive">{check.summary.missing} not in Setup yet</span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">{check.summary.reference} to check by hand</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">{check.summary.changed} differ</span>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-medium">{check.summary.inSetup} in Setup</span>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2 font-medium">Question</th><th className="px-3 py-2 font-medium">Request answer</th><th className="px-3 py-2 font-medium">In Setup</th><th className="px-3 py-2 font-medium">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const [label, cls] = STATE[r.state];
              const href = r.state === "missing" ? goTo(r.place) : null;
              return (
                <tr key={r.key} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{r.question}<span className="block text-xs font-normal text-muted-foreground">{SETUP_PLACES[r.place]}</span></td>
                  <td className="px-3 py-2">{r.answer}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.setupValue ?? (r.state === "reference" ? "No Setup field" : "Not entered")}</td>
                  <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>{href && <a href={href} className="mt-1 block text-xs text-primary underline">Go to {SETUP_PLACES[r.place]}</a>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
