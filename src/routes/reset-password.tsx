import { safeInternalPath } from "@/lib/app-origins";
import { useEffect, useState } from "react";

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get("token_hash");
    if (hash && params.get("type") === "recovery") setPending(hash);
  }, []);

  async function continueLink() {
    if (!pending) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ token_hash: pending, type: "recovery" });
      if (error) throw error;
      window.history.replaceState(null, "", "/reset-password");
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
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
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
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
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
