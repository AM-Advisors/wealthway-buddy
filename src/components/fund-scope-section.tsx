import { useState } from "react";

import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestServiceCard } from "@/components/service-gate";
import { useFundScope, type FundScope, type FundSection } from "@/lib/fund-scope";

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

/**
 * A banner for investor-facing steps: silent when the step is inside the
 * client's scope (or when the viewer cannot see scope at all).
 */
export function ScopeNotice({
  offeringId,
  section,
  label,
}: {
  offeringId: string | null | undefined;
  section: FundSection;
  label?: string;
}) {
  const scope = useFundScope(offeringId);
  if (!scope.canRead) return null;
  const service = scope.serviceFor(section);
  const status = service?.status ?? "unset";
  if (status === "included") return null;

  if (status === "unset" || !scope.configured) {
    if (!scope.isStaff) return null;
    return (
      <div className="mb-4 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Scope not recorded for this step{label ? ` (${label})` : ""}.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-md border p-3 text-sm">
      This service is not currently included in your active scope.
    </div>
  );
}

/**
 * The fund dashboard view of the client's agreement: every service Harmonious
 * has activated for this fund, and what is still outside the agreement.
 */
export function ScopeServicesPanel({
  scope,
  offeringId,
}: {
  scope: FundScope;
  offeringId?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!scope.canRead) return null;

  const active = scope.services.filter((s) => s.status === "included");
  const pending = scope.services.filter((s) => s.status === "requested");
  const outside = scope.services.filter(
    (s) => s.status === "not_included" || s.status === "optional",
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Services in this fund</CardTitle>
        <CardDescription>
          {scope.configured
            ? "Taken from the client's active statement of work. Anything outside it stays blocked until it is added."
            : "No scope has been recorded for this client yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {active.length > 0 ? (
          <>
            <ServiceList title="Active" services={active} tone="secondary" showBasis />
            <p className="text-xs text-muted-foreground">
              The label after each service is how it's billed. Services shown as “per request” are
              quoted before the work starts, because the amount depends on what's required.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No services activated yet.</p>
        )}
        {pending.length > 0 ? (
          <ServiceList title="Awaiting approval" services={pending} tone="outline" />
        ) : null}
        {outside.length > 0 ? (
          <div className="space-y-2">
            <ServiceList title="Outside scope" services={outside} tone="destructive" />
            <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Hide requests" : "Request a service"}
            </Button>
            {showAll
              ? outside.map((s) => (
                  <RequestServiceCard
                    key={s.key}
                    service={s}
                    clientId={scope.clientId}
                    offeringId={offeringId ?? null}
                  />
                ))
              : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const BASIS_LABEL: Record<string, string> = {
  one_time: "one-time",
  annual: "per year",
  recurring: "recurring",
  transaction: "each time",
  per_request: "per request",
  pass_through: "passed through at cost",
};

function ServiceList({
  title,
  services,
  tone,
  showBasis,
}: {
  title: string;
  services: { key: string; name: string; pricingModel?: string | null }[];
  tone: "secondary" | "outline" | "destructive";
  showBasis?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {services.map((s) => {
          const basis = showBasis && s.pricingModel ? BASIS_LABEL[s.pricingModel] : null;
          return (
            <Badge key={s.key} variant={tone}>
              {s.name}
              {basis ? <span className="ml-1 font-normal opacity-80">· {basis}</span> : null}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
