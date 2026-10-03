import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CloseRequestReview } from "@/components/close-request-review";
import { listAllCloseRequests } from "@/lib/fund-close-requests.functions";

export const Route = createFileRoute("/_authenticated/ops/close-requests")({
  head: () => ({
    meta: [
      { title: "Close requests - Harmonious Operations" },
      { name: "description", content: "Fund close requests submitted by fund managers, for Harmonious review." },
      { property: "og:title", content: "Close requests - Harmonious Operations" },
      { property: "og:description", content: "Review fund close requests from fund managers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});


function Page() {
  const load = useServerFn(listAllCloseRequests);
  const q = useQuery({ queryKey: ["ops-close-requests"], queryFn: () => load() });
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Close requests</h1>
        <p className="text-sm text-muted-foreground">Submitted by fund managers. Approve a close, generate its Form D and state filing packets, then file them yourself and record the confirmation. Nothing is submitted, charged or moved automatically.</p>
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
       q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
       !q.data?.length ? <p className="text-sm text-muted-foreground">No close requests yet.</p> :
       q.data.map((r: any) => <CloseRequestReview key={r.id} r={r} />)}
    </div>
  );
}
