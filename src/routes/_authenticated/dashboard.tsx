import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { getOnboarding } from "@/lib/onboarding.functions";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Application Status — Meridian Investor Portal" },
      {
        name: "description",
        content:
          "Track your KYC, AML screening, accreditation, document signing and funding status for your Meridian fund subscription.",
      },
      { property: "og:title", content: "Application Status — Meridian Investor Portal" },
      {
        property: "og:description",
        content: "Live status of every step in your investor onboarding.",
      },
    ],
  }),
  component: Dashboard,
});

const LABEL: Record<string, string> = {
  not_started: "Not started",
  pending: "Pending",
  review: "In review",
  approved: "Approved",
  declined: "Declined",
};

function Dashboard() {
  const load = useServerFn(getOnboarding);
  const { data, isLoading } = useQuery({ queryKey: ["onboarding"], queryFn: () => load() });

  const app = data?.application;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <OnboardingStepper current={(app?.current_step as "kyc") ?? "kyc"} />
      <h1 className="mt-8 text-3xl">Your application</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {data?.offering?.name ?? "Fund subscription"} — compliance review typically completes within
        two business days.
      </p>

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-8 space-y-4">
          <StatusRow title="Identity verification (KYC)" status={app?.kyc_status ?? "not_started"} to="/onboarding/kyc" cta="Review details" />
          <StatusRow title="AML screening" status={app?.aml_status ?? "not_started"} to="/onboarding/aml" cta="Review answers" />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accreditation, documents and funding</CardTitle>
              <CardDescription>
                These steps unlock once KYC and AML screening are approved by compliance.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Accreditation {LABEL[app?.accreditation_status ?? "not_started"]}</Badge>
              <Badge variant="outline">Documents {LABEL[app?.documents_status ?? "not_started"]}</Badge>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

function StatusRow({
  title,
  status,
  to,
  cta,
}: {
  title: string;
  status: string;
  to: "/onboarding/kyc" | "/onboarding/aml";
  cta: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{LABEL[status] ?? status}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={to}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
