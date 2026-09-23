import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { buildSitemapEntries, renderSitemap } from "@/lib/marketing/sitemap";

/**
 * Public marketing sitemap. URLs point at the future canonical host
 * (www.harmonious.co); it is only referenced from robots.txt after cutover.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(renderSitemap(buildSitemapEntries()), {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        }),
    },
  },
});
