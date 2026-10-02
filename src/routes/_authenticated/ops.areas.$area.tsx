import { useEffect, useState } from "react";
import { Link, createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { ArrowRight, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useClientWorkspace } from "@/components/client-workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccessControlAccess } from "@/lib/access-control.functions";
import {
  RETIRED_AREA_REDIRECTS,
  allowedScreens,
  areaVisible,
  opsWorkArea,
  visibleScreens,
  type OpsCapability,
  type OpsStep,
} from "@/lib/ops-capabilities";
import { getOpsWorkQueue } from "@/lib/ops-work-queue.functions";
import { readRecent, type RecentScreen } from "@/lib/recent-screens";

export const Route = createFileRoute("/_authenticated/ops/areas/$area")({
  loader: ({ params }) => {
    const moved = RETIRED_AREA_REDIRECTS[params.area];
    if (moved) throw redirect({ to: "/ops/areas/$area", params: { area: moved }, replace: true });
    const area = opsWorkArea(params.area);
    if (!area) throw notFound();
    return { areaId: area.id };
  },
  head: ({ loaderData }) => {
    const title = loaderData ? opsWorkArea(loaderData.areaId)?.title : "Work area";
    return {
      meta: [
        { title: `${title} - Harmonious Operations` },
        { name: "description", content: `What's waiting in ${title} and every screen for that process.` },
        { property: "og:title", content: `${title} - Harmonious Operations` },
        { property: "og:description", content: `What's waiting in ${title} and every screen for that process.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: WorkAreaPage,
});

const STEP_ORDER: OpsStep[] = ["Start", "Prepare", "Review", "Approve", "Track", "Reference"];
const STEP_LABEL: Record<OpsStep, string> = {
  Start: "Start here",
  Prepare: "Prepare",
  Review: "Review",
  Approve: "Approve",
  Track: "Track",
  Reference: "Records & settings",
};

function waitingLabel(at?: string | null) {
  if (!at) return null;
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return null;
  return days <= 0 ? "Waiting since today" : `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

/** Work page for one process: what's waiting, then the screens in process order. */
function WorkAreaPage() {
  const { areaId } = Route.useLoaderData();
  const area = opsWorkArea(areaId)!;
  const { session, loading } = useClientWorkspace();
  const caps = (session as { operationsCapabilities?: OpsCapability[] } | null)?.operationsCapabilities ?? [];
  const allowed = areaVisible(area, caps);
  const accessFn = useServerFn(getAccessControlAccess);
  // UX only - the server functions re-check on every call.
  const { data: acl } = useQuery({ queryKey: ["access-control-access"], queryFn: () => accessFn(), enabled: area.id === "administration" });
  const screens = visibleScreens(allowedScreens(area, caps), { accessControl: acl?.allowed === true });

  const queueFn = useServerFn(getOpsWorkQueue);
  const queue = useQuery({
    queryKey: ["ops-work-queue", "area-page"],
    queryFn: () => queueFn({ data: { page: 1, pageSize: 100 } }),
    enabled: allowed,
  });
  const queues = new Set(area.queues ?? [area.id]);
  const waiting = (queue.data?.items ?? []).filter((i) => queues.has(i.area));

  const [recent, setRecent] = useState<RecentScreen[]>([]);
  useEffect(() => setRecent(readRecent()), []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Work area</p>
          <h1 className="font-heading text-2xl font-semibold">{area.title}</h1>
        </div>
        {allowed && area.url !== `/ops/areas/${area.id}` && (
          <Link to={area.url as never} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            Open {area.title} list <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </header>

      {loading ? null : !allowed ? (
        <p className="text-sm text-muted-foreground">You don't have access to this work area.</p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                Waiting now
                {queue.data && <Badge variant="secondary">{waiting.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {queue.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : waiting.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing is waiting here right now.</p>
              ) : (
                <ul className="divide-y">
                  {waiting.slice(0, 8).map((i) => {
                    const w = waitingLabel(i.at);
                    const aging = w && /\d/.test(w) && Number(w.match(/\d+/)![0]) >= 3;
                    return (
                      <li key={i.id}>
                        <Link to={i.destination as never} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{i.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[i.fundName ?? i.clientName, i.reason].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                            {aging && <Badge variant="outline">Aging</Badge>}
                            {w}
                            <ArrowRight className="size-3.5" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {waiting.length > 8 && (
                <Link to="/ops" className="mt-2 inline-block text-sm text-primary">See all {waiting.length} on Home</Link>
              )}
            </CardContent>
          </Card>

          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="size-3.5" aria-hidden /> Recent:</span>
              {recent.map((r) => (
                <Link key={r.url} to={r.url as never} className="rounded-full border px-2.5 py-0.5 hover:border-primary/50">{r.title}</Link>
              ))}
            </div>
          )}

          {STEP_ORDER.map((step) => {
            const items = screens.filter((s) => (s.step ?? "Reference") === step);
            if (!items.length) return null;
            return (
              <section key={step} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{STEP_LABEL[step]}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((s) => (
                    <Link key={s.url} to={s.url as never} className="group">
                      <Card className="h-full transition-colors group-hover:border-primary/50">
                        <CardHeader className="py-4">
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
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
