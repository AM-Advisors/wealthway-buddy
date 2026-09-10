import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestServiceCard } from "@/components/service-gate";
import type { FundScope, FundSection } from "@/lib/fund-scope";

/**
 * Wraps one fund page section. The section renders normally when the service is
 * included in the client's active statement of work. Anything else is replaced
 * with the standard out-of-scope notice and a way to request the service.
 *
 * Where no scope has been recorded yet, the Harmonious team keeps working with a
 * warning; everyone else sees the notice.
 */
export function ScopeSection({
  scope,
  section,
  offeringId,
  label,
  children,
}: {
  scope: FundScope;
  section: FundSection;
  offeringId?: string | null;
  label?: string;
  children: React.ReactNode;
}) {
  // People who cannot read the client's scope (investors, for example) are not
  // gated here — their access is already governed by the fund itself.
  if (!scope.canRead) return <>{children}</>;

  const service = scope.serviceFor(section);
  const status = service?.status ?? "unset";

  if (status === "included") {
    return (
      <div className="space-y-2">
        <ScopeNote tone="in">
          Included in scope{service?.name ? ` · ${service.name}` : ""}
        </ScopeNote>
        {children}
      </div>
    );
  }

  if (status === "unset" || !scope.configured) {
    if (scope.isStaff) {
      return (
        <div className="space-y-2">
          <ScopeNote tone="unknown">
            Scope not recorded for this service{label ? ` (${label})` : ""}. Confirm it against the
            client's statement of work.
          </ScopeNote>
          {children}
        </div>
      );
    }
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{service?.name ?? label ?? "This step"}</CardTitle>
          <CardDescription>
            This service is not currently included in your active scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Ask your Harmonious contact to add this service to your statement of work.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <RequestServiceCard
      service={service!}
      clientId={scope.clientId}
      offeringId={offeringId ?? null}
    />
  );
}

function ScopeNote({ tone, children }: { tone: "in" | "unknown"; children: React.ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant={tone === "in" ? "secondary" : "outline"}>
        {tone === "in" ? "In scope" : "Scope not recorded"}
      </Badge>
      <span>{children}</span>
    </p>
  );
}

/** A one-line summary of how much of this fund's work sits inside the agreement. */
export function ScopeSummary({ scope }: { scope: FundScope }) {
  if (!scope.canRead) return null;

  if (!scope.configured) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        No scope has been recorded for this fund's client yet.{" "}
        {scope.isStaff
          ? "Steps below stay available to the Harmonious team, but should be confirmed against the statement of work."
          : "Ask your Harmonious contact to confirm your statement of work."}
        {scope.isStaff && scope.clientId ? (
          <>
            {" "}
            <Link
              className="underline"
              to="/admin/contracts/$clientId"
              params={{ clientId: scope.clientId }}
            >
              Open the client's scope
            </Link>
            .
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground">
      <Badge variant="secondary">{scope.counts.included} steps in scope</Badge>
      {scope.counts.pending > 0 ? (
        <Badge variant="outline">{scope.counts.pending} awaiting approval</Badge>
      ) : null}
      {scope.counts.outside > 0 ? (
        <Badge variant="destructive">{scope.counts.outside} outside scope</Badge>
      ) : null}
      <span>Steps outside the statement of work are shown with a request option.</span>
      {scope.isStaff && scope.clientId ? (
        <Link
          className="underline"
          to="/admin/contracts/$clientId"
          params={{ clientId: scope.clientId }}
        >
          Full scope
        </Link>
      ) : null}
    </div>
  );
}
