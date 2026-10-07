import { cn } from "@/lib/utils";
import { asResponsibility, RESPONSIBILITY_LABEL, RESPONSIBILITY_TONE, RESPONSIBILITY_STATUSES, type ResponsibilityCounts, type ResponsibilityStatus } from "@/lib/responsibility";

const TONE_CLASS = {
  active: "border-primary/30 bg-primary/5 text-primary",
  action: "border-accent bg-accent/20 text-foreground font-semibold",
  waiting: "border-border bg-muted text-muted-foreground",
  done: "border-border bg-secondary text-secondary-foreground",
} as const;

export function ResponsibilityBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const s = asResponsibility(status);
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide", TONE_CLASS[RESPONSIBILITY_TONE[s]], className)}>
      {RESPONSIBILITY_LABEL[s]}
    </span>
  );
}

/** Filter chips with counts; "ALL" plus the six states. */
export function ResponsibilityFilter({ value, onChange, counts }: { value: ResponsibilityStatus | "ALL"; onChange: (v: ResponsibilityStatus | "ALL") => void; counts?: ResponsibilityCounts }) {
  const opts: (ResponsibilityStatus | "ALL")[] = ["ALL", ...RESPONSIBILITY_STATUSES];
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by responsibility">
      {opts.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
          className={cn("rounded-full border px-2.5 py-1 text-xs", value === o ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted")}>
          {o === "ALL" ? "All" : RESPONSIBILITY_LABEL[o]}{counts && o !== "ALL" ? ` (${counts[o]})` : ""}
        </button>
      ))}
    </div>
  );
}
