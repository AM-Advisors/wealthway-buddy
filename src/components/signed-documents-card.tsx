import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getFundSignedDocuments } from "@/lib/manager.functions";
import { getSignedDocumentUrl } from "@/lib/documents.functions";
import { archiveSignedDocument } from "@/lib/box-sign.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const when = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Signed copies for one fund, with their Box filing status. */
export function SignedDocumentsCard({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundSignedDocuments);
  const signedUrl = useServerFn(getSignedDocumentUrl);
  const archiveToBox = useServerFn(archiveSignedDocument);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["fund-signed-documents", offeringId],
    queryFn: () => load({ data: { offeringId } }),
    refetchInterval: 30000,
  });

  const openMutation = useMutation({
    mutationFn: (signatureId: string) => signedUrl({ data: { signature_id: signatureId } }),
    onSuccess: (res: any) => {
      if (res?.url) window.open(res.url, "_blank", "noopener");
      else toast.error("That signed copy is not available yet.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open the signed copy."),
  });

  const archiveMutation = useMutation({
    mutationFn: (signatureId: string) => archiveToBox({ data: { signature_id: signatureId } }),
    onSuccess: () => {
      toast.success("Filed in Box.");
      void queryClient.invalidateQueries({ queryKey: ["fund-signed-documents", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not file this copy in Box."),
  });

  const data = query.data as any;
  const documents: any[] = data?.documents ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signed documents</CardTitle>
        <CardDescription>
          {query.isLoading
            ? "Loading signed copies…"
            : documents.length === 0
              ? "No documents have been signed in this fund yet."
              : `${documents.length} signed copy${documents.length === 1 ? "" : " records"} · ${data.inBox} filed in Box${
                  data.awaiting ? ` · ${data.awaiting} awaiting signature` : ""
                }`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.map((doc: any) => (
          <div
            key={doc.signatureId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm">
                {doc.title} · {doc.investorName}
              </p>
              <p className="text-xs text-muted-foreground">
                {doc.pending ? `sent for signature ${when(doc.signedAt)}` : `signed ${when(doc.signedAt)}`}
                {doc.inBox ? ` · filed in Box ${when(doc.boxUploadedAt)}` : ""}
                {doc.boxError ? ` · Box error: ${doc.boxError}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {doc.pending ? (
                <Badge variant="outline">Awaiting signature</Badge>
              ) : doc.inBox ? (
                <Badge variant="default">In Box</Badge>
              ) : (
                <Badge variant="secondary">Not in Box yet</Badge>
              )}
              {!doc.pending && doc.hasPdf && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openMutation.mutate(doc.signatureId)}
                  disabled={openMutation.isPending}
                >
                  Open
                </Button>
              )}
              {!doc.pending && !doc.inBox && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => archiveMutation.mutate(doc.signatureId)}
                  disabled={archiveMutation.isPending}
                >
                  File in Box
                </Button>
              )}
              <Button asChild size="sm" variant="ghost">
                <Link to="/manager/$applicationId" params={{ applicationId: doc.applicationId }}>
                  Review
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
