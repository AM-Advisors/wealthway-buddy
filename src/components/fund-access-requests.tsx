import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { listFundAccessRequests, updateFundAccessRequest } from "@/lib/public-fund.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  invited: "Invited",
  closed: "Closed",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Requests visitors sent from the public fund pages. */
export function FundAccessRequests({ backTo }: { backTo: "/admin" | "/manager" }) {
  const load = useServerFn(listFundAccessRequests);
  const update = useServerFn(updateFundAccessRequest);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "new" | "invited" | "closed">("all");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["fund-access-requests"],
    queryFn: () => load(),
    refetchInterval: 120_000,
  });

  const mutation = useMutation({
    mutationFn: (input: { id: string; status: "new" | "contacted" | "invited" | "closed" }) =>
      update({
        data: { id: input.id, status: input.status, internal_note: notes[input.id] ?? "" },
      }),
    onSuccess: () => {
      toast.success("Request updated");
      void queryClient.invalidateQueries({ queryKey: ["fund-access-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = query.data?.requests ?? [];
  const requests = filter === "all" ? all : all.filter((r) => r.status === filter);
  const newCount = all.filter((r) => r.status === "new").length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Access requests</h1>
          <p className="text-sm text-muted-foreground">
            People who asked for the full materials from a public fund page. {newCount} waiting.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Refresh
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={backTo}>Back</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "new", "invited", "closed"] as const).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {key === "all" ? "All" : STATUS_LABEL[key]}
          </Button>
        ))}
      </div>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!query.isLoading && requests.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No requests yet.
          </CardContent>
        </Card>
      ) : null}

      {requests.map((request) => (
        <Card key={request.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {request.full_name}
                  <Badge variant={request.status === "new" ? "default" : "outline"}>
                    {STATUS_LABEL[request.status] ?? request.status}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {request.offering_name} · {when(request.created_at)}
                </CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${request.email}`}>Email</a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {request.email}
              {request.firm ? ` · ${request.firm}` : ""}
              {request.phone ? ` · ${request.phone}` : ""}
            </p>
            {request.message ? <p className="whitespace-pre-line">{request.message}</p> : null}
            {request.internal_note ? (
              <p className="text-xs text-muted-foreground">Note: {request.internal_note}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-xs"
                placeholder="Internal note (optional)"
                value={notes[request.id] ?? ""}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, [request.id]: e.target.value }))
                }
              />
              <Button
                size="sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ id: request.id, status: "contacted" })}
              >
                Mark contacted
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ id: request.id, status: "invited" })}
              >
                Mark invited
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ id: request.id, status: "closed" })}
              >
                Close
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={backTo === "/admin" ? "/admin/access" : "/manager"}>Invite them</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
