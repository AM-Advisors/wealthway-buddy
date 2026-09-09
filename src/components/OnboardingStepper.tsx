import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { getStepRail, type RailStatus, type RailStep } from "@/lib/step-rail.functions";

const STEPS = [
  { key: "kyc", label: "Identity", to: "/onboarding/kyc" },
  { key: "aml", label: "Screening", to: "/onboarding/aml" },
  { key: "accreditation", label: "Accreditation", to: "/onboarding/accreditation" },
  { key: "documents", label: "Documents", to: "/onboarding/documents" },
  { key: "funding", label: "Funding", to: "/onboarding/funding" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

const STATUS_LABEL: Record<RailStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  in_review: "In review",
  complete: "On file",
  attention: "Needs attention",
};

function statusClasses(status: RailStatus, isCurrent: boolean) {
  if (status === "complete") return "border-primary bg-primary text-primary-foreground";
  if (status === "attention") return "border-destructive text-destructive";
  if (status === "in_review") return "border-accent text-accent-foreground bg-accent/20";
  if (isCurrent || status === "in_progress") return "border-primary text-primary";
  return "border-border text-muted-foreground";
}

export function OnboardingStepper({ current }: { current: StepKey }) {
  const load = useServerFn(getStepRail);
  const { data } = useQuery({ queryKey: ["step-rail"], queryFn: () => load() });

  const byKey = new Map<string, RailStep>((data?.steps ?? []).map((s) => [s.key, s]));

  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {STEPS.map((step, i) => {
        const live = byKey.get(step.key);
        const status: RailStatus = live?.status ?? "not_started";
        const isCurrent = step.key === current;
        return (
          <li key={step.key}>
            <Link
              to={step.to}
              className={cn(
                "block h-full rounded-lg border p-3 transition-colors hover:bg-muted/50",
                isCurrent ? "border-primary bg-muted/40" : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px]",
                    statusClasses(status, isCurrent),
                  )}
                >
                  {status === "complete" ? "✓" : i + 1}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide">{step.label}</span>
              </div>
              <p
                className={cn(
                  "mt-2 text-[11px] uppercase tracking-wide",
                  status === "complete"
                    ? "text-primary"
                    : status === "attention"
                      ? "text-destructive"
                      : "text-muted-foreground",
                )}
              >
                {STATUS_LABEL[status]}
              </p>
              {live && live.facts.length > 0 ? (
                <dl className="mt-2 space-y-1">
                  {live.facts.slice(0, 4).map((f) => (
                    <div key={f.label} className="text-[11px] leading-tight">
                      <dt className="inline text-muted-foreground">{f.label}: </dt>
                      <dd className="inline break-words text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">Nothing captured yet</p>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
