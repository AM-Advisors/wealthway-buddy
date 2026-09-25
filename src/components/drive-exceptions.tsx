import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { listDriveExceptions, retryDriveException } from "@/lib/drive.functions";
import { recordPath } from "@/lib/ops-records";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ISSUE: Record<string, string> = {
  conflict: "Conflict",
  needs_attention: "Needs attention",
  permission_too_broad: "Permission too broad",
  upload_failed: "Upload failed",
  mapping_missing: "Mapping missing",
  retry_failed: "Retry failed",
  permission_review: "Permission review",
  repository_unavailable: "Repository not configured",
};

const REPO: Record<string, string> = { fund: "Fund Repository", investor: "Investor Repository", test: "Test Repository" };

const when = (v: string) => new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function DriveExceptions() {
  const load = useServerFn(listDriveExceptions);
  const retry = useServerFn(retryDriveException);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["drive-exceptions"], queryFn: () => load({ data: {} }) });
  const mutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Resolved.");
      else toast.error(r.message ?? "Still needs attention.");
      void qc.invalidateQueries({ queryKey: ["drive-exceptions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed."),
  });
  const rows = query.data?.rows ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Drive exceptions</CardTitle>
        <CardDescription>
          {query.isLoading ? "Loading…" : rows.length ? `${rows.length} open` : "No open Google Drive issues."} Linking an existing folder happens on the fund or investor record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r: any) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">{ISSUE[r.issue_type] ?? r.issue_type}</Badge>
                <Badge variant="outline">{REPO[r.repository] ?? "Fund Repository"}</Badge>
                <span className="text-sm">{r.fundName ?? "Unknown fund"}{r.profileLabel ? ` · ${r.profileLabel}` : ""}</span>
              </div>
              <p className="text-xs text-muted-foreground">{r.detail}</p>
              <p className="text-xs text-muted-foreground">
                Last: {r.last_action ?? "—"} · {when(r.updated_at)} · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {r.offering_id && (
                <Button asChild size="sm" variant="outline">
                  <Link to={recordPath("fund", r.offering_id) as any}>Open Fund</Link>
                </Button>
              )}
              {query.data?.canAct && (
                <Button size="sm" onClick={() => mutation.mutate(r.id)} disabled={mutation.isPending}>Retry</Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
