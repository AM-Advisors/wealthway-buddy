import { createFileRoute, redirect } from "@tanstack/react-router";

import { OnboardPortal, OnboardShell } from "@/components/onboard-portal";
import { supabase } from "@/integrations/supabase/client";

/** One investment's onboarding. Ownership is enforced on the server for every read. */
export const Route = createFileRoute("/onboard/i/$onboardingId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Investment Onboarding — Harmonious" },
      { name: "description", content: "Verification, accreditation and documents for your investment." },
      { property: "og:title", content: "Your Investment Onboarding — Harmonious" },
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
  component: PortalPage,
});

function PortalPage() {
  const { onboardingId } = Route.useParams();
  return (
    <OnboardShell>
      <OnboardPortal onboardingId={onboardingId} />
    </OnboardShell>
  );
}
