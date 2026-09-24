import { useEffect, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { OnboardMessage, OnboardShell } from "@/components/onboard-portal";
import { supabase } from "@/integrations/supabase/client";
import { claimOnboardInvitationFn } from "@/lib/investor-onboarding.functions";

/**
 * The single emailed entry point: onboard.harmonious.co/onboard/<reference>.
 * The reference is opaque and never a credential — the server binds it to the
 * signed-in person's verified email before anything is shown.
 */
export const Route = createFileRoute("/onboard/$ref")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Complete Your Investment — Harmonious" },
      { name: "description", content: "Complete verification, accreditation and fund documents for your investment." },
      { property: "og:title", content: "Complete Your Investment — Harmonious" },
      { property: "og:description", content: "Secure investor onboarding by Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: location.pathname } as never });
  },
  component: ClaimPage,
});

function ClaimPage() {
  const { ref } = Route.useParams();
  const navigate = useNavigate();
  const claim = useServerFn(claimOnboardInvitationFn);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    claim({ data: { reference: ref } })
      .then((r: any) => {
        if (live) void navigate({ to: "/onboard/i/$onboardingId", params: { onboardingId: r.onboardingId }, replace: true });
      })
      .catch((e: any) => {
        if (live) setError(String(e?.message ?? e).replace(/^Forbidden:\s*/, ""));
      });
    return () => { live = false; };
  }, [ref, claim, navigate]);

  return (
    <OnboardShell>
      {error ? (
        <OnboardMessage title="We couldn't open this invitation" body={error} />
      ) : (
        <p className="text-sm text-muted-foreground">Opening your investment…</p>
      )}
    </OnboardShell>
  );
}
