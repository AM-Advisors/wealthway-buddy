import { cn } from "@/lib/utils";

const STEPS = [
  { key: "kyc", label: "Identity (KYC)" },
  { key: "aml", label: "AML questionnaire" },
  { key: "accreditation", label: "Accreditation" },
  { key: "documents", label: "Documents" },
  { key: "funding", label: "Funding" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export function OnboardingStepper({ current }: { current: StepKey }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      {STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-[11px]",
                state === "done" && "border-primary bg-primary text-primary-foreground",
                state === "current" && "border-primary text-primary",
                state === "todo" && "border-border text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                "uppercase tracking-wide",
                state === "todo" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
