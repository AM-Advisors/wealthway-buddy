import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { HolderSharesView } from "@/components/holder-shares-view";
import { getMyShares } from "@/lib/cap-certificates.functions";

export const Route = createFileRoute("/_authenticated/shares")({
  head: () => ({
    meta: [
      { title: "My shares — Harmonious" },
      {
        name: "description",
        content:
          "View the shares you hold and download your share certificates from the company's register on Harmonious.",
      },
      { property: "og:title", content: "My shares — Harmonious" },
      {
        property: "og:description",
        content: "Your units held, certificates and issue dates in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MySharesPage,
});

function MySharesPage() {
  const load = useServerFn(getMyShares);
  const { data, isLoading } = useQuery({ queryKey: ["my-shares"], queryFn: () => load() });
  const positions = data?.positions ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My shares</h1>
        <p className="text-sm text-muted-foreground">
          The shares recorded in your name, and the certificates behind them.
        </p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : positions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No company has given this account shareholder access yet.
        </p>
      ) : (
        positions.map((p: any, i: number) => <HolderSharesView key={i} position={p} />)
      )}
    </main>
  );
}
