import { createFileRoute } from "@tanstack/react-router";

import { SignInGuide } from "@/components/help/guide-sign-in";
import type { SignInAudience } from "@/lib/sign-in-guide-content";

// Public on purpose: people who can't sign in yet need this page.
export const Route = createFileRoute("/guides/sign-in")({
  validateSearch: (search: Record<string, unknown>): { for?: SignInAudience } => {
    const value = search["for"];
    return value === "investor" || value === "client" ? { for: value } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign-in guide for clients and investors | Harmonious" },
      { name: "description", content: "Step-by-step help to accept your Harmonious invitation, set up your second sign-in step and sign in as a client or investor." },
      { property: "og:title", content: "Sign-in guide for clients and investors | Harmonious" },
      { property: "og:description", content: "Accept your invitation, set up your second sign-in step and sign in to Harmonious." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignInGuidePage,
});

function SignInGuidePage() {
  const { for: audience } = Route.useSearch();
  return <SignInGuide audience={audience ?? "investor"} showSwitch />;
}
