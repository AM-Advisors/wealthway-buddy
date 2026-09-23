import { RESOURCE_CATEGORIES, type ResourceCategory } from "./site-config";
import { WIX_ARTICLE_SLUGS } from "./wix-url-map";

/**
 * Classroom article model. Built to import the existing Wix articles verbatim:
 * the original slug, author, dates, images, alt text and SEO fields are kept.
 * Articles are imported as-is — never AI-rewritten.
 */
export interface ArticleImage {
  /** Absolute https URL (migrated asset). */
  src: string;
  alt: string;
}

export interface Article {
  /** Exact original slug; served at /post/<slug>. */
  slug: string;
  /** Original path on the Wix site, for provenance. */
  originalPath: string;
  title: string;
  author?: string | undefined;
  /** ISO date of original publication (from Wix). */
  publishedAt: string;
  updatedAt?: string | undefined;
  heroImage?: ArticleImage;
  /** Sanitized HTML body, imported from Wix. */
  contentHtml: string;
  /** Wix category, as originally assigned. */
  wixCategory?: string | undefined;
  /** New resource category (mapped at import). */
  category: ResourceCategory;
  metaTitle?: string | undefined;
  metaDescription?: string | undefined;
  /** Defaults to https://www.harmonious.co/post/<slug>. */
  canonicalUrl?: string | undefined;
  ogTitle?: string | undefined;
  ogDescription?: string | undefined;
  ogImage?: string | undefined;
  /** Service/pillar pages this article should link to. */
  relatedPages?: string[];
  relatedArticles?: string[];
}

/**
 * Imported articles. Empty until the Wix export is supplied — the import step
 * appends records here (or a content table later) without changing routing.
 */
export const ARTICLES: Article[] = [];

export function getArticle(slug: string, list: Article[] = ARTICLES): Article | undefined {
  return list.find((a) => a.slug === slug);
}

export function articlesInCategory(category: ResourceCategory, list: Article[] = ARTICLES) {
  return list.filter((a) => a.category === category);
}

/** Import validation: returns problems (empty = valid). */
export function validateArticle(a: Article): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9-]+$/.test(a.slug)) problems.push("slug must be lowercase letters, numbers and hyphens");
  if (a.originalPath !== `/post/${a.slug}`) problems.push("originalPath must equal /post/<slug> so the URL is preserved");
  if (!a.title.trim()) problems.push("title is required");
  if (Number.isNaN(Date.parse(a.publishedAt))) problems.push("publishedAt must be the original publication date");
  if (!a.contentHtml.trim()) problems.push("content is required");
  if (a.heroImage && !a.heroImage.alt.trim()) problems.push("hero image needs alt text");
  if (a.heroImage && !a.heroImage.src.startsWith("https://")) problems.push("hero image must be an absolute https URL");
  if (!RESOURCE_CATEGORIES.some((c) => c.slug === a.category)) problems.push("unknown category");
  if (a.canonicalUrl && !a.canonicalUrl.startsWith("https://www.harmonious.co/"))
    problems.push("canonical must be on www.harmonious.co");
  return problems;
}

/** Wix articles not yet imported — the cutover blocker list for the Classroom. */
export function missingArticles(list: Article[] = ARTICLES): string[] {
  const have = new Set(list.map((a) => a.slug));
  return WIX_ARTICLE_SLUGS.filter((s) => !have.has(s));
}

/** Suggested mapping from old Wix categories to new resource categories. */
export const WIX_CATEGORY_MAP: Record<string, ResourceCategory> = {
  "special-purpose-vehicles": "spvs",
  "private-equity": "fund-administration",
  "venture-capital": "fund-administration",
  "real-estate-fund": "fund-administration",
  "founder-s-friday": "private-markets",
};
