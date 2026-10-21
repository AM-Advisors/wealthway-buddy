import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock, LockKeyhole } from "lucide-react";
import { getApplicationChecklist } from "@/lib/subscription.functions";
import { onboardingDetailFn } from "@/lib/investor-onboarding.functions";
import { applicationChecklistSummary } from "@/lib/application-checklist";
import type { JourneyStepView } from "@/lib/investor-journey-model";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ApplicationChecklist() {
  const resolve = useServerFn(getApplicationChecklist);
  const load = useServerFn(onboardingDetailFn);
  const investment = useQuery({ queryKey: ["application-checklist"], queryFn: () => resolve() });
  const onboardingId = investment.data?.onboardingId;
  const detail = useQuery({
    queryKey: ["onboarding", onboardingId],
    enabled: Boolean(onboardingId),
    queryFn: () => {
      if (!onboardingId) throw new Error("No investment selected.");
      return load({ data: { onboardingId } });
    },
  });

  if (investment.error) return <LoadError audience="account" error={investment.error} what="Your investment checklist" onRetry={() => void investment.refetch()} />;
  if (detail.error) return <LoadError audience="account" error={detail.error} what="Your investment checklist" onRetry={() => void detail.refetch()} />;
  if (investment.isPending || (onboardingId && detail.isPending)) return <p className="text-sm text-muted-foreground">Loading your investment checklist…</p>;
  if (!onboardingId || !detail.data) return <p className="text-sm text-muted-foreground">No investment checklist is linked to this commitment yet.</p>;

  const steps: JourneyStepView[] = detail.data.journey ?? [];
  const summary = applicationChecklistSummary(steps);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your investment in {detail.data.offering?.name ?? "this fund"}</CardTitle>
        <CardDescription>
          {summary.complete ? "Your investment is complete." : `${summary.remaining} step${summary.remaining === 1 ? "" : "s"} remaining.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {steps.map((step) => {
            const Icon = step.state === "complete" ? CheckCircle2 : step.state === "in_progress" ? Clock : step.state === "locked" ? LockKeyhole : Circle;
            return (
              <li key={step.key} className="flex items-start gap-3 py-3">
                <Icon aria-hidden="true" className={`mt-1 size-4 shrink-0 ${step.state === "complete" ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{step.label}</span>
                    <Badge variant="secondary">{step.state === "complete" ? "Completed" : step.state === "in_progress" ? "In progress" : step.state === "locked" ? "Not available yet" : "Action required"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.message}</p>
                  {step.state !== "locked" ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/investment/$onboardingId" params={{ onboardingId }} search={{ step: step.key }}>
                        {step.state === "complete" ? "View" : "Open"} {step.label}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
