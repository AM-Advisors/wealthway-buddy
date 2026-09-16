/**
 * The four steps of bringing a cap table across: read the file, match the
 * columns, agree the share totals, then record it. The founder sees this on
 * their migration page, and the Harmonious specialist sees the same thing,
 * refreshed live, on the concierge case.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { fmtNumber } from "./captable-context";

export type WizardFacts = {
  /** Lines read out of the uploaded file. */
  total: number;
  /** Lines that are ready to be recorded. */
  ready: number;
  /** Lines that still need a person to look at them. */
  error: number;
  /** Share totals the founder has confirmed, if any. */
  reconciliation?: { note?: string | null; exceptions?: Record<string, { status: string }> } | null;
  /** Whether the file has already been recorded, or was cancelled. */
  status: string;
  importedAt?: string | null;
  /** Open questions the specialist has put to the founder. */
  openQuestions?: number;
};

export type WizardStep = {
  key: "import" | "map" | "reconcile" | "live";
  title: string;
  state: "done" | "current" | "blocked" | "waiting";
  detail: string;
};

export function migrationSteps(facts: WizardFacts): WizardStep[] {
  const recorded = facts.status === "imported";
  const cancelled = facts.status === "cancelled";
  const exceptions = Object.values(facts.reconciliation?.exceptions ?? {});
  const openFlags = exceptions.filter((e) => e.status === "open").length;
  const confirmed = Boolean(facts.reconciliation) && openFlags === 0;
  const openQuestions = facts.openQuestions ?? 0;

  const imported: WizardStep = {
    key: "import",
    title: "Import",
    state: facts.total > 0 ? "done" : "current",
    detail:
      facts.total > 0
        ? `${fmtNumber(facts.total)} lines read from the file`
        : "Upload a Carta, Pulley or spreadsheet export",
  };

  const mapped: WizardStep = {
    key: "map",
    title: "Map",
    state:
      facts.total === 0
        ? "waiting"
        : facts.error > 0
          ? "blocked"
          : facts.ready > 0
            ? "done"
            : "current",
    detail:
      facts.error > 0
        ? `${fmtNumber(facts.error)} lines still need attention`
        : facts.ready > 0
          ? `${fmtNumber(facts.ready)} lines matched to shareholders and share classes`
          : "Match each column to what it means",
  };

  const reconciled: WizardStep = {
    key: "reconcile",
    title: "Reconcile",
    state: recorded
      ? "done"
      : mapped.state !== "done"
        ? "waiting"
        : openFlags > 0
          ? "blocked"
          : confirmed
            ? "done"
            : "current",
    detail: openFlags
      ? `${fmtNumber(openFlags)} flagged share ${openFlags === 1 ? "class" : "classes"} to settle`
      : confirmed || recorded
        ? "Authorised, issued and outstanding shares agreed"
        : "Check the share totals against the file",
  };

  const live: WizardStep = {
    key: "live",
    title: "Go live",
    state: recorded
      ? "done"
      : cancelled
        ? "blocked"
        : openQuestions > 0
          ? "blocked"
          : reconciled.state === "done"
            ? "current"
            : "waiting",
    detail: recorded
      ? "Recorded on the cap table"
      : cancelled
        ? "This file was cancelled — nothing was recorded"
        : openQuestions > 0
          ? `${fmtNumber(openQuestions)} open ${openQuestions === 1 ? "question" : "questions"} with the founder`
          : "Accept the file to record it",
  };

  return [imported, mapped, reconciled, live];
}

const TONE: Record<WizardStep["state"], string> = {
  done: "border-primary/40 bg-primary/5",
  current: "border-primary bg-background ring-1 ring-primary/30",
  blocked: "border-destructive/40 bg-destructive/5",
  waiting: "border-border bg-muted/30",
};

const LABEL: Record<WizardStep["state"], string> = {
  done: "Done",
  current: "Your turn",
  blocked: "Needs attention",
  waiting: "Not yet",
};

export function MigrationWizard({
  facts,
  title = "Where this migration has got to",
  description,
  live = false,
}: {
  facts: WizardFacts;
  title?: string;
  description?: string;
  live?: boolean;
}) {
  const steps = migrationSteps(facts);

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {live ? (
            <Badge variant="outline" className="gap-1">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              Updating live
            </Badge>
          ) : null}
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.key} className={cn("rounded-lg border p-3", TONE[step.state])}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {index + 1}. {step.title}
                </p>
                <Badge
                  variant={
                    step.state === "blocked"
                      ? "destructive"
                      : step.state === "done"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {LABEL[step.state]}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
