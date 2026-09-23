import { ARTICLES, type Article } from "./articles";
import { MARKETING_ORIGIN, hasPublishedPricing } from "./site-config";

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "weekly" | "monthly" | "yearly";
  priority?: string;
}

/** Indexable public marketing pages only. Never sign-in, app, fund, token or private pages. */
export const PUBLIC_PAGES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/platform", changefreq: "monthly", priority: "0.9" },
  { path: "/fund-administration", changefreq: "monthly", priority: "0.9" },
  { path: "/spvs", changefreq: "monthly", priority: "0.9" },
  { path: "/cap-table-management", changefreq: "monthly", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contactus", changefreq: "yearly", priority: "0.5" },
  { path: "/privacy", changefreq: "yearly", priority: "0.2" },
  { path: "/terms", changefreq: "yearly", priority: "0.2" },
  { path: "/cap-table-privacy", changefreq: "yearly", priority: "0.2" },
  { path: "/cap-table-terms", changefreq: "yearly", priority: "0.2" },
];

/** Path prefixes that must never appear in the public sitemap. */
export const NEVER_IN_SITEMAP = [
  "/auth", "/client-login", "/manager-login", "/reset-password", "/portal", "/ops", "/admin",
  "/staff", "/manager", "/client", "/professional", "/investor", "/fund/", "/invest/",
  "/shares/", "/cap-claim/", "/api/",
];

export function buildSitemapEntries(articles: Article[] = ARTICLES, pricingPublished = hasPublishedPricing()): SitemapEntry[] {
  const entries = [...PUBLIC_PAGES];
  if (pricingPublished) entries.push({ path: "/pricing", changefreq: "monthly", priority: "0.7" });
  if (articles.length > 0) {
    entries.push({ path: "/harmoniousclassroom", changefreq: "weekly", priority: "0.7" });
    for (const a of articles) {
      entries.push({ path: `/post/${a.slug}`, lastmod: (a.updatedAt ?? a.publishedAt).slice(0, 10), priority: "0.6" });
    }
  }
  return entries.filter((e) => !NEVER_IN_SITEMAP.some((p) => e.path.startsWith(p)));
}

export function renderSitemap(entries: SitemapEntry[], origin = MARKETING_ORIGIN): string {
  const urls = entries.map((e) =>
    [
      "  <url>",
      `    <loc>${origin}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      "  </url>",
    ].filter(Boolean).join("\n"),
  );
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>"].join("\n");
}
