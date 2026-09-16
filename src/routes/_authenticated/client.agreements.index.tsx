import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, FileText, Lock, MessageSquare, Plus, ShieldCheck } from "lucide-react";

import { ClientOffboardingPanel } from "@/components/client-offboarding-panel";
import { useClientPortal } from "@/components/client-portal-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgreementsHome } from "@/lib/agreements.functions";

export const Route = createFileRoute("/_authenticated/client/agreements/")({
  component: AgreementsHome,
});

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US") : "—";

const STAGE_LABEL: Record<string, string> = {
  draft: "Being prepared",
  in_review: "Ready for your review",
  changes_requested: "Change requested",
  client_signed: "Waiting on Harmonious countersignature",
  executed: "Executed",
};

function AgreementsHome() {
  const load = useServerFn(getAgreementsHome);
  const { data, isLoading } = useQuery({
    queryKey: ["agreements-home"],
    queryFn: () => load({ data: {} }),
  });
  const portal = useClientPortal();
  const services = (portal.data?.services ?? []) as any[];

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data?.clientId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No engagement yet</CardTitle>
          <CardDescription>
            Once Harmonious sets up your organisation, your master agreement and statements of work
            appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <a href="mailto:info@harmonious.co?subject=Getting%20started%20with%20Harmonious">
              Ask Harmonious to get started
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const msa = data.msa;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agreements &amp; SOW</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your master services agreement, every statement of work, and the pricing each one was
            executed on.
          </p>
        </div>
        <Button asChild>
          <Link to="/client/agreements/request-fund">
            <Plus className="mr-2 h-4 w-4" />
            Request new fund
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Master Services Agreement
            </CardTitle>
            <CardDescription>
              {msa.executedAt && !msa.needsReview
                ? `Version ${msa.acceptedVersion} executed ${date(msa.executedAt)}. Nothing to do.`
                : msa.currentVersion
                  ? `Version ${msa.currentVersion} is waiting for your review.`
                  : "No master agreement has been published yet."}
            </CardDescription>
          </div>
          {msa.currentVersion && (
            <Badge variant={msa.needsReview ? "default" : "secondary"}>
              {msa.needsReview ? "Review needed" : "Executed"}
            </Badge>
          )}
        </CardHeader>
        {msa.currentVersion && (
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild variant={msa.needsReview ? "default" : "outline"} size="sm">
              <Link to="/client/agreements/msa">
                {msa.needsReview ? "Review and sign" : "View agreement"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            {msa.summary && <p className="text-xs text-muted-foreground">{msa.summary}</p>}
          </CardContent>
        )}
      </Card>

      {data.pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Waiting on you</CardTitle>
            <CardDescription>
              Statements of work still in review. Nothing is binding until both sides sign.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.pending.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {STAGE_LABEL[s.stage] ?? s.stage}
                    {s.pricingVersion ? ` · pricing ${s.pricingVersion}` : ""}
                    {s.openChanges > 0 ? ` · ${s.openChanges} open change` : ""}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link to="/client/agreements/sow/$sowId" params={{ sowId: s.id }}>
                    Open
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Executed agreements
          </CardTitle>
          <CardDescription>
            Each fund keeps the pricing it was executed on. A later change to our published rates
            does not change these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.funds.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing executed yet.</p>
          )}
          {data.funds.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {s.offeringName ?? s.title}
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </p>
                <p className="text-xs text-muted-foreground">
                  Executed {date(s.executedAt)}
                  {s.pricingVersion ? ` · pricing ${s.pricingVersion}` : ""}
                  {s.effectiveDate ? ` · effective ${date(s.effectiveDate)}` : ""}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/client/agreements/sow/$sowId" params={{ sowId: s.id }}>
                  View
                </Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {data.changeCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              Change centre
            </CardTitle>
            <CardDescription>
              {data.changeCount} change {data.changeCount === 1 ? "request is" : "requests are"} in
              discussion. Open the agreement to see where each one stands.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Included in your scope</CardTitle>
          <CardDescription>
            Anything not listed here isn't currently included in your active scope. Request it from
            the Sign-offs page and Harmonious will confirm the fee and paperwork first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No services are recorded against your scope yet.
            </p>
          )}
          {services.map((s: any) => (
            <div key={`${s.key}-${s.offeringId ?? "client"}`} className="rounded-md border p-3">
              <p className="text-sm font-medium">{s.name}</p>
              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {s.offeringId ? "Fund-specific" : "Applies across your engagement"}
                {s.effectiveDate ? ` · from ${date(s.effectiveDate)}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <ClientOffboardingPanel />
    </div>
  );
}
