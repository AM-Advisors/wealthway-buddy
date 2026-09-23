import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileText, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  refreshSigningState,
  startSigningSession,
} from "@/lib/document-signing.functions";
import { EXECUTION_LABELS, type ExecutionState, type PublicSigner } from "@/lib/document-signing";

export interface DocumentSigningState {
  documentId: string;
  signatureId: string;
  state: ExecutionState;
  stateLabel: string;
  signers: PublicSigner[];
  yourStatus: string;
  youMustSign: boolean;
  signedAt: string | null;
  signerName: string | null;
  signerCapacityLabel: string;
  signedDocumentAvailable: boolean;
}

interface Props {
  documentId: string;
  title: string;
  requiresSignature: boolean;
  offeringId?: string | undefined;
  signing: DocumentSigningState | undefined;
  /** Downloads the agreement itself (unsigned or signed, as available). */
  onDownload: () => void;
  onDownloadSigned?: (() => void) | undefined;
  downloading?: boolean;
}

function formatWhen(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The document card an investor sees. Signing happens inside Box's own
 * ceremony in a large pop-out; we never mark anything signed ourselves —
 * closing the window just asks Box what actually happened.
 */
export function DocumentSignCard({
  documentId,
  title,
  requiresSignature,
  offeringId,
  signing,
  onDownload,
  onDownloadSigned,
  downloading,
}: Props) {
  const queryClient = useQueryClient();
  const start = useServerFn(startSigningSession);
  const refresh = useServerFn(refreshSigningState);

  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);

  const state: ExecutionState = signing?.state ?? "not_sent";
  const executed = state === "executed";
  const scope = offeringId ? { offering_id: offeringId } : {};

  async function openSession() {
    setOpening(true);
    try {
      const res = await start({
        data: { offering_document_id: documentId, ...scope },
      });
      setUrl(res.signingUrl);
      setOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the signing session.");
    } finally {
      setOpening(false);
    }
  }

  async function closeSession() {
    setOpen(false);
    setUrl(null);
    setChecking(true);
    try {
      // Authoritative: the signature counts only if Box says it was signed.
      const res = await refresh({ data: { offering_document_id: documentId, ...scope } });
      if (res.state === "executed") toast.success(`${title} signed.`);
      await queryClient.invalidateQueries({ queryKey: ["signing-states"] });
      await queryClient.invalidateQueries({ queryKey: ["documents-step"] });
    } catch {
      // Silent: the webhook records completion regardless of this check.
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
                {executed ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden />
                )}
              </div>
              <div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>
                  {executed ? (
                    <>
                      Signed {formatWhen(signing?.signedAt)}
                      {signing?.signerName ? ` by ${signing.signerName}` : ""}
                      {signing?.signerCapacityLabel &&
                      signing.signerCapacityLabel !== "Individual"
                        ? ` (${signing.signerCapacityLabel})`
                        : ""}
                    </>
                  ) : requiresSignature ? (
                    (signing?.stateLabel ?? EXECUTION_LABELS.not_sent)
                  ) : (
                    "Review only"
                  )}
                </CardDescription>
              </div>
            </div>
            <Badge variant={executed ? "default" : requiresSignature ? "secondary" : "outline"}>
              {executed ? "Signed" : requiresSignature ? "Signature required" : "Review"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-wrap items-center gap-2">
          {requiresSignature && !executed && (
            <Button type="button" onClick={openSession} disabled={opening || checking}>
              {opening ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Preparing…
                </>
              ) : (
                "Review & Sign"
              )}
            </Button>
          )}

          {executed && onDownloadSigned && (
            <>
              <Button type="button" onClick={onDownloadSigned}>
                View signed agreement
              </Button>
              <Button type="button" variant="outline" onClick={onDownloadSigned}>
                Download signed PDF
              </Button>
            </>
          )}

          <Button type="button" variant="ghost" onClick={onDownload} disabled={downloading}>
            {downloading ? "Preparing…" : "Download PDF"}
          </Button>

          {checking && (
            <span className="text-xs text-muted-foreground">Checking signature status…</span>
          )}
        </CardContent>

        {(signing?.signers.length ?? 0) > 1 && (
          <CardContent className="border-t pt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Required signers</p>
            <ul className="mt-2 space-y-1 text-sm">
              {signing!.signers.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {s.name} · {s.capacityLabel}
                  </span>
                  <span className="text-muted-foreground">{s.statusLabel}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : void closeSession())}>
        <DialogContent
          className="flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 left-0 top-0 sm:left-[50%] sm:top-[50%] sm:h-[92vh] sm:w-[94vw] sm:max-w-[94vw] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg"
        >
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
            <div>
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="text-xs">Review and sign</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onDownload}>
                Download
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-6"
                onClick={() => void closeSession()}
              >
                <X className="mr-1 h-4 w-4" aria-hidden /> Close
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 bg-muted/30">
            {url ? (
              <iframe
                title={`${title} — review and sign`}
                src={url}
                className="h-full w-full border-0"
                allow="clipboard-write; fullscreen"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading the document…
              </div>
            )}
          </div>

          <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t bg-background px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Your signature is recorded by Box and confirmed back to Harmonious. Closing this
              window does not sign the agreement.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void closeSession()}>
              Done
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
