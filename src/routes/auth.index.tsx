import { useEffect, useState } from "react";

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { destinationAfterSignIn } from "@/lib/post-signin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/")({
  head: () => ({
    meta: [
      { title: "Investor Sign In — Harmonious" },
      {
        name: "description",
        content:
          "Sign in to your Harmonious investor account to track your application, review fund documents and complete your subscription.",
      },
      { property: "og:title", content: "Investor Sign In — Harmonious" },
      { property: "og:description", content: "Access the Harmonious investor portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    let active = true;
    (async () => {
      const to = await destinationAfterSignIn(session.user.id);
      if (active) navigate({ to: to as never });
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

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      const { data } = await supabase.auth.getUser();
      if (data.user) navigate({ to: (await destinationAfterSignIn(data.user.id)) as never });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
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
    <div>
      <h1 className="text-3xl">Welcome back</h1>
      <p className="mt-2 text-muted-foreground">
        Sign in to pick up your application exactly where you left it.
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
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
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
            <Label htmlFor="password">Password</Label>
            <Link to="/auth/forgot" className="text-xs text-muted-foreground hover:underline">
              Forgot your password?
            </Link>
          </div>
          <Input
            id="password"
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
          {busy ? "Please wait…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Have an invitation?{" "}
        <Link to="/auth/register" className="font-medium text-foreground hover:underline">
          Create your account
        </Link>
      </p>
    </div>
  );
}
