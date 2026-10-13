import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { downloadMyTaxDocument, startTaxDocumentStepUp } from "@/lib/portal-documents.functions";

/**
 * Download with step-up: the person re-confirms their two-step factor right before
 * the download; the server checks it is fresh and issues a single-use approval.
 */
export function TaxDocumentDownload({ documentId, label }: { documentId: string; label: string }) {
  const startFn = useServerFn(startTaxDocumentStepUp);
  const downloadFn = useServerFn(downloadMyTaxDocument);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function reverify(): Promise<boolean> {
    const { data } = await supabase.auth.mfa.listFactors();
    const all = ((data as any)?.all ?? []) as any[];
    const totp = all.find((f) => f.factor_type === "totp" && f.status === "verified");
    const passkey = all.find((f) => f.factor_type === "webauthn" && f.status === "verified");
    if (!code.trim() && passkey) {
      const { error } = await (supabase.auth.mfa as any).webauthn.authenticate({ factorId: passkey.id });
      if (error) { toast.error("Passkey check failed."); return false; }
      return true;
    }
    if (!totp) { toast.error("Set up two-step verification first."); return false; }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
    if (error) { toast.error("That code is not correct."); return false; }
    return true;
  }

  async function go() {
    setBusy(true);
    try {
      if (!(await reverify())) return;
      const { stepUpId } = await startFn({ data: { documentId } });
      const res: any = await downloadFn({ data: { documentId, stepUpId } });
      if (!res?.ok) { toast.error(res?.message ?? "This document is unavailable."); return; }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType }));
      const a = document.createElement("a");
      a.href = url; a.download = res.fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setOpen(false); setCode("");
    } catch (e: any) {
      toast.error(String(e?.message ?? "Not available.").replace(/^Forbidden:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Download</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm it's you</DialogTitle>
            <DialogDescription>
              Tax documents need a fresh two-step check. Enter the code from your authenticator app, or leave it empty to use your passkey. ({label})
            </DialogDescription>
          </DialogHeader>
          <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
          <DialogFooter>
            <Button onClick={go} disabled={busy}>{busy ? "Checking…" : "Confirm and download"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
