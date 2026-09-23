import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { useClientWorkspace } from "@/components/client-workspace";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, opsWorkArea, type OpsArea, type OpsCapability } from "@/lib/ops-capabilities";

export const Route = createFileRoute("/_authenticated/ops/areas/$area")({
  loader: ({ params }) => {
    const area = opsWorkArea(params.area);
    if (!area) throw notFound();
    return { areaId: area.id };
  },
  head: ({ loaderData }) => {
    const title = loaderData ? opsWorkArea(loaderData.areaId)?.title : "Work area";
    return {
      meta: [
        { title: `${title} — Harmonious Operations` },
        { name: "description", content: `Harmonious Operations ${title} work area.` },
        { property: "og:title", content: `${title} — Harmonious Operations` },
        { property: "og:description", content: `Harmonious Operations ${title} work area.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: WorkAreaPage,
});

/** Landing page for a work area: its specialist screens as cards. */
function WorkAreaPage() {
  const { areaId } = Route.useLoaderData();
  const area = opsWorkArea(areaId)!;
  const { session, loading } = useClientWorkspace();
  const caps = ((session as { operationsCapabilities?: OpsCapability[] } | null)?.operationsCapabilities ?? []);
  const allowed = can(caps, area.id as OpsArea, "see");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Work area</p>
        <h1 className="font-heading text-2xl font-semibold">{area.title}</h1>
      </header>
      {loading ? null : !allowed ? (
        <p className="text-sm text-muted-foreground">You don't have access to this work area.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {area.screens.map((s) => (
            <Link key={s.url} to={s.url as never} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="truncate">{s.title}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </CardTitle>
                  <CardDescription>{s.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
