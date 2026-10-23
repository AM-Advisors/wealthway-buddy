import { useState } from "react";
import { useIsSuperAdmin } from "@/lib/use-is-super-admin";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decideLockedEditFn, listLockedEditsFn } from "@/lib/record-locks.functions";

export const Route = createFileRoute("/_authenticated/ops/locked-edits")({
  head: () => ({
    meta: [
      { title: "Locked edit approvals - Harmonious operations" },
      { name: "description", content: "Approve or reject changes to locked fund, investor and client information." },
      { property: "og:title", content: "Locked edit approvals - Harmonious operations" },
      { property: "og:description", content: "Second-person approval for edits to saved information." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LockedEditsPage,
});

function LockedEditsPage() {
  const isSuper = useIsSuperAdmin();
  const qc = useQueryClient();
  const list = useServerFn(listLockedEditsFn);
  const decide = useServerFn(decideLockedEditFn);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["locked-edits"], queryFn: () => list() });
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const rows = data.filter((r: any) => tab === "all" || r.status === "pending");
  const act = async (id: string, decision: "approve" | "reject") => {
    const note = decision === "reject" ? window.prompt("Reason for rejecting (optional)") : null;
    try {
      await decide({ data: { requestId: id, decision, note } });
      toast.success(decision === "approve" ? "Change approved and saved." : "Change rejected.");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Locked edit approvals</h1>
        <p className="text-sm text-muted-foreground">Saved fund, investor and client information is locked. Changes wait here until someone other than the requester approves them.</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>Waiting</Button>
        <Button size="sm" variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>All</Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && !rows.length && <p className="text-sm text-muted-foreground">Nothing waiting for approval.</p>}
      {rows.map((r: any) => (
        <Card key={r.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              {r.label}
              <Badge variant={r.status === "pending" ? "default" : "secondary"}>{r.status}</Badge>
            </CardTitle>
            <CardDescription>Requested by {r.requester} · {new Date(r.created_at).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{r.details}</pre>
            {r.note && <p className="text-xs text-muted-foreground">Note: {r.note}</p>}
            {r.status === "pending" && (r.mine && !isSuper ? (
              <p className="text-xs text-muted-foreground">You requested this change, so another person must approve it.</p>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => act(r.id, "approve")}>Approve & save</Button>
                <Button size="sm" variant="outline" onClick={() => act(r.id, "reject")}>Reject</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
