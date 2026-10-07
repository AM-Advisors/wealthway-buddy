import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { buildSitemapEntries, renderSitemap } from "@/lib/marketing/sitemap";
import { listPublishedClassroom } from "@/lib/classroom-public.functions";

/**
 * Public marketing sitemap. URLs point at the future canonical host
 * (www.harmonious.co); it is only referenced from robots.txt after cutover.
 * Classroom articles appear only once published.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const articles = await listPublishedClassroom().catch(() => []);
        return new Response(renderSitemap(buildSitemapEntries(articles)), {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
