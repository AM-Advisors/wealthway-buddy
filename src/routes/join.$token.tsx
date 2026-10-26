import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolveFundLinkFn, startFromFundLinkFn } from "@/lib/fund-onboarding-link.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PENDING_MATCH_MESSAGE } from "@/lib/investor-record-model";
import guideVideo from "@/assets/investor-onboarding-guide.mp4.asset.json";

const GUIDE_STEPS: [string, string][] = [
  ["About You", "Create your account, then choose or add the profile you are investing through"],
  ["Verification", "Confirm your identity securely in a few minutes"],
  ["Sign", "Review and sign the fund documents online"],
  ["Fund", "Get the wire instructions and send your investment"],
];

/** Public Fund onboarding entry. Shows only the fund's display name and manager before sign-in. */
export const Route = createFileRoute("/join/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Investor Onboarding | Harmonious" },
      { name: "description", content: "Begin secure investor onboarding through Harmonious." },
      { property: "og:title", content: "Investor Onboarding | Harmonious" },
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
  const [pending, setPending] = useState(false);
  const q = useQuery({ queryKey: ["fund-link-public", token], queryFn: () => resolve({ data: { token } }), retry: false });

  const begin = async () => {
    if (!user) { navigate({ to: "/auth", search: { next: `/join/${token}` } as never }); return; }
    setBusy(true); setErr(null);
    try {
      const r = await start({ data: { token } });
      if (!r.onboardingId) { setPending(true); setBusy(false); return; }
      navigate({ to: "/investment/$onboardingId", params: { onboardingId: r.onboardingId } });
    } catch (e) { setErr((e as Error).message.replace(/^Forbidden:\s*/, "")); setBusy(false); }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <section className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6" aria-label="How onboarding works">
        <video src={guideVideo.url} className="aspect-video w-full rounded-md" autoPlay muted loop playsInline controls />
        <h2 className="font-heading text-lg font-semibold">How onboarding works</h2>
        <ol className="space-y-2 text-sm text-muted-foreground">
          {GUIDE_STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span><span><span className="font-medium text-foreground">{t}.</span> {d}</span></li>
          ))}
        </ol>
      </section>
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 text-center">
        <p className="font-heading text-sm font-semibold uppercase tracking-widest text-muted-foreground">Harmonious</p>
        {q.isPending ? <p className="text-sm text-muted-foreground">Checking your link…</p> : q.isError ? (
          <div className="space-y-2"><h1 className="font-heading text-xl font-semibold">Link not available</h1><p className="text-sm text-muted-foreground">{(q.error as Error).message}</p></div>
        ) : pending ? (
          <div className="space-y-2" role="status"><h1 className="font-heading text-xl font-semibold">{PENDING_MATCH_MESSAGE.title}</h1><p className="text-sm text-muted-foreground">{PENDING_MATCH_MESSAGE.body}</p></div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">You are onboarding for</p>
              <h1 className="font-heading text-2xl font-semibold">{q.data?.fundName}</h1>
              {q.data?.managedBy ? <p className="text-sm text-muted-foreground">Managed by {q.data?.managedBy}</p> : null}
            </div>
            <p className="text-sm text-muted-foreground">{user ? "Continue to choose how you're investing and finish your investment." : "Sign in or create your Harmonious account to continue. If you already have one, use it, you can pick an investing profile you already have or add a new one."}</p>
            <Button className="w-full" disabled={busy || loading} onClick={begin}>{busy ? "Opening…" : user ? "Continue" : "Sign in to continue"}</Button>
            {!user ? <Button className="w-full" variant="outline" asChild><Link to="/auth/register" search={{ next: `/join/${token}` } as never}>Set up your account</Link></Button> : null}
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </>
        )}
      </div>
    </main>
  );
}
