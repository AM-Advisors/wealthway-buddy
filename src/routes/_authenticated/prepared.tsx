import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listItemsPreparedForMe, reviewPreparedItem } from "@/lib/assisted.functions";
import { DRAFT_STATUS_LABELS } from "@/lib/assisted-fields";
import { AttentionCenter } from "@/components/attention-center";
import { ParticipantHome } from "@/components/participant-home";
import { useClientWorkspace } from "@/components/client-workspace";
import { OutstandingInvestments } from "@/components/outstanding-investments";
import { useInvestorDashboard } from "@/components/investor-dashboard";

const label = (field: string) => field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function show(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function PreparedForMe() {
  const { activeKind } = useClientWorkspace();
  const investments = useInvestorDashboard(false, activeKind === "investor");
  const qc = useQueryClient();
  const listFn = useServerFn(listItemsPreparedForMe);
  const reviewFn = useServerFn(reviewPreparedItem);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isPending } = useQuery({
    queryKey: ["items-prepared-for-me"],
    queryFn: () => listFn(),
    staleTime: 0,
  });

  const review = useMutation({
    mutationFn: (vars: { id: string; decision: "approve" | "reject" | "request_changes" }) =>
      reviewFn({
        data: { draft_id: vars.id, decision: vars.decision, note: notes[vars.id] || undefined },
      }),
    onSuccess: () => {
      toast.success("Thank you, your decision has been recorded.");
      void qc.invalidateQueries({ queryKey: ["items-prepared-for-me"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That could not be saved."),
  });

  const items = data?.items ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl">Notifications & tasks</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your adviser, lawyer or accountant can prepare information for you. Nothing they prepare
          takes effect until you approve it here, and only you can approve it.
        </p>
      </header>

      <ParticipantHome />
      <OutstandingInvestments enabled={activeKind === "investor"} />
      <AttentionCenter {...(activeKind ? { workspace: activeKind } : {})} coveredInvestmentIds={activeKind === "investor" ? investments.data?.investments.map((i) => i.id) ?? [] : []} />
      <h2 className="text-xl font-semibold">Items prepared for me</h2>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting for you.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item: any) => (
            <li key={item.id} className="rounded-lg border border-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    Prepared by {item.preparedBy}
                    {item.firm ? ` through ${item.firm}` : ""} on{" "}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs">
                  {DRAFT_STATUS_LABELS[item.status] ?? item.status}
                </span>
              </div>

              {item.preparerNote ? (
                <p className="mt-3 text-sm italic text-muted-foreground">“{item.preparerNote}”</p>
              ) : null}

              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-1">Item</th>
                    <th className="py-1">Now</th>
                    <th className="py-1">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(item.proposed ?? {}).map(([field, value]) => (
                    <tr key={field} className="border-t border-border">
                      <td className="py-1.5">{label(field)}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {show((item.before ?? {})[field])}
                      </td>
                      <td className="py-1.5 font-medium">{show(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {item.status === "awaiting_client_review" ? (
                <div className="mt-4 space-y-3">
                  <Textarea
                    placeholder="Add a note (optional)"
                    value={notes[item.id] ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [item.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => review.mutate({ id: item.id, decision: "approve" })}
                      disabled={review.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => review.mutate({ id: item.id, decision: "request_changes" })}
                      disabled={review.isPending}
                    >
                      Request changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => review.mutate({ id: item.id, decision: "reject" })}
                      disabled={review.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  You decided on {item.reviewedAt ? new Date(item.reviewedAt).toLocaleString() : "-"}.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/prepared")({
  head: () => ({
    meta: [
      { title: "Notifications & tasks | Harmonious" },
      {
        name: "description",
        content:
          "See your outstanding investment tasks, assigned investments and information prepared for your review.",
      },
      { property: "og:title", content: "Notifications & tasks | Harmonious" },
      {
        property: "og:description",
        content: "Your current Harmonious tasks and review requests in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreparedForMe,
});
