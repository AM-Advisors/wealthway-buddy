import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { newTabSigningUrl } from "@/lib/sign-window-url";
import { prefersNewTab, RESCUE_AFTER_MS, RETURN_CHECK_DELAYS_MS } from "@/lib/signing-window";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  refreshSigningState,
  startSigningSession,
} from "@/lib/document-signing.functions";
import {
  EXECUTION_LABELS,
  investorSignCardStatus,
  type ExecutionState,
  type PublicSigner,
} from "@/lib/document-signing";

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
  approvalLabel?: string;
  /** Opened from a Sign now link: show one large button that opens the full signing page in a tab. */
  autoStart?: boolean;
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
 * ceremony in a large pop-out; we never mark anything signed ourselves -
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
  approvalLabel,
  autoStart,
}: Props) {
  const queryClient = useQueryClient();
  const start = useServerFn(startSigningSession);
  const refresh = useServerFn(refreshSigningState);

  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);
  // "tab": the document is open in its own tab (Safari, or after Open in a new tab).
  const [mode, setMode] = useState<"embed" | "tab">("embed");
  const [rescue, setRescue] = useState(false);
  const [awaitingReturn, setAwaitingReturn] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const returnCheckRunning = useRef(false);

  const state: ExecutionState = signing?.state ?? "not_sent";
  const executed = state === "executed";
  const cardStatus = investorSignCardStatus({
    requiresSignature,
    state: signing?.state,
    yourStatus: signing?.yourStatus,
  });
  // This person already signed; the agreement is waiting on someone else.
  const awaitingOthers = cardStatus === "awaiting_others";
  const scope = offeringId ? { offering_id: offeringId } : {};
  const tabUrl = newTabSigningUrl(url);

  function resetWindow() {
    setOpen(false);
    setUrl(null);
    setMode("embed");
    setRescue(false);
    setAwaitingReturn(false);
    setNotYet(false);
  }

  async function openSession(forceTab = false) {
    // Safari blocks this signing window inside another page, so open a tab right away.
    // The tab must be opened during the click itself or the browser blocks it.
    let tab: Window | null = null;
    if (forceTab || prefersNewTab(typeof navigator === "undefined" ? "" : navigator.userAgent)) {
      tab = window.open("", "_blank");
      try {
        if (tab) {
          tab.opener = null;
          tab.document.title = title;
          tab.document.body.innerHTML = '<p style="font:18px system-ui,sans-serif;padding:32px">Opening your document…</p>';
        }
      } catch {
        /* the tab still navigates below */
      }
    }
    setOpening(true);
    try {
      const res = await start({
        data: { offering_document_id: documentId, ...scope },
      });
      const full = newTabSigningUrl(res.signingUrl);
      setUrl(res.signingUrl);
      setRescue(false);
      setNotYet(false);
      if (tab && !tab.closed && full) {
        tab.location.href = full;
        setMode("tab");
        setAwaitingReturn(true);
      } else {
        if (tab && !tab.closed) tab.close();
        setMode("embed");
      }
      setOpen(true);
      window.__lovableEvents?.track?.("project.document_opened", { document_kind: "signing_document", evidence: "signing_session_ready" });
    } catch (err) {
      if (tab && !tab.closed) tab.close();
      toast.error(err instanceof Error ? err.message : "Could not open the signing session.");
    } finally {
      setOpening(false);
    }
  }

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["signing-states"] });
    await queryClient.invalidateQueries({ queryKey: ["documents-step"] });
  }

  async function closeSession() {
    resetWindow();
    setChecking(true);
    try {
      // Authoritative: the signature counts only if the signing service says it was signed.
      const res = await refresh({ data: { offering_document_id: documentId, ...scope } });
      if (res.state === "executed" || res.youSigned) toast.success(`${title} signed.`);
      await invalidate();
    } catch {
      // Silent: the webhook records completion regardless of this check.
    } finally {
      setChecking(false);
    }
  }

  /** After the person comes back from the signing tab: check (a few times) whether they signed. */
  const checkOnReturn = useCallback(async () => {
    if (returnCheckRunning.current) return;
    returnCheckRunning.current = true;
    setChecking(true);
    try {
      for (const delay of RETURN_CHECK_DELAYS_MS) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        const res = await refresh({ data: { offering_document_id: documentId, ...scope } }).catch(() => null);
        if (res && (res.state === "executed" || res.youSigned)) {
          toast.success(`${title} signed. Your signature is recorded.`);
          resetWindow();
          await invalidate();
          return;
        }
      }
      setNotYet(true);
    } finally {
      returnCheckRunning.current = false;
      setChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, offeringId, title]);

  // Auto-record on return from the signing tab.
  useEffect(() => {
    if (!open || !awaitingReturn) return;
    let left = document.visibilityState === "hidden";
    const onVisibility = () => {
      if (document.visibilityState === "hidden") left = true;
      else if (left) {
        left = false;
        void checkOnReturn();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [open, awaitingReturn, checkOnReturn]);

  // Blank-window rescue: if the signing service hasn't seen the document load, offer a new tab.
  useEffect(() => {
    if (!open || mode !== "embed" || !url) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await refresh({ data: { offering_document_id: documentId, ...scope } }).catch(() => null);
      if (cancelled) return;
      if (res && (res.state === "executed" || res.youSigned)) return;
      if (!res || !res.viewed) setRescue(true);
    }, RESCUE_AFTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, url, documentId, offeringId]);

  function openedInTab() {
    setAwaitingReturn(true);
    setNotYet(false);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
                {executed || awaitingOthers ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden />
                )}
              </div>
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">{title}</CardTitle>
                <CardDescription>
                  {executed ? (
                    <>
                      Signed {formatWhen(signing?.signedAt ?? null)}
                      {signing?.signerName ? ` by ${signing.signerName}` : ""}
                      {signing?.signerCapacityLabel &&
                      signing.signerCapacityLabel !== "Individual"
                        ? ` (${signing.signerCapacityLabel})`
                        : ""}
                    </>
                  ) : awaitingOthers ? (
                    "You signed this. Waiting for the remaining signatures, usually the fund manager's countersignature. Nothing more is needed from you."
                  ) : requiresSignature ? (
                    (signing?.stateLabel ?? EXECUTION_LABELS.not_sent)
                  ) : (
                    "Review only"
                  )}
                </CardDescription>
                {approvalLabel && <Badge variant="outline" className="mt-2">{approvalLabel}</Badge>}
              </div>
            </div>
            <Badge variant={executed ? "default" : requiresSignature ? "secondary" : "outline"}>
              {executed
                ? "Signed"
                : awaitingOthers
                  ? "Signed by you · awaiting countersignature"
                  : requiresSignature
                    ? "Signature required"
                    : "Review"}
            </Badge>
          </div>
        </CardHeader>

        {autoStart && requiresSignature && !executed && !awaitingOthers && (
          <CardContent>
            <div className="space-y-3 rounded-lg border-2 border-primary bg-primary/5 p-4">
              <p className="text-lg font-semibold">This is the document waiting for your signature.</p>
              <p className="text-base text-muted-foreground">It opens in a new tab. Sign there, then come back here and your signature is recorded automatically.</p>
              <Button type="button" size="lg" className="w-full text-base sm:w-auto" onClick={() => void openSession(true)} disabled={opening || checking}>
                {opening ? "Preparing…" : "Open document to sign"}
              </Button>
            </div>
          </CardContent>
        )}

        <CardContent className="flex flex-wrap items-center gap-2">
          {requiresSignature && !executed && !awaitingOthers && (
            <Button type="button" onClick={() => void openSession()} disabled={opening || checking}>
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
              {signing?.signers.map((s) => (
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
          className="flex max-h-none overflow-hidden h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 left-0 top-0 sm:left-[50%] sm:top-[50%] sm:h-[92vh] sm:w-[94vw] sm:max-w-[94vw] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg"
        >
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
            <div>
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="text-xs">Click each yellow Sign here tag, then choose Type, Draw or Upload for your signature.</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {tabUrl && mode === "embed" && (
                <Button asChild type="button" variant="outline" size="sm">
                  <a href={tabUrl} target="_blank" rel="noopener noreferrer" onClick={openedInTab}>
                    <ExternalLink className="mr-1 h-4 w-4" aria-hidden /> Open in a new tab
                  </a>
                </Button>
              )}
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

          <div className="relative min-h-0 flex-1 bg-muted/30">
            {mode === "tab" && tabUrl ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md space-y-4 text-center">
                  <ExternalLink className="mx-auto h-10 w-10 text-primary" aria-hidden />
                  <p className="text-xl font-semibold">Your document opened in a new tab</p>
                  <p className="text-base text-muted-foreground">
                    Sign it there. When you come back to this page, we check with the signing service and
                    record your signature automatically.
                  </p>
                  {checking && <p className="text-base">Checking your signature…</p>}
                  {notYet && !checking && (
                    <p className="text-base">
                      We haven&apos;t received your signature yet. If you just finished, wait a moment and press Done.
                    </p>
                  )}
                  <Button asChild size="lg" className="w-full text-base">
                    <a href={tabUrl} target="_blank" rel="noopener noreferrer" onClick={openedInTab}>
                      <ExternalLink className="mr-2 h-5 w-5" aria-hidden /> Open the document again
                    </a>
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => { setMode("embed"); setRescue(false); }}>
                    Show it on this page instead
                  </Button>
                </div>
              </div>
            ) : url ? (
              <>
                {rescue && tabUrl && (
                  <div role="alert" className="absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-3 border-b bg-background p-4 text-center shadow-md sm:flex-row sm:justify-between sm:text-left">
                    <div>
                      <p className="text-lg font-semibold">Is the document blank?</p>
                      <p className="text-base text-muted-foreground">Some browsers block it here. Open it in a new tab to sign.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild size="lg" className="text-base">
                        <a href={tabUrl} target="_blank" rel="noopener noreferrer" onClick={() => { openedInTab(); setMode("tab"); }}>
                          <ExternalLink className="mr-2 h-5 w-5" aria-hidden /> Open in a new tab
                        </a>
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setRescue(false)}>
                        It&apos;s showing
                      </Button>
                    </div>
                  </div>
                )}
                <iframe
                  title={`${title} · review and sign`}
                  src={url}
                  className="h-full w-full border-0"
                  allow="clipboard-write; fullscreen"
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading the document…
              </div>
            )}
          </div>

          <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t bg-background px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Your signature is recorded securely and confirmed by Harmonious. Closing this
              window does not sign the agreement. If the document stays blank, press Open in a new
              tab and sign there. When you come back, your signature is recorded automatically.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={opening || checking}
                onClick={async () => {
                  // Re-checks Box first; a failed request is replaced with a fresh one.
                  await closeSession();
                  await openSession();
                }}
              >
                Try again
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void closeSession()}>
                Done
              </Button>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
