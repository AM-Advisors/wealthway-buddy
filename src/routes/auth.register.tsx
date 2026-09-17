import { useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { checkInviteEligibility } from "@/lib/portal-access.functions";

import { supabase } from "@/integrations/supabase/client";
import { consumeOAuthReturnError, startGoogleOAuth } from "@/lib/google-oauth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/register")({
  head: () => ({
    meta: [
      { title: "Create Your Investor Account — Harmonious" },
      {
        name: "description",
        content:
          "Create the Harmonious investor account that matches your fund invitation and begin your onboarding.",
      },
      { property: "og:title", content: "Create Your Investor Account — Harmonious" },
      {
        property: "og:description",
        content: "Register with the email address your fund invitation was sent to.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const checkEligibility = useServerFn(checkInviteEligibility);

  async function signUpWithGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
      });
      const error = result.error;
      if (error) toast.error(error.message ?? "Google sign-up failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const check = await checkEligibility({ data: { email: email.trim() } });
      if (!check.eligible) {
        toast.error(
          "We could not find a fund invitation for that email address. Ask your fund contact to invite you, or use the address your invitation was sent to.",
        );
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/onboarding/kyc` },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not create that account");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-3xl">Check your email</h1>
        <p className="mt-3 text-muted-foreground">
          We sent a confirmation link to <span className="text-foreground">{email.trim()}</span>.
          Open it to confirm your address, and your onboarding will begin.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Already confirmed?{" "}
          <Link to="/auth" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl">Create your account</h1>
      <p className="mt-2 text-muted-foreground">
        Use the email address your fund invitation was sent to, so we can match you to the right
        fund.
      </p>

      <Button
        type="button"
        variant="outline"
        className="mt-8 w-full"
        disabled={busy}
        onClick={signUpWithGoogle}
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
          <Label htmlFor="reg-email">Email</Label>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reg-password">Choose a password</Label>
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Already registered?{" "}
        <Link to="/auth" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
