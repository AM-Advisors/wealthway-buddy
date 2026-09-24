import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getFundDriveStatus, syncFundDrive } from "@/lib/drive.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const LABEL: Record<string, string> = {
  active: "Connected",
  needs_attention: "Needs attention",
  conflict: "Conflict — review",
  pending: "Pending",
  archived: "Archived",
};

export function DriveStatusCard({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundDriveStatus);
  const sync = useServerFn(syncFundDrive);
  const qc = useQueryClient();
  const [linkId, setLinkId] = useState("");
  const query = useQuery({ queryKey: ["fund-drive", offeringId], queryFn: () => load({ data: { offeringId } }), retry: false });
  const mutation = useMutation({
    mutationFn: (link?: string) => sync({ data: { offeringId, ...(link ? { linkFolderId: link } : {}) } }),
    onSuccess: (r) => {
      if (r.status === "active") toast.success("Google Drive folders are ready.");
      else toast.error(r.error ?? "Google Drive needs attention.");
      setLinkId("");
      void qc.invalidateQueries({ queryKey: ["fund-drive", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not sync Google Drive."),
  });

  if (query.isError) return null;
  const d = query.data;
  const fund = d?.fund;
  const status = fund?.status ?? "not_set_up";
  const attention = status === "needs_attention" || status === "conflict";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Google Drive</CardTitle>
          <Badge variant={status === "active" ? "default" : attention ? "destructive" : "secondary"}>
            {LABEL[status] ?? "Not set up"}
          </Badge>
        </div>
        <CardDescription>
          {query.isLoading
            ? "Checking…"
            : fund?.last_error
              ? fund.last_error
              : d?.enabled
                ? `${d.investors.length} investor folder${d.investors.length === 1 ? "" : "s"}. Executed documents file automatically.`
                : "Not set up for this fund yet. Tax forms are never filed to Drive."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {fund?.url && (
          <Button asChild size="sm" variant="outline">
            <a href={fund.url} target="_blank" rel="noopener noreferrer">Open Fund Folder</a>
          </Button>
        )}
        {d?.canSync && (
          <Button size="sm" onClick={() => mutation.mutate(undefined)} disabled={mutation.isPending}>
            {status === "not_set_up" ? "Create Google Drive Structure" : attention ? "Retry" : "Sync Google Drive Structure"}
          </Button>
        )}
        {d?.canSync && status === "conflict" && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Input
              value={linkId}
              onChange={(e) => setLinkId(e.target.value.trim())}
              placeholder="Existing folder ID to link"
              className="h-9 w-full sm:w-64"
            />
            <Button size="sm" variant="outline" disabled={!linkId || mutation.isPending} onClick={() => mutation.mutate(linkId)}>
              Link existing folder
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
