import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getInvestorDrive, syncInvestorDrive } from "@/lib/drive.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const LABEL: Record<string, string> = {
  active: "Connected",
  not_created: "Not created",
  needs_attention: "Needs attention",
  conflict: "Conflict",
  pending: "Pending",
  archived: "Archived",
};

/** Investor 360 → Google Drive / Investor File. Harmonious staff only. */
export function DriveInvestorCard({ investorUserId }: { investorUserId: string }) {
  const load = useServerFn(getInvestorDrive);
  const sync = useServerFn(syncInvestorDrive);
  const qc = useQueryClient();
  const [linkIds, setLinkIds] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ["investor-drive", investorUserId], queryFn: () => load({ data: { investorUserId } }), retry: false });
  const mutation = useMutation({
    mutationFn: (v: { offeringId: string; profileId: string; linkFolderId?: string }) => sync({ data: v }),
    onSuccess: (r) => {
      if (r.status === "active") toast.success("Investor folder is ready.");
      else toast.error(r.error ?? "Google Drive needs attention.");
      setLinkIds({});
      void qc.invalidateQueries({ queryKey: ["investor-drive", investorUserId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not sync Google Drive."),
  });

  if (query.isError) return null;
  const rows = query.data?.rows ?? [];
  if (!query.isLoading && rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Google Drive / Investor File</CardTitle>
        <CardDescription>One folder per fund and investment profile. Investors and fund managers keep using the portal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}
        {rows.map((r) => {
          const key = `${r.offeringId}:${r.profileId}`;
          const attention = r.status === "needs_attention" || r.status === "conflict";
          return (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm">{r.fundName} · {r.profileLabel}</p>
                {r.error && <p className="text-xs text-muted-foreground">{r.error}</p>}
                {!r.fundReady && r.status === "not_created" && (
                  <p className="text-xs text-muted-foreground">The fund folder is not set up yet.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.status === "active" ? "default" : attention ? "destructive" : "secondary"}>{LABEL[r.status] ?? r.status}</Badge>
                {r.url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={r.url} target="_blank" rel="noopener noreferrer">Open Investor Folder</a>
                  </Button>
                )}
                {query.data?.canSync && r.fundReady && (
                  <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ offeringId: r.offeringId, profileId: r.profileId })}>
                    {r.status === "not_created" ? "Create" : attention ? "Retry" : "Sync"}
                  </Button>
                )}
              </div>
              {query.data?.canSync && r.status === "conflict" && (
                <div className="flex w-full flex-wrap gap-2">
                  <Input
                    value={linkIds[key] ?? ""}
                    onChange={(e) => setLinkIds({ ...linkIds, [key]: e.target.value.trim() })}
                    placeholder="Existing folder ID to link"
                    className="h-9 w-full sm:w-64"
                  />
                  <Button size="sm" variant="outline" disabled={!linkIds[key] || mutation.isPending}
                    onClick={() => mutation.mutate({ offeringId: r.offeringId, profileId: r.profileId, linkFolderId: linkIds[key] ?? "" })}>
                    Link existing folder
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
