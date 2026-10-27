import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const resolve = createServerFn({ method: "GET" })
  .validator((d) => z.object({ code: z.string().max(32) }).parse(d))
  .handler(async ({ data }) => {
    const { resolveShortLink } = await import("@/lib/sales-acceptance.server");
    return { token: await resolveShortLink(data.code) };
  });

export const Route = createFileRoute("/q/$code")({
  head: () => ({
    meta: [
      { title: "Open your quote | Harmonious" },
      { name: "description", content: "Opening your Harmonious quote or proposal." },
      { property: "og:title", content: "Open your quote | Harmonious" },
      { property: "og:description", content: "Opening your Harmonious quote or proposal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async ({ params }) => {
    const { token } = await resolve({ data: { code: params.code } });
    if (token) throw redirect({ to: "/accept/$token", params: { token } });
    return null;
  },
  component: () => (
    <main className="mx-auto max-w-lg p-8 text-center">
      <p className="text-muted-foreground">This link is no longer valid. Please ask your Harmonious contact for a new one.</p>
    </main>
  ),
});
