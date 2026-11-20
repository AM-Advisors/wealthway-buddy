import { createFileRoute } from "@tanstack/react-router";

import { SignatureCenter } from "@/components/signature-center";

export const Route = createFileRoute("/_authenticated/ops/signatures")({
  head: () => ({
    meta: [
      { title: "Signatures across funds | Harmonious operations" },
      { name: "description", content: "Every agreement out for signature on every fund: side letters, subscription agreements, operating agreements, who each is waiting on and what is stuck." },
      { property: "og:title", content: "Signatures across funds | Harmonious operations" },
      { property: "og:description", content: "See where every signature is stuck and resend in one click." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpsSignaturesPage,
});

function OpsSignaturesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Signatures across funds</h1>
        <p className="text-base text-muted-foreground">Fund managers own their signatures. This shows where each one stands so you can see what&apos;s stuck.</p>
      </header>
      <SignatureCenter surface="ops" everything />
    </main>
  );
}
