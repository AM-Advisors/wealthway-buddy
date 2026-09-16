import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listEntityRegister } from "@/lib/entities.functions";

export const Route = createFileRoute("/_authenticated/admin/entities/")({
  head: () => ({
    meta: [
      { title: "Entities and engagements — Harmonious admin" },
      {
        name: "description",
        content:
          "Every client's companies, funds, SPVs, series and management entities, and the engagements covering them.",
      },
      { property: "og:title", content: "Entities and engagements — Harmonious admin" },
      {
        property: "og:description",
        content: "Client entity register and the engagements attached to each one.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EntityRegisterPage,
});

function EntityRegisterPage() {
  const load = useServerFn(listEntityRegister);
  const { data, isLoading } = useQuery({
    queryKey: ["entity-register"],
    queryFn: () => load(),
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl">Entities and engagements</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        Each client holds a master relationship, a register of entities — companies, funds, SPVs,
        series, GPs and management companies — and one engagement per entity covering its services,
        commercial terms and delivery.
      </p>

      {isLoading && <Skeleton className="h-48 w-full" />}

      <div className="space-y-3">
        {(data?.clients ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">{c.name}</CardTitle>
                <CardDescription>
                  {c.entityCount} {c.entityCount === 1 ? "entity" : "entities"} ·{" "}
                  {c.engagementCount} {c.engagementCount === 1 ? "engagement" : "engagements"} ·{" "}
                  {c.liveEngagements} live
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/clients/$clientId/entities" params={{ clientId: c.id }}>
                    Open
                  </Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
        {data && data.clients.length === 0 && (
          <p className="text-sm text-muted-foreground">No clients yet.</p>
        )}
      </div>
    </main>
  );
}
