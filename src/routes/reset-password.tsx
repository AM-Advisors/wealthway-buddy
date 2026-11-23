import { safeInternalPath } from "@/lib/app-origins";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRecoveryCode } from "@/lib/account-security.functions";
import { cleanAuthenticatorCode, isSecondStepRequiredError, resetSecondStep } from "@/lib/reset-password-mfa";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a New Password | Harmonious" },
      {
        name: "description",
        content: "Choose a new password for your Harmonious investor account.",
      },
      { property: "og:title", content: "Set a New Password | Harmonious" },
      { property: "og:description", content: "Choose a new password for your investor account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  // Email links carry a one-time code that is used only when the person presses Continue,
  // so company email scanners that open links on arrival can't use it up first.
  const [pending, setPending] = useState<string | null>(null);
  const [linkFailed, setLinkFailed] = useState(false);
  // Accounts with an authenticator app must enter its code before the password can change.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [backup, setBackup] = useState("");
  const useBackup = useServerFn(useRecoveryCode);

  async function checkSecondStep() {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: f, error } = await supabase.auth.mfa.listFactors();
      const verified = error || !f ? null : f.all.filter((x) => x.status === "verified").length;
      // If factors can't be read, the code box still appears if the save is refused (see submit).
      setNeedsCode(resetSecondStep({ currentLevel: aal?.currentLevel, verifiedFactorCount: verified }) === "needed");
    } catch {
      setNeedsCode(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get("token_hash");
    if (hash && params.get("type") === "recovery") { setPending(hash); return; }
    void supabase.auth.getSession().then(({ data }) => { if (data.session) void checkSecondStep(); });
  }, []);

  async function continueLink() {
    if (!pending) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ token_hash: pending, type: "recovery" });
      if (error) throw error;
      window.history.replaceState(null, "", "/reset-password");
      await checkSecondStep().catch(() => undefined);
      setPending(null);
    } catch {
      setLinkFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (pending || linkFailed) {
    return (
      <main className="paper-grid flex min-h-screen items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Logo variant="navy" className="mb-4 h-8 w-auto" />
            <CardTitle>{linkFailed ? "This link has already been used" : "Set your password"}</CardTitle>
            <CardDescription className="text-base">
              {linkFailed
                ? "Each link works once and expires after a while. Ask for a new one and use the newest email."
                : "Press Continue to choose your password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {linkFailed ? (
              <Button asChild className="w-full"><Link to="/auth/forgot">Send me a new link</Link></Button>
            ) : (
              <Button className="w-full" disabled={busy} onClick={continueLink}>{busy ? "Opening…" : "Continue"}</Button>
            )}
            <p className="mt-6 text-sm text-muted-foreground">
              <Link to="/auth" className="hover:underline">Back to sign in</Link>
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
    let cleanCode: string | null = null;
    if (needsCode) {
      cleanCode = cleanAuthenticatorCode(code);
      if (!cleanCode) {
        toast.error("Enter the 6-digit code from your authenticator app.");
        return;
      }
    }
    setBusy(true);
    try {
      if (needsCode && cleanCode) {
        const { data: f } = await supabase.auth.mfa.listFactors();
        const totp = f?.totp?.find((x) => x.status === "verified");
        if (!totp) {
          toast.error("We couldn't find your authenticator app. Use a backup code instead.");
          setShowBackup(true);
          return;
        }
        const { error: codeError } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: cleanCode });
        if (codeError) {
          toast.error("That code didn't match. Check your authenticator app and try again.");
          return;
        }
        setNeedsCode(false);
        setCode("");
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (isSecondStepRequiredError(error)) {
          setNeedsCode(true);
          toast.error("Your account uses an authenticator app. Enter its 6-digit code, then save again.");
          return;
        }
        throw error;
      }
      toast.success("Your password is updated.");
      const next = safeInternalPath(sessionStorage.getItem("harmonious_next"), "");
      sessionStorage.removeItem("harmonious_next");
      if (next) { window.location.assign(next); return; }
      navigate({ to: "/home" });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "We could not update your password. Request a fresh link and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitBackup() {
    setBusy(true);
    const r = await useBackup({ data: { code: backup.trim() } }).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) {
      toast.error("That backup code isn't valid.");
      return;
    }
    await supabase.auth.refreshSession().catch(() => undefined);
    setNeedsCode(false);
    setShowBackup(false);
    setBackup("");
    toast.success("Backup code accepted. Save your new password, then set up your authenticator app again.");
  }

  return (
    <main className="paper-grid flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Logo variant="navy" className="mb-4 h-8 w-auto" />
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            Choose a password you don't use anywhere else. You'll be signed in straight afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Repeat new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {needsCode && (
              <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                <Label htmlFor="auth-code" className="text-base">Authenticator code</Label>
                <p className="text-sm text-muted-foreground">
                  Your account uses an authenticator app. Open it and enter the 6-digit code for Harmonious.
                </p>
                <Input
                  id="auth-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={9}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="text-lg tracking-widest"
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
          {needsCode && (
            !showBackup ? (
              <Button variant="link" className="mt-2 w-full" onClick={() => setShowBackup(true)}>
                Lost your authenticator app? Use a backup code
              </Button>
            ) : (
              <div className="mt-4 space-y-2">
                <Label htmlFor="backup-code">Backup code</Label>
                <Input
                  id="backup-code"
                  autoComplete="one-time-code"
                  placeholder="XXXXX-XXXXX"
                  value={backup}
                  onChange={(e) => setBackup(e.target.value)}
                />
                <Button variant="outline" className="w-full" disabled={busy || backup.trim().length < 6} onClick={submitBackup}>
                  Use backup code
                </Button>
                <p className="text-xs text-muted-foreground">
                  Using a backup code removes your current authenticator app. You'll set up a new one after saving your password.
                </p>
              </div>
            )
          )}
          <p className="mt-6 text-sm text-muted-foreground">
            <Link to="/auth" className="hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
