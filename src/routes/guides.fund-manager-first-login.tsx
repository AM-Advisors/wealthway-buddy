import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved behind sign-in; old links keep working.
export const Route = createFileRoute("/guides/fund-manager-first-login")({
  head: () => ({ meta: [{ title: "Help center - Harmonious" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/help/$slug", params: { slug: "fund-manager-first-login" }, statusCode: 301 });
  },
});
