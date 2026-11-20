import { createFileRoute } from "@tanstack/react-router";

import { SignatureCenter } from "@/components/signature-center";

export const Route = createFileRoute("/_authenticated/signatures")({
  head: () => ({
    meta: [
      { title: "Signatures | Harmonious" },
      { name: "description", content: "Every side letter, subscription agreement and other agreement waiting for a signature, who it's waiting on, and a Resend button." },
      { property: "og:title", content: "Signatures | Harmonious" },
      { property: "og:description", content: "What you need to sign and where every agreement on your funds stands." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignaturesPage,
});

function SignaturesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Signatures</h1>
        <p className="text-base text-muted-foreground">What&apos;s waiting on you, and every agreement on your funds: who it&apos;s waiting on and how long.</p>
      </header>
      <SignatureCenter surface="client" />
    </main>
  );
}
