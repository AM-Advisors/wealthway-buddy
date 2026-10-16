import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved behind sign-in; old links keep working.
export const Route = createFileRoute("/guides/sign-operating-agreement")({
  head: () => ({ meta: [{ title: "Help center - Harmonious" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/help/$slug", params: { slug: "sign-operating-agreement" }, statusCode: 301 });
  },
});
