import { useState } from "react";

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { managerDestination } from "@/lib/post-signin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/manager-login")({
  head: () => ({
    meta: [
      { title: "Fund Manager Sign In — Harmonious" },
      {
        name: "description",
        content:
          "Fund managers sign in here to review investors, fund documents and wire approvals for the Harmonious funds they manage.",
      },
      { property: "og:title", content: "Fund Manager Sign In — Harmonious" },
      {
        property: "og:description",
        content: "Access the Harmonious fund manager panel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerLoginPage,
});

function ManagerLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function routeReviewer(userId: string) {
    const to = await managerDestination(userId);
    if (!to) {
      await supabase.auth.signOut();
      toast.error("This account is not a fund manager. Please use the investor sign-in.");
      return;
    }
    navigate({ to: to as never });
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
      if (data.user) await routeReviewer(data.user.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const address = email.trim();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: address,
        password,
      });
      if (error) throw error;
      void recordAttempt(address, true);
      if (data.user) await routeReviewer(data.user.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      void recordAttempt(address, false, message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-16">
      <div className="mx-auto w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Harmonious</p>
        <h1 className="mt-2 text-3xl">Fund manager sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          For fund managers and Harmonious staff. Investors should use the investor sign-in.
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
            <Label htmlFor="manager-email">Email</Label>
            <Input
              id="manager-email"
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
              <Label htmlFor="manager-password">Password</Label>
              <Link to="/auth/forgot" className="text-xs text-muted-foreground hover:underline">
                Set or reset your password
              </Link>
            </div>
            <Input
              id="manager-password"
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
          Investor?{" "}
          <Link to="/auth" className="font-medium text-foreground hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </main>
  );
}
