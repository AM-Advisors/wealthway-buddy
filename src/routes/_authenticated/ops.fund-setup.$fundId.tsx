import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Fund Setup URL — the fund now has one page. */
export const Route = createFileRoute("/_authenticated/ops/fund-setup/$fundId")({
  validateSearch: (s: Record<string, unknown>): { tab?: string | undefined } => ({ tab: typeof s["tab"] === "string" ? s["tab"] : undefined }),
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/ops/fund/$fundId", params: { fundId: params.fundId }, search: { tab: search.tab ?? "setup" }, replace: true });
  },
});
