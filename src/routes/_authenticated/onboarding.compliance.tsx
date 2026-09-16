import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyComplianceCase } from "@/lib/kyc-aml.functions";
import { InvestorUploads } from "@/components/investor-uploads";
import { ComplianceTrail } from "@/components/compliance-trail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/onboarding/compliance")({
  head: () => ({
    meta: [
      { title: "KYC & AML Submissions — Harmonious Investor Portal" },
      {
        name: "description",
        content:
          "Track your identity and anti-money-laundering checks, send the documents your fund asked for, and see every submission and decision.",
      },
      { property: "og:title", content: "KYC & AML Submissions — Harmonious" },
      {
        property: "og:description",
        content: "Your identity and screening checks, documents and decision history in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompliancePage,
});

function statusTone(status: string) {
  if (status === "approved") return "default" as const;
  if (status === "declined") return "destructive" as const;
  if (status === "review" || status === "pending") return "secondary" as const;
  return "outline" as const;
}

function statusWord(status: string) {
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  if (status === "review") return "In review";
  if (status === "pending") return "More information needed";
  return "Not started";
}

function CompliancePage() {
  const load = useServerFn(getMyComplianceCase);
  const { data, isLoading } = useQuery({
    queryKey: ["my-compliance-case"],
    queryFn: () => load(),
  });

  const application = (data as any)?.application ?? null;
  const offering = (data as any)?.offering ?? null;
  const trail = ((data as any)?.trail ?? []) as any[];
  const outstanding = trail.find((t) => t.action === "info_requested");
  const laterDecision = trail.find(
    (t) => t.action === "approved" || t.action === "declined",
  );
  const showRequest =
    outstanding &&
    (!laterDecision || new Date(outstanding.createdAt) > new Date(laterDecision.createdAt));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Identity and AML checks</h1>
        <p className="text-sm text-muted-foreground">
          {offering?.name
            ? `Everything your fund team needs for ${offering.name}.`
            : "Everything your fund team needs before your subscription can be accepted."}
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your checks…</p>
      ) : !application ? (
        <p className="text-sm text-muted-foreground">
          You do not have an active fund application yet. Once your fund invites you, your checks
          appear here.
        </p>
      ) : (
        <>
          {showRequest ? (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-base">Your fund asked for more information</CardTitle>
                <CardDescription>{outstanding.note}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where your checks stand</CardTitle>
              <CardDescription>
                Update your answers at any time; each submission is recorded below.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase text-muted-foreground">Identity (KYC)</p>
                <Badge className="mt-1" variant={statusTone(String(application.kyc_status))}>
                  {statusWord(String(application.kyc_status))}
                </Badge>
                <Button asChild size="sm" variant="outline" className="mt-3 w-full">
                  <Link to="/onboarding/kyc">Open the identity form</Link>
                </Button>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase text-muted-foreground">Screening (AML)</p>
                <Badge className="mt-1" variant={statusTone(String(application.aml_status))}>
                  {statusWord(String(application.aml_status))}
                </Badge>
                <Button asChild size="sm" variant="outline" className="mt-3 w-full">
                  <Link to="/onboarding/aml">Open the AML questionnaire</Link>
                </Button>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase text-muted-foreground">Accreditation</p>
                <Badge
                  className="mt-1"
                  variant={statusTone(String(application.accreditation_status))}
                >
                  {statusWord(String(application.accreditation_status))}
                </Badge>
                <Button asChild size="sm" variant="outline" className="mt-3 w-full">
                  <Link to="/onboarding/accreditation">Open accreditation</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <InvestorUploads fundId={application.offering_id ?? null} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submission history</CardTitle>
              <CardDescription>
                Every submission, document and decision, oldest at the bottom.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComplianceTrail rows={trail} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
