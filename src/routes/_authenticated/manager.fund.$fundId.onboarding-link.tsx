import { createFileRoute } from "@tanstack/react-router";
import { FundOnboardingLinkCard } from "@/components/fund-onboarding-link";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/onboarding-link")({
  head: () => ({ meta: [
    { title: "Investor Onboarding Link — Harmonious" }, { name: "description", content: "Share a secure link investors use to begin onboarding for this fund." },
    { property: "og:title", content: "Investor Onboarding Link — Harmonious" }, { property: "og:description", content: "Share a secure fund-specific investor onboarding link." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: Page,
});
function Page() { return <FundOnboardingLinkCard fundId={Route.useParams().fundId} />; }
