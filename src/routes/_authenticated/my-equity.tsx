import { createFileRoute } from "@tanstack/react-router";

import { MyEquityView } from "@/components/captable/my-equity-view";

export const Route = createFileRoute("/_authenticated/my-equity")({
  head: () => ({
    meta: [
      { title: "My equity — Harmonious CapTable" },
      {
        name: "description",
        content:
          "See your own shares and options, track vesting, accept your grants and request an exercise.",
      },
      { property: "og:title", content: "My equity — Harmonious CapTable" },
      {
        property: "og:description",
        content: "Your own equity: grants, vesting, documents and requests, in one private view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyEquityPage,
});

function MyEquityPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">My equity</h2>
        <p className="text-sm text-muted-foreground">
          Your own shares, options and vesting. Only you and your company can see this.
        </p>
      </div>
      <MyEquityView />
    </div>
  );
}
