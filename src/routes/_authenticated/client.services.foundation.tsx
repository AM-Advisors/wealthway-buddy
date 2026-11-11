import { createFileRoute, Link } from "@tanstack/react-router";
import { FoundationClientOnboarding } from "@/components/foundation-client-onboarding";

export const Route = createFileRoute("/_authenticated/client/services/foundation")({
  head: () => ({
    meta: [
      { title: "Foundation onboarding · Harmonious" },
      { name: "description", content: "Add your foundation's details, documents and people, and send them to Harmonious for review." },
      { property: "og:title", content: "Foundation onboarding · Harmonious" },
      { property: "og:description", content: "Foundation details, documents and people, reviewed by Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FoundationOnboardingPage,
});

function FoundationOnboardingPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/client/services" className="text-sm underline">Back to your services</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Foundation onboarding</h1>
        <p className="mt-1 text-base text-muted-foreground">Add what Harmonious needs about your foundation. Harmonious reviews everything you send before it's recorded.</p>
      </div>
      <FoundationClientOnboarding />
    </div>
  );
}
