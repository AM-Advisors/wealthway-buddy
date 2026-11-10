import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { AccountIdentityQueue } from "@/components/account-identity-queue";
import { StaffVerificationCenter } from "@/components/staff-verification-center";

export const Route = createFileRoute("/_authenticated/ops/verifications")({
  validateSearch: (s) => z.object({ person: z.string().uuid().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "KYC & AML verification | Harmonious Operations" },
      { name: "description", content: "Enter and review identity and watchlist screening details for investors and client contacts." },
      { property: "og:title", content: "KYC & AML verification | Harmonious Operations" },
      { property: "og:description", content: "Operations-entered identity and screening details with second-person review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { person } = Route.useSearch();
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">KYC & AML verification</h1>
        <p className="mt-1 text-base text-muted-foreground">Enter details you've checked for investors and client contacts, and review identity checks people completed themselves. The wider controls library stays in <Link to="/ops/security-compliance" className="underline">Security & Compliance</Link>.</p>
      </div>
      <StaffVerificationCenter initialPersonId={person} />
      <AccountIdentityQueue />
    </div>
  );
}
