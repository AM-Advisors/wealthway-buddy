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
  connected: "Connected",
  not_connected: "Not Connected",
  needs_attention: "Needs Attention",
  permission_review: "Permission Review",
  archived: "Archived",
};

function Row({ title, status, note, url, openLabel }: { title: string; status: string; note: string; url: string | null; openLabel: string }) {
  const bad = status === "needs_attention" || status === "permission_review";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status === "connected" ? "default" : bad ? "destructive" : "secondary"}>{LABEL[status] ?? status}</Badge>
        {url && (
          <Button asChild size="sm" variant="outline">
            <a href={url} target="_blank" rel="noopener noreferrer">{openLabel}</a>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Fund 360 → Google Drive. Two separate repositories, shown without technical IDs. */
export function DriveStatusCard({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundDriveStatus);
  const sync = useServerFn(syncFundDrive);
  const qc = useQueryClient();
  const [linkId, setLinkId] = useState("");
  const query = useQuery({ queryKey: ["fund-drive", offeringId], queryFn: () => load({ data: { offeringId } }), retry: false });
  const mutation = useMutation({
    mutationFn: (link?: string) => sync({ data: { offeringId, ...(link ? { linkFolderId: link } : {}) } }),
    onSuccess: (r) => {
      if (r.status === "active") toast.success("Fund Records folder is ready.");
      else toast.error(r.error ?? "Google Drive needs attention.");
      setLinkId("");
      void qc.invalidateQueries({ queryKey: ["fund-drive", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not sync Google Drive."),
  });

  if (query.isError) return null;
  const d = query.data;
  const fundStatus = d?.fundRecords.status ?? "not_connected";
  const inv = d?.investorRecords;
  const conflict = d?.fund?.status === "conflict";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Google Drive</CardTitle>
        <CardDescription>
          {query.isLoading ? "Checking…" : "Fund and investor records are kept in separate places. Tax forms and identity evidence never go to Drive."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row
          title="Fund Records"
          status={fundStatus}
          note={d?.fundRecords.error ?? "Approved fund-level documents."}
          url={d?.fundRecords.url ?? null}
          openLabel="Open Fund Folder"
        />
        <Row
          title="Investor Records"
          status={inv?.status ?? "not_connected"}
          note={
            inv?.status === "permission_review"
              ? "Investor Drive filing unavailable — repository permissions require review."
              : inv?.error ?? (inv?.status === "connected" ? `${inv.folders} investor folder${inv.folders === 1 ? "" : "s"}. Executed documents file automatically.` : "Kept in a separate restricted drive. Not set up yet.")
          }
          url={inv?.url ?? null}
          openLabel="Open Investor Records"
        />
        {d?.canSync && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => mutation.mutate(undefined)} disabled={mutation.isPending}>
              {fundStatus === "not_connected" ? "Create Fund Records Folder" : fundStatus === "needs_attention" ? "Retry" : "Sync Fund Records"}
            </Button>
            {conflict && (
              <>
                <Input value={linkId} onChange={(e) => setLinkId(e.target.value.trim())} placeholder="Existing folder ID to link" className="h-9 w-full sm:w-64" />
                <Button size="sm" variant="outline" disabled={!linkId || mutation.isPending} onClick={() => mutation.mutate(linkId)}>
                  Link existing folder
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
