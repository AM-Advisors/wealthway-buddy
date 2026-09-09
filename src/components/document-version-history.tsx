import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDocumentVersionUrl,
  listDocumentVersions,
  refreshTemplateDocuments,
  restoreDocumentVersion,
} from "@/lib/document-versions.functions";

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceLabel(source: string) {
  if (source === "template") return "From template";
  if (source === "restore") return "Restored";
  return "Uploaded";
}

/**
 * Shows every past file for a fund's legal documents, so a manager can see what
 * changed, download an earlier copy, put it back, or pull the latest templates.
 */
export function DocumentVersionHistory({ offeringId }: { offeringId: string }) {
  const load = useServerFn(listDocumentVersions);
  const download = useServerFn(getDocumentVersionUrl);
  const restore = useServerFn(restoreDocumentVersion);
  const refresh = useServerFn(refreshTemplateDocuments);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["document-versions", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["document-versions", offeringId] });
    void queryClient.invalidateQueries({ queryKey: ["managed-fund-documents"] });
    void queryClient.invalidateQueries({ queryKey: ["fund-legal-documents"] });
  };

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => restore({ data: { version_id: versionId } }),
    onMutate: (id) => setBusy(id),
    onSettled: () => setBusy(null),
    onSuccess: () => {
      toast.success("That version is live for investors again.");
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not restore that version."),
  });

  const refreshMutation = useMutation({
    mutationFn: (pack: "ilpa" | "spv") => refresh({ data: { offering_id: offeringId, pack } }),
    onMutate: (pack) => setBusy(pack),
    onSettled: () => setBusy(null),
    onSuccess: (res: any) => {
      const updated = res?.updated ?? [];
      if (updated.length === 0) toast.info("Nothing on this fund came from that set.");
      else toast.success(`Updated ${updated.length} document${updated.length === 1 ? "" : "s"}.`);
      invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update those documents."),
  });

  const openVersion = async (versionId: string) => {
    try {
      setBusy(versionId);
      const res: any = await download({ data: { version_id: versionId } });
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that file.");
    } finally {
      setBusy(null);
    }
  };

  const versions = (query.data as any)?.versions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Version history</CardTitle>
        <CardDescription>
          Every file this fund has published, newest first. Earlier copies stay downloadable, so you
          can update a document later and still show what investors saw before.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "ilpa" || refreshMutation.isPending}
            onClick={() => refreshMutation.mutate("ilpa")}
          >
            Update ILPA documents to the latest
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "spv" || refreshMutation.isPending}
            onClick={() => refreshMutation.mutate("spv")}
          >
            Update SPV documents to the latest
          </Button>
        </div>

        {query.isLoading && <p className="text-sm text-muted-foreground">Loading history…</p>}
        {!query.isLoading && versions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No files yet. Add a template pack or upload a document and its first version appears
            here.
          </p>
        )}

        <div className="space-y-2">
          {versions.map((v: any) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {v.document_title}{" "}
                  <span className="text-muted-foreground">· version {v.version}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {sourceLabel(v.source)} by {v.created_by_name} ·{" "}
                  {new Date(v.created_at).toLocaleString()}
                  {v.file_name ? ` · ${v.file_name}` : ""}
                  {formatSize(v.file_size_bytes) ? ` · ${formatSize(v.file_size_bytes)}` : ""}
                </p>
                {v.note && <p className="mt-1 text-xs text-muted-foreground">{v.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                {v.is_current && <Badge variant="secondary">Live now</Badge>}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === v.id}
                  onClick={() => void openVersion(v.id)}
                >
                  Open
                </Button>
                {!v.is_current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === v.id || restoreMutation.isPending}
                    onClick={() => restoreMutation.mutate(v.id)}
                  >
                    Put back
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
