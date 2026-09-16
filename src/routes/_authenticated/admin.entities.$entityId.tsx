import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ENTITY_TYPES, getEntity } from "@/lib/entities.functions";

export const Route = createFileRoute("/_authenticated/admin/entities/$entityId")({
  head: () => ({
    meta: [
      { title: "Entity — Harmonious admin" },
      {
        name: "description",
        content:
          "One entity's details, parent and related entities, and the engagements Harmonious delivers for it.",
      },
      { property: "og:title", content: "Entity — Harmonious admin" },
      {
        property: "og:description",
        content: "Entity details, related entities and engagements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EntityPage,
});

const typeLabel = (v: string) => ENTITY_TYPES.find((t) => t.value === v)?.label ?? v;

function EntityPage() {
  const { entityId } = Route.useParams();
  const load = useServerFn(getEntity);
  const { data, isLoading } = useQuery({
    queryKey: ["entity", entityId],
    queryFn: () => load({ data: { entityId } }),
  });

  if (isLoading || !data) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  const e = data.entity;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">{e.legalName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {typeLabel(e.entityType)}
            {data.client ? ` · ${data.client.name}` : ""}
            {e.jurisdiction ? ` · ${e.jurisdiction}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={e.status === "active" ? "default" : "secondary"}>{e.status}</Badge>
          {data.client && (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/clients/$clientId/entities" params={{ clientId: e.clientId }}>
                All entities
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Formed:</span>{" "}
            {e.formationDate ? new Date(e.formationDate).toLocaleDateString("en-US") : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Tax ID:</span>{" "}
            {e.taxIdStatus.replace("_", " ")}
            {e.taxIdMasked ? ` · ${e.taxIdMasked}` : ""}
          </p>
          <p>
            <span className="text-muted-foreground">Parent:</span>{" "}
            {data.parent ? (
              <Link
                className="underline"
                to="/admin/entities/$entityId"
                params={{ entityId: data.parent.id }}
              >
                {data.parent.legalName}
              </Link>
            ) : (
              "—"
            )}
          </p>
          <p>
            <span className="text-muted-foreground">Fund record:</span>{" "}
            {data.offering ? (
              <Link
                className="underline"
                to="/admin/fund/$fundId"
                params={{ fundId: data.offering.id }}
              >
                {data.offering.name}
              </Link>
            ) : (
              "—"
            )}
          </p>
          {e.notes && <p className="sm:col-span-2 text-muted-foreground">{e.notes}</p>}
        </CardContent>
      </Card>

      {data.children.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Related entities</CardTitle>
            <CardDescription>Entities recorded underneath this one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.children.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{c.legalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel(c.entityType)} · {c.status}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/entities/$entityId" params={{ entityId: c.id }}>
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
          <CardTitle className="text-base">Engagements</CardTitle>
          <CardDescription>What Harmonious delivers for this entity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.engagements.length === 0 && (
            <p className="text-sm text-muted-foreground">No engagement covers this entity yet.</p>
          )}
          {data.engagements.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium">{g.title}</p>
                <p className="text-xs text-muted-foreground">
                  {g.billingFrequency.replace("_", " ")} · {g.deliveryStatus.replace("_", " ")}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/engagements/$engagementId" params={{ engagementId: g.id }}>
                  Open
                </Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
