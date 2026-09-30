// Shared SEO helpers so every route advertises the same canonical host,
// OpenGraph image, and Twitter card shape.

/** Canonical production host. Matches what sitemap.xml advertises. */
export const SITE_URL = "https://www.harmonious.co";

/** Absolute share image used across the marketing surface. */
export const OG_IMAGE = `${SITE_URL}/og-harmonious.jpg`;

const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;

type MetaEntry = Record<string, string>;

/**
 * Self-referencing canonical + og:url + share image for an indexable page.
 * Spread the result into a route `head()`:
 *   head: () => ({ meta: [...titles, ...seoMeta("/pricing")], links: seoLinks("/pricing") })
 */
export function seoMeta(path: string, opts?: { image?: string }): MetaEntry[] {
  const image = opts?.image ?? OG_IMAGE;
  return [
    { property: "og:url", content: abs(path) },
    { property: "og:site_name", content: "Harmonious" },
    { property: "og:image", content: image },
    { name: "twitter:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/** Canonical link for a leaf route. Never add this to __root or a layout. */
export function seoLinks(path: string) {
  return [{ rel: "canonical", href: abs(path) }];
}

/** Private, auth-gated surfaces should never be indexed. */
export const NOINDEX: MetaEntry = { name: "robots", content: "noindex, nofollow" };

/**
 * Organization + WebSite + WebPage JSON-LD for an indexable route.
 * The Organization/WebSite nodes reuse the sitewide `@id`s, so crawlers merge
 * them with the root graph instead of treating them as duplicates.
 * Spread into a route `head()`:  scripts: seoScripts("/pricing")
 */
export function seoScripts(path: string, opts?: { name?: string; description?: string }) {
  const url = abs(path);
  const page: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    primaryImageOfPage: { "@type": "ImageObject", url: OG_IMAGE },
  };
  if (opts?.name) page["name"] = opts.name;
  if (opts?.description) page["description"] = opts.description;

  return [
    {
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "Harmonious",
            url: SITE_URL,
            logo: `${SITE_URL}/app-icon-512.png`,
          },
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: "Harmonious",
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
          page,
        ],
      }),
    },
  ];
}
