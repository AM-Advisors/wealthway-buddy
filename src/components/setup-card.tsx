import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useClientWorkspace } from "@/components/client-workspace";
import { nextRequirementPath, setupProgress } from "@/lib/session-resolution";

const LABELS: Record<string, string> = {
  ACCOUNT: "Create your account",
  PERSON_PROFILE: "Tell us about you",
  IDENTITY: "Verify your identity",
  KYC: "Identity and compliance checks",
  INVESTMENT_PROFILE: "Set up your investment profile",
  ENTITY_PROFILE: "Entity details",
  KYB: "Entity verification",
  BENEFICIAL_OWNERS: "Beneficial owners",
  CONTROL_PERSONS: "Control persons",
  TAX: "Tax information",
  ACCREDITATION: "Accreditation",
  QUESTIONNAIRE: "Subscription questionnaire",
  SUBSCRIPTION: "Subscription documents",
  SIGNATURE: "Signatures",
  FUNDING: "Funding",
};

const label = (key: string) => LABELS[key] ?? key;

/**
 * "Complete your setup" on the client home page. Progress and the next step
 * come from the outstanding requirements the server resolved — the page never
 * works them out for itself.
 */
export function SetupCard() {
  const navigate = useNavigate();
  const { session } = useClientWorkspace();
  const outstanding = session?.outstandingRequirements ?? [];
  if (outstanding.length === 0) return null;

  const completedCount = Math.max(0, Object.keys(LABELS).length - outstanding.length);
  const progress = setupProgress(
    Array.from({ length: completedCount }, (_, i) => `done-${i}`),
    outstanding,
  );
  const next = progress.next;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete your setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Progress value={progress.percent} aria-label="Setup progress" />
          <p className="text-sm text-muted-foreground">{progress.percent}% complete</p>
        </div>
        <ul className="space-y-1 text-sm">
          {outstanding.map((requirement) => (
            <li key={requirement} className="text-muted-foreground">
              {label(requirement)}
            </li>
          ))}
        </ul>
        {next && (
          <Button
            className="h-auto max-w-full whitespace-normal text-left leading-snug"
            onClick={() => {
              const path = nextRequirementPath([next]);
              if (path) navigate({ to: path as never });
            }}
          >
            Continue — {label(next)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
