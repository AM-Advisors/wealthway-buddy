import { MARKETING_ORIGIN, ORGANIZATION } from "./site-config";

export interface Crumb {
  name: string;
  path: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface MarketingHeadInput {
  /** Path on the future canonical site (www.harmonious.co). */
  path: string;
  title: string;
  description: string;
  ogTitle?: string | undefined;
  ogDescription?: string | undefined;
  /** Absolute https URL only; omitted otherwise. */
  image?: string | undefined;
  type?: "website" | "article";
  noindex?: boolean;
  breadcrumbs?: Crumb[];
  /** Pass only when the page really describes this service. */
  service?: { name: string; description: string };
  /** Pass only when the FAQs are visible on the page. */
  faqs?: FaqEntry[];
  article?: {
    headline: string;
    author?: string | undefined;
    datePublished: string;
    dateModified?: string | undefined;
    image?: string | undefined;
  };
  extraSchema?: Record<string, unknown>[];
}

export function canonicalUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${MARKETING_ORIGIN}${clean === "/" ? "/" : clean.replace(/\/+$/, "")}`;
}

const ld = (data: Record<string, unknown>) => ({
  type: "application/ld+json",
  children: JSON.stringify({ "@context": "https://schema.org", ...data }),
});

export function organizationSchema() {
  return {
    "@type": "Organization",
    name: ORGANIZATION.name,
    legalName: ORGANIZATION.legalName,
    url: ORGANIZATION.url,
    logo: ORGANIZATION.logo,
    email: ORGANIZATION.email,
    ...(ORGANIZATION.sameAs.length ? { sameAs: ORGANIZATION.sameAs } : {}),
  };
}

export function websiteSchema() {
  return { "@type": "WebSite", name: ORGANIZATION.name, url: MARKETING_ORIGIN };
}

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: canonicalUrl(c.path),
    })),
  };
}

export function serviceSchema(name: string, description: string, path: string) {
  return {
    "@type": "Service",
    name,
    description,
    url: canonicalUrl(path),
    provider: { "@type": "Organization", name: ORGANIZATION.name, url: MARKETING_ORIGIN },
  };
}

export function faqSchema(faqs: FaqEntry[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function articleSchema(input: NonNullable<MarketingHeadInput["article"]>, path: string) {
  return {
    "@type": "Article",
    headline: input.headline,
    datePublished: input.datePublished,
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.author ? { author: { "@type": "Person", name: input.author } } : {}),
    ...(input.image ? { image: input.image } : {}),
    mainEntityOfPage: canonicalUrl(path),
    publisher: { "@type": "Organization", name: ORGANIZATION.name, logo: ORGANIZATION.logo },
  };
}

/**
 * Head builder for every public marketing page: title, description, canonical
 * (always www.harmonious.co), Open Graph, Twitter, robots and structured data.
 * Schema is only emitted for content that is actually passed in.
 */
export function marketingHead(input: MarketingHeadInput) {
  const url = canonicalUrl(input.path);
  const ogTitle = input.ogTitle ?? input.title;
  const ogDescription = input.ogDescription ?? input.description;
  const image = input.image?.startsWith("https://") ? input.image : undefined;

  const meta: Record<string, string>[] = [
    { title: input.title },
    { name: "description", content: input.description },
    { property: "og:title", content: ogTitle },
    { property: "og:description", content: ogDescription },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:url", content: url },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: ogTitle },
    { name: "twitter:description", content: ogDescription },
  ];
  if (image) {
    meta.push({ property: "og:image", content: image }, { name: "twitter:image", content: image });
  }
  if (input.noindex) meta.push({ name: "robots", content: "noindex, follow" });

  const scripts = [];
  if (input.path === "/") scripts.push(ld(organizationSchema()), ld(websiteSchema()));
  if (input.breadcrumbs && input.breadcrumbs.length > 1) scripts.push(ld(breadcrumbSchema(input.breadcrumbs)));
  if (input.service) scripts.push(ld(serviceSchema(input.service.name, input.service.description, input.path)));
  if (input.faqs && input.faqs.length > 0) scripts.push(ld(faqSchema(input.faqs)));
  if (input.article) scripts.push(ld(articleSchema(input.article, input.path)));
  for (const s of input.extraSchema ?? []) scripts.push(ld(s));

  return {
    meta,
    links: input.noindex ? [] : [{ rel: "canonical", href: url }],
    scripts,
  };
}

/** Head for private / application / authentication pages. */
export function privateHead(title: string) {
  return {
    meta: [{ title }, { name: "robots", content: "noindex, nofollow" }],
  };
}
