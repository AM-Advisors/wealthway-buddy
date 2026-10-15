import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { previewInviteLinkFn, redeemInviteLinkFn } from "@/lib/invite-link.functions";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Harmonious invitation" },
      { name: "description", content: "Set up your Harmonious account from your personal invitation." },
      { property: "og:title", content: "Your Harmonious invitation" },
      { property: "og:description", content: "Set up your Harmonious account from your personal invitation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const preview = useServerFn(previewInviteLinkFn);
  const redeem = useServerFn(redeemInviteLinkFn);
  const q = useQuery({ queryKey: ["invite-link", token], queryFn: () => preview({ data: { token } }), retry: false });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // A button click (not auto-redirect) so email link scanners can't use up the link.
  const go = async () => {
    setBusy(true);
    try {
      const r = await redeem({ data: { token } });
      if (r.url) { window.location.href = r.url; return; }
      setFailed(true);
    } catch { setFailed(true); }
    setBusy(false);
  };

  const invalid = failed || q.isError || (q.data && !q.data.ok);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 text-center">
        <p className="font-heading text-sm font-semibold uppercase tracking-widest text-muted-foreground">Harmonious</p>
        {q.isPending ? <p className="text-sm text-muted-foreground">Checking your invitation…</p> : invalid ? (
          <div className="space-y-3">
            <h1 className="font-heading text-xl font-semibold">This link has expired or was already used</h1>
            <p className="text-sm text-muted-foreground">Ask your Harmonious contact for a new invitation link. If you've already set your password, just sign in.</p>
            <Button asChild variant="outline" className="w-full"><Link to="/client-login">Sign in</Link></Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="font-heading text-2xl font-semibold">Welcome{q.data && q.data.ok && q.data.firstName ? `, ${q.data.firstName}` : ""}</h1>
              <p className="text-sm text-muted-foreground">You've been invited to Harmonious. Choose your password and we'll take you straight to your next step.</p>
            </div>
            <Button className="w-full" disabled={busy} onClick={go}>{busy ? "Opening…" : "Set up my account"}</Button>
            <p className="text-xs text-muted-foreground">This personal link works once and expires 7 days after it was sent.</p>
          </>
        )}
      </div>
    </main>
  );
}
