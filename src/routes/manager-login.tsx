import { createFileRoute, redirect } from "@tanstack/react-router";

/** Kept so old bookmarks and older invitation emails still work. */
export const Route = createFileRoute("/manager-login")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/auth", replace: true });
  },
});
