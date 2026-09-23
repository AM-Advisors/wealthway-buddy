import { useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/forgot")({
  head: () => ({
    meta: [
        { name: "robots", content: "noindex, nofollow" },
      { title: "Reset Your Password — Harmonious" },
      {
        name: "description",
        content:
          "Request a secure link to set a new password for your Harmonious investor account.",
      },
      { property: "og:title", content: "Reset Your Password — Harmonious" },
      { property: "og:description", content: "Get back into your Harmonious investor account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not send that link");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-3xl">Check your email</h1>
        <p className="mt-3 text-muted-foreground">
          If an account exists for <span className="text-foreground">{email.trim()}</span>, a link
          to set a new password is on its way. The link expires shortly, so use it soon.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          <Link to="/auth" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl">Forgot your password?</h1>
      <p className="mt-2 text-muted-foreground">
        Enter your email address and we'll send you a link to set a new one.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        <Link to="/auth" className="font-medium text-foreground hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
