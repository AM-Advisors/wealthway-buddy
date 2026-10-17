import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { downloadMyTaxDocument, startTaxDocumentStepUp } from "@/lib/portal-documents.functions";
import { checkTrustedDeviceFn, rememberThisDeviceFn, requestMfaEmailCodeFn } from "@/lib/mfa-ease.functions";

/**
 * Download with step-up. Three ways to pass the fresh check:
 *  - a remembered device (30 days) skips the prompt entirely;
 *  - a fresh authenticator code (the device is then remembered);
 *  - a single-use emailed code, for someone locked out of their authenticator app.
 */
const TOKEN_KEY = "hm-mfa-trusted-token";

function storedToken(userId: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "{}");
    return typeof map[userId] === "string" ? (map[userId] as string) : null;
  } catch {
    return null;
  }
}

function storeToken(userId: string, token: string) {
  try {
    const map = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "{}");
    map[userId] = token;
    localStorage.setItem(TOKEN_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable - the person just gets asked again next time */
  }
}

function currentDeviceId(): string | undefined {
  try {
    let id = localStorage.getItem("hm-device-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("hm-device-id", id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function TaxDocumentDownload({ documentId, label }: { documentId: string; label: string }) {
  const startFn = useServerFn(startTaxDocumentStepUp);
  const downloadFn = useServerFn(downloadMyTaxDocument);
  const checkTrusted = useServerFn(checkTrustedDeviceFn);
  const rememberFn = useServerFn(rememberThisDeviceFn);
  const emailCodeFn = useServerFn(requestMfaEmailCodeFn);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"authenticator" | "email">("authenticator");
  const [emailSent, setEmailSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function userId(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    } catch {
      return null;
    }
  }

  async function startAndDownload(proof: { trustedDeviceToken?: string; emailCode?: string }) {
    const { stepUpId } = await startFn({ data: { documentId, ...proof } });
    const res: any = await downloadFn({ data: { documentId, stepUpId } });
    if (!res?.ok) { toast.error(res?.message ?? "This document is unavailable."); return false; }
    const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType }));
    const a = document.createElement("a");
    a.href = url; a.download = res.fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setOpen(false); setCode(""); setEmailSent(false); setMode("authenticator");
    return true;
  }

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
      // Successful authenticator check: remember this device for 30 days (best effort).
      const uid = await userId();
      if (uid) {
        try {
          const r = await rememberFn({ data: { deviceId: currentDeviceId() } });
          if (r?.token) storeToken(uid, r.token);
        } catch { /* remembering never blocks the download */ }
      }
      await startAndDownload({});
    } catch (e: any) {
      toast.error(String(e?.message ?? "Not available.").replace(/^Forbidden:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  async function goWithEmailCode() {
    setBusy(true);
    try {
      await startAndDownload({ emailCode: code.trim() });
    } catch (e: any) {
      toast.error(String(e?.message ?? "Not available.").replace(/^Forbidden:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailCode() {
    setBusy(true);
    try {
      await emailCodeFn({ data: { purpose: "tax_document" } });
      setEmailSent(true);
      setCode("");
      toast.success("Code sent - check your email (it expires in 10 minutes).");
    } catch (e: any) {
      toast.error(String(e?.message ?? "Couldn't send the code."));
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    setOpen(true);
    setMode("authenticator");
    // A remembered device skips the code prompt entirely.
    const uid = await userId();
    const token = uid ? storedToken(uid) : null;
    if (!token) return;
    try {
      const r = await checkTrusted({ data: { token } });
      if (!r?.trusted) return;
      setBusy(true);
      try {
        if (await startAndDownload({ trustedDeviceToken: token })) setOpen(false);
      } catch (e: any) {
        toast.error(String(e?.message ?? "Not available.").replace(/^Forbidden:\s*/, ""));
      } finally {
        setBusy(false);
      }
    } catch { /* fall back to the prompt */ }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => void open()}>Download</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm it's you</DialogTitle>
            <DialogDescription>
              Tax documents need a fresh two-step check. ({label})
            </DialogDescription>
          </DialogHeader>
          {mode === "authenticator" ? (
            <div className="space-y-2">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code from your authenticator app"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
              />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button onClick={go} disabled={busy}>{busy ? "Checking…" : "Confirm and download"}</Button>
              </DialogFooter>
              <Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={() => void sendEmailCode()}>
                Locked out of your app? Email me a code instead
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {!emailSent ? (
                <Button className="w-full" disabled={busy} onClick={() => void sendEmailCode()}>
                  {busy ? "Sending…" : "Send a code to my email"}
                </Button>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Enter the 6-digit code we just emailed you.</p>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                  />
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button onClick={goWithEmailCode} disabled={busy || code.trim().length !== 6}>
                      {busy ? "Checking…" : "Confirm and download"}
                    </Button>
                  </DialogFooter>
                </>
              )}
              <Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={() => setMode("authenticator")}>
                Use my authenticator app instead
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
