import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Building2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyServices, intentLabel } from "@/lib/client-services.functions";
import { ENTITY_TYPES } from "@/lib/entities.functions";

export const Route = createFileRoute("/_authenticated/client/services/")({
  head: () => ({
    meta: [
      { title: "Your Harmonious services" },
      {
        name: "description",
        content:
          "Everything Harmonious does for you, grouped by company, fund or vehicle, with what each engagement costs.",
      },
      { property: "og:title", content: "Your Harmonious services" },
      {
        property: "og:description",
        content: "What Harmonious does for each of your entities, and what it costs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyServices,
});

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const typeLabel = (v: string) => ENTITY_TYPES.find((t) => t.value === v)?.label ?? v;

function MyServices() {
  const load = useServerFn(getMyServices);
  const { data, isLoading } = useQuery({ queryKey: ["my-services"], queryFn: () => load() });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const entitiesWithWork = (data?.entities ?? []).filter((e) => e.engagements.length > 0);
  const otherEntities = (data?.entities ?? []).filter((e) => e.engagements.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your Harmonious services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What we do for you, grouped by the company, fund or vehicle it relates to.
          </p>
        </div>
        <Button asChild>
          <Link to="/client/services/request">
            <Plus className="mr-2 size-4" /> Add a service or entity
          </Link>
        </Button>
      </div>

      {entitiesWithWork.length === 0 && (data?.clientWide ?? []).length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nothing set up yet</CardTitle>
            <CardDescription>
              Tell us what you need and we'll come back with the services, the cost and anything we
              need from you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link to="/client/services/request">Tell us what you need</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {entitiesWithWork.map((entity) => (
        <Card key={entity.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">{entity.legalName}</CardTitle>
                <CardDescription>{typeLabel(entity.entityType)}</CardDescription>
              </div>
              <Badge variant={entity.status === "active" ? "default" : "secondary"}>
                {entity.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {entity.engagements.map((g) => (
              <Link
                key={g.id}
                to="/client/services/$engagementId"
                params={{ engagementId: g.id }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 transition hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-medium">{g.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.activeServiceCount} active service{g.activeServiceCount === 1 ? "" : "s"}
                    {g.annualCents > 0 ? ` · ${money(g.annualCents)} a year` : ""}
                    {g.oneTimeCents > 0 ? ` · ${money(g.oneTimeCents)} one-time` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={g.deliveryStatus === "live" ? "default" : "secondary"}>
                    {g.deliveryStatus.replace("_", " ")}
                  </Badge>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}

      {(data?.clientWide ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Across your organisation</CardTitle>
            <CardDescription>Services that aren't tied to one entity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.clientWide ?? []).map((g) => (
              <Link
                key={g.id}
                to="/client/services/$engagementId"
                params={{ engagementId: g.id }}
                className="flex items-center justify-between rounded-md border p-3 transition hover:bg-muted"
              >
                <span className="text-sm font-medium">{g.title}</span>
                <span className="text-xs text-muted-foreground">
                  {g.activeServiceCount} service{g.activeServiceCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {otherEntities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your other entities</CardTitle>
            <CardDescription>On record with us, with nothing running yet.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {otherEntities.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
              >
                <Building2 className="size-3" /> {e.legalName}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {(data?.requests ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.requests ?? []).map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{intentLabel(r.intent)}</p>
                  {r.summary && <p className="text-xs text-muted-foreground">{r.summary}</p>}
                </div>
                <Badge variant="secondary">{r.status.replace("_", " ")}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
