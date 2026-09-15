import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { HolderSharesView } from "@/components/holder-shares-view";
import { Logo } from "@/components/Logo";
import { getSharesByToken } from "@/lib/cap-certificates.functions";

export const Route = createFileRoute("/shares/$token")({
  head: () => ({
    meta: [
      { title: "Your shareholding — Harmonious" },
      {
        name: "description",
        content:
          "A private view of the shares and share certificates recorded in your company's register on Harmonious.",
      },
      { property: "og:title", content: "Your shareholding — Harmonious" },
      {
        property: "og:description",
        content: "Shares, units and certificates recorded in your company's share register.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HolderLinkPage,
});

function HolderLinkPage() {
  const { token } = Route.useParams();
  const load = useServerFn(getSharesByToken);
  const { data, isLoading } = useQuery({
    queryKey: ["holder-shares", token],
    queryFn: () => load({ data: { token } }),
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Logo className="h-8 w-auto" />
      <h1 className="text-2xl font-semibold tracking-tight">Your shareholding</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data?.ok ? (
        <p className="text-sm text-muted-foreground">
          {(data as any)?.reason ?? "This link is not valid."}
        </p>
      ) : (
        <HolderSharesView position={data} />
      )}
    </main>
  );
}
