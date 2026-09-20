import { useEffect, useState } from "react";

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { consumeOAuthReturnError, startGoogleOAuth } from "@/lib/google-oauth";

import { useAuth } from "@/hooks/useAuth";
import { destinationAfterSignIn, intendedPathFromLocation } from "@/lib/post-signin";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/client-login")({
  head: () => ({
    meta: [
      { title: "Client Sign In — Harmonious Portal" },
      {
        name: "description",
        content:
          "Sign in with your own credentials to your Harmonious client portal: your funds, statement of work, invoices and payments.",
      },
      { property: "og:title", content: "Client Sign In — Harmonious Portal" },
      {
        property: "og:description",
        content: "Access your funds, statement of work, invoices and payments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientLoginPage,
});

function ClientLoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    let active = true;
    (async () => {
      // The server decides where this person belongs — the sign-in page never does.
      const intended =
        typeof window === "undefined" ? null : intendedPathFromLocation(window.location.search);
      const to = await destinationAfterSignIn(session.user.id, intended);
      if (active) navigate({ to: to as never, replace: true });
    })();
    return () => {
      active = false;
    };
  }, [loading, session, navigate]);

  async function recordAttempt(address: string, success: boolean, reason?: string) {
    try {
      await fetch("/api/public/login-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, success, reason }),
      });
    } catch {
      /* logging must never block sign-in */
    }
  }

  useEffect(() => {
    const message = consumeOAuthReturnError();
    if (message) toast.error(message);
  }, []);

  async function signInWithGoogle() {
    setBusy(true);
    const errorMessage = await startGoogleOAuth("/client-login");
    if (errorMessage) {
      void recordAttempt("google-oauth", false, errorMessage);
      toast.error(errorMessage);
      setBusy(false);
    }
    // Otherwise the browser is redirecting to Google; the session listener
    // above routes signed-in clients to their portal once we're back.
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const address = email.trim();
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password });
      if (error) throw error;
      void recordAttempt(address, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      void recordAttempt(address, false, message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      heading="Your fund, administered in one place."
      blurb="Sign in to see your funds, agreements, invoices and payments, and to ask us for anything outside your current scope."
      points={[
        "Each person on your team signs in separately",
        "Every approval recorded under their own name",
        "Documents and wire details kept private to your engagement",
      ]}
    >
      <div>
        <h1 className="text-3xl">Client sign in</h1>
        <p className="mt-2 text-muted-foreground">
          Use your own email and password — each person on your team signs in separately, and every
          action is recorded under their own name.
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-8 w-full"
          disabled={busy}
          onClick={signInWithGoogle}
        >
          Continue with Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or use your email
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              autoComplete="email"
              required
              maxLength={255}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="client-password">Password</Label>
              <Link to="/auth/forgot" className="text-xs text-muted-foreground hover:underline">
                Forgot your password?
              </Link>
            </div>
            <Input
              id="client-password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : "Sign in to my portal"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          Were you invited by Harmonious?{" "}
          <Link to="/auth/register" className="font-medium text-foreground hover:underline">
            Create your account
          </Link>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Part of the Harmonious team?{" "}
          <Link to="/auth" className="font-medium text-foreground hover:underline">
            Staff sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
