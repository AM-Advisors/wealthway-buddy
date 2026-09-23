/**
 * The investor-facing view of identity verification: a simple progression
 * through Identity, Government ID, Face verification, Residential address and
 * AML screening. No risk scores, provider payloads or compliance notes.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { identityVerificationProgress } from "@/lib/didit.functions";
import type { InvestorStep } from "@/lib/kyc-verification";

const STEP_TONE: Record<InvestorStep["status"], string> = {
  waiting: "bg-muted text-muted-foreground",
  in_progress: "bg-accent/20 text-foreground",
  action_required: "bg-destructive/10 text-destructive",
  complete: "bg-primary/10 text-primary",
};

const STEP_LABEL: Record<InvestorStep["status"], string> = {
  waiting: "Not started",
  in_progress: "In progress",
  action_required: "Action needed",
  complete: "Complete",
};

export function IdentityVerificationCard(props: {
  kycStatus: string;
  hasSession: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const fetchProgress = useServerFn(identityVerificationProgress);
  const { data } = useQuery({
    queryKey: ["identity-progress"],
    queryFn: () => fetchProgress(),
    refetchInterval: props.kycStatus === "approved" ? false : 20_000,
  });

  const summary = data?.summary ?? "Verification not started";
  const steps = (data?.steps ?? []) as InvestorStep[];
  const actionMessage = data?.message ?? null;
  const done = props.kycStatus === "approved";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Identity verification</CardTitle>
          <CardDescription>
            Verify your ID and a quick selfie with our secure verification partner. Your results
            update here automatically — usually within a minute.
          </CardDescription>
        </div>
        <Badge variant={done ? "default" : "secondary"}>{summary}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {steps.map((step) => (
              <li
                key={step.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>{step.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STEP_TONE[step.status]}`}>
                  {STEP_LABEL[step.status]}
                </span>
              </li>
            ))}
          </ul>
        )}

        {actionMessage && <p className="text-sm text-destructive">{actionMessage}</p>}

        <div className="flex flex-wrap items-center gap-3">
          {done ? (
            <p className="text-sm text-muted-foreground">
              Your identity is verified. No further action needed.
            </p>
          ) : props.kycStatus === "declined" ? (
            <p className="text-sm text-muted-foreground">
              We couldn't verify your identity. Contact the fund team and we'll help you retry.
            </p>
          ) : (
            <>
              <Button size="sm" disabled={props.starting} onClick={props.onStart}>
                {props.starting
                  ? "Opening…"
                  : props.hasSession
                    ? "Continue verification"
                    : "Start verification"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {props.kycStatus === "review"
                  ? "Submitted — a reviewer is finishing the check."
                  : "Opens in a new tab; come back here when you're done."}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
