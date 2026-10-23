import { useState } from "react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startOwnFund } from "@/lib/investor-start.functions";

export const Route = createFileRoute("/_authenticated/start-fund")({
  head: () => ({
    meta: [
      { title: "Start your own fund or SPV | Harmonious" },
      { name: "description", content: "Set up your organization, sign the agreement and pay the $2,500 setup fee to launch a fund or SPV." },
      { property: "og:title", content: "Start your own fund or SPV | Harmonious" },
      { property: "og:description", content: "Launch your own fund or SPV with Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StartFund,
});

const STEPS = ["Name your business", "Sign the Master Services Agreement", "Pay the $2,500 setup fee", "Fund setup checklist"];

function StartFund() {
  const start = useServerFn(startOwnFund);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await start({ data: { businessName: name } });
      await qc.invalidateQueries();
      // The client area asks for the MSA first, then the fund request takes the $2,500 card payment.
      await navigate({ to: "/client/funds/new" });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Start your own fund or SPV</CardTitle>
          <CardDescription>Your investments stay exactly as they are. This sets up a separate organization for the fund you'll manage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ol className="space-y-2 text-sm">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span><span>{s}</span></li>
            ))}
          </ol>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="biz">Business or management company name</Label>
              <Input id="biz" required minLength={2} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Example Capital LLC" />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Setting up…" : "Continue to the agreement"}</Button>
            <p className="text-xs text-muted-foreground">The $2,500 setup fee is paid by card after you sign. Your fund request is only sent once payment is confirmed.</p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
