import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolveFundLinkFn, startFromFundLinkFn } from "@/lib/fund-onboarding-link.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

/** Public Fund onboarding entry. Shows only the fund's display name and manager before sign-in. */
export const Route = createFileRoute("/join/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Investor Onboarding — Harmonious" },
      { name: "description", content: "Begin secure investor onboarding through Harmonious." },
      { property: "og:title", content: "Investor Onboarding — Harmonious" },
      { property: "og:description", content: "Begin secure investor onboarding through Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolveFundLinkFn);
  const start = useServerFn(startFromFundLinkFn);
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["fund-link-public", token], queryFn: () => resolve({ data: { token } }), retry: false });

  const begin = async () => {
    if (!user) { navigate({ to: "/auth", search: { next: `/join/${token}` } as never }); return; }
    setBusy(true); setErr(null);
    try {
      const r = await start({ data: { token } });
      navigate({ to: "/investment/$onboardingId", params: { onboardingId: r.onboardingId } });
    } catch (e) { setErr((e as Error).message.replace(/^Forbidden:\s*/, "")); setBusy(false); }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 text-center">
        <p className="font-heading text-sm font-semibold uppercase tracking-widest text-muted-foreground">Harmonious</p>
        {q.isPending ? <p className="text-sm text-muted-foreground">Checking your link…</p> : q.isError ? (
          <div className="space-y-2"><h1 className="font-heading text-xl font-semibold">Link not available</h1><p className="text-sm text-muted-foreground">{(q.error as Error).message}</p></div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">You are onboarding for</p>
              <h1 className="font-heading text-2xl font-semibold">{q.data!.fundName}</h1>
              {q.data!.managedBy ? <p className="text-sm text-muted-foreground">Managed by {q.data!.managedBy}</p> : null}
            </div>
            <p className="text-sm text-muted-foreground">{user ? "Continue to choose who is investing and complete your onboarding." : "Sign in or create your Harmonious account to continue. If you already have one, use it — you can choose which investing profile to use."}</p>
            <Button className="w-full" disabled={busy || loading} onClick={begin}>{busy ? "Opening…" : user ? "Continue" : "Sign in to continue"}</Button>
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </>
        )}
      </div>
    </main>
  );
}
