import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { missingArticles, validateArticle, type Article } from "./articles";
import { externalReferrer, parseUtm } from "./attribution";
import { leadSchema, toSalesforceLead } from "./leads.functions";
import { canonicalUrl, marketingHead } from "./seo";
import {
  APPROVED_METRICS, COMPARISON_PAGES, CTAS, CTA_DESTINATION, MARKETING_NAV, MARKETING_ORIGIN,
  PRICING, formatPrice, hasPublishedPricing, visibleNav,
} from "./site-config";
import { NEVER_IN_SITEMAP, buildSitemapEntries, renderSitemap } from "./sitemap";
import { ALL_WIX_URLS, PROJECT_REDIRECTS, WIX_ARTICLES, WIX_ARTICLE_SLUGS, WIX_PAGES } from "./wix-url-map";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
/** Route file for a URL path (flat dot convention). */
function routeFileExists(path: string): boolean {
  if (path === "/") return existsSync(resolve(root, "src/routes/index.tsx"));
  const name = path.slice(1).replace(/\//g, ".");
  return ["tsx", "ts"].some((ext) => existsSync(resolve(root, `src/routes/${name}.${ext}`)));
}

const sampleArticle: Article = {
  slug: "what-is-a-special-purpose-vehicle",
  originalPath: "/post/what-is-a-special-purpose-vehicle",
  title: "What is a Special Purpose Vehicle?",
  author: "Harmonious",
  publishedAt: "2024-03-01T00:00:00.000Z",
  heroImage: { src: "https://www.harmonious.co/img.jpg", alt: "SPV diagram" },
  contentHtml: "<p>Body</p>",
  category: "spvs",
};

describe("Wix URL preservation", () => {
  it("inventories all 55 Wix articles and keeps every one at its exact /post/ path", () => {
    expect(WIX_ARTICLE_SLUGS.length).toBe(55);
    expect(new Set(WIX_ARTICLE_SLUGS).size).toBe(WIX_ARTICLE_SLUGS.length);
    for (const a of WIX_ARTICLES) {
      expect(a.action).toBe("KEEP");
      expect(a.path.startsWith("/post/")).toBe(true);
    }
  });
  it("never bulk-redirects articles or pages to a resources hub", () => {
    expect(ALL_WIX_URLS.filter((u) => u.target?.startsWith("/resources"))).toEqual([]);
  });
  it("every redirect/consolidate has a target; every KEEP page has none", () => {
    for (const u of WIX_PAGES) {
      if (u.action === "REDIRECT" || u.action === "CONSOLIDATE") expect(u.target).toBeTruthy();
      if (u.action === "KEEP") expect(u.target).toBeUndefined();
    }
  });
  it("the main ranking pages already exist here at their exact Wix URLs", () => {
    for (const p of ["/", "/spvs", "/cap-table-management", "/contactus", "/harmoniousclassroom"]) {
      expect(routeFileExists(p)).toBe(true);
    }
    expect(routeFileExists("/post/$slug")).toBe(true);
  });
  it("old project paths redirect permanently to the Wix-equivalent path", () => {
    for (const [from, to] of Object.entries(PROJECT_REDIRECTS)) {
      const src = read(`src/routes/${from.slice(1)}.tsx`);
      expect(src).toContain(`to: "${to}"`);
      expect(src).toContain("statusCode: 301");
    }
  });
  it("reports cutover blockers: KEEP pages without a route and unimported articles", () => {
    const blockers = WIX_PAGES.filter((u) => u.action === "KEEP" && !routeFileExists(u.path)).map((u) => u.path);
    expect(blockers.sort()).toEqual(["/careers", "/kyc-aml"]);
    expect(missingArticles().length).toBe(55);
  });
});

describe("navigation", () => {
  it("renders only live items, and every live link has a real page", () => {
    for (const g of visibleNav()) {
      for (const i of g.items) {
        expect(i.status).toBe("live");
        expect(routeFileExists(i.href)).toBe(true);
      }
      if (g.href) expect(routeFileExists(g.href)).toBe(true);
    }
  });
  it("keeps the full planned architecture without linking to thin pages", () => {
    expect(MARKETING_NAV.map((g) => g.label)).toEqual([
      "Platform", "Fund Administration", "SPVs", "Cap Tables", "Solutions", "Resources", "Pricing", "Company",
    ]);
    expect(visibleNav().some((g) => g.label === "Solutions")).toBe(false);
  });
});

describe("SEO head", () => {
  it("canonicalizes to www.harmonious.co, never an application host", () => {
    expect(canonicalUrl("/spvs")).toBe("https://www.harmonious.co/spvs");
    const head = marketingHead({ path: "/spvs", title: "t", description: "d" });
    expect(head.links[0]?.href).toBe(`${MARKETING_ORIGIN}/spvs`);
    expect(JSON.stringify(head)).not.toMatch(/onboard\.|app\.harmonious|portal\./);
  });
  it("noindex pages emit robots noindex and no canonical", () => {
    const head = marketingHead({ path: "/pricing", title: "t", description: "d", noindex: true });
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex, follow" });
    expect(head.links).toEqual([]);
  });
  it("only renders schema for content passed in; never ratings or reviews", () => {
    const bare = marketingHead({ path: "/x", title: "t", description: "d" });
    expect(bare.scripts).toEqual([]);
    const full = marketingHead({
      path: "/x", title: "t", description: "d",
      breadcrumbs: [{ name: "Home", path: "/" }, { name: "X", path: "/x" }],
      service: { name: "S", description: "D" },
      faqs: [{ question: "Q", answer: "A" }],
    });
    const types = full.scripts.map((s) => JSON.parse(s.children)["@type"]);
    expect(types).toEqual(["BreadcrumbList", "Service", "FAQPage"]);
    expect(JSON.stringify(full)).not.toMatch(/aggregateRating|Review/);
    const home = marketingHead({ path: "/", title: "t", description: "d" });
    expect(home.scripts.map((s) => JSON.parse(s.children)["@type"])).toEqual(["Organization", "WebSite"]);
  });
  it("drops relative social images", () => {
    const head = marketingHead({ path: "/x", title: "t", description: "d", image: "/og.jpg" });
    expect(JSON.stringify(head.meta)).not.toContain("og:image");
  });
});

describe("index / noindex", () => {
  it("sign-in, token, application and fund offering pages are noindex", () => {
    for (const f of [
      "auth.tsx", "auth.index.tsx", "auth.register.tsx", "auth.forgot.tsx", "client-login.tsx",
      "manager-login.tsx", "reset-password.tsx", "cap-claim.$token.tsx", "shares.$token.tsx",
      "_authenticated/route.tsx", "fund.$slug.tsx", "invest.$slug.tsx",
    ]) {
      expect(read(`src/routes/${f}`), f).toMatch(/robots", content: "noindex/);
    }
  });
  it("public sitemap contains only public marketing pages on the www host", () => {
    const entries = buildSitemapEntries([], false);
    for (const e of entries) expect(NEVER_IN_SITEMAP.some((p) => e.path.startsWith(p))).toBe(false);
    expect(entries.map((e) => e.path)).not.toContain("/auth");
    expect(entries.map((e) => e.path)).not.toContain("/pricing");
    const xml = renderSitemap(entries);
    expect(xml).toContain("<loc>https://www.harmonious.co/spvs</loc>");
    expect(xml).not.toContain("onboard.harmonious.co");
  });
  it("articles enter the sitemap with their original dates once imported", () => {
    const xml = renderSitemap(buildSitemapEntries([sampleArticle], false));
    expect(xml).toContain("/post/what-is-a-special-purpose-vehicle");
    expect(xml).toContain("<lastmod>2024-03-01</lastmod>");
  });
  it("robots.txt no longer advertises the onboard sitemap", () => {
    expect(read("public/robots.txt")).not.toContain("onboard.harmonious.co");
  });
});

describe("Classroom article model", () => {
  it("accepts a faithful import and rejects path changes or missing alt text", () => {
    expect(validateArticle(sampleArticle)).toEqual([]);
    expect(validateArticle({ ...sampleArticle, originalPath: "/resources/x" })).not.toEqual([]);
    expect(validateArticle({ ...sampleArticle, heroImage: { src: "https://x/y.jpg", alt: "" } })).not.toEqual([]);
    expect(validateArticle({ ...sampleArticle, canonicalUrl: "https://onboard.harmonious.co/post/x" })).not.toEqual([]);
  });
});

describe("CTAs and leads", () => {
  it("every CTA goes to the contact form, not account signup", () => {
    expect(CTA_DESTINATION).toBe("/contactus");
    expect(Object.keys(CTAS)).toHaveLength(8);
  });
  it("marketing pages no longer send buttons to account signup except the homepage hero (Stage 3)", () => {
    for (const f of ["spvs.tsx", "platform.tsx", "fund-administration.tsx", "about.tsx"]) {
      expect(read(`src/routes/${f}`), f).not.toContain('to="/auth/register"');
    }
  });
  it("captures UTMs and external referrers only", () => {
    expect(parseUtm("?utm_source=li&utm_medium=social&utm_campaign=q3&utm_content=a&x=1")).toEqual({
      utmSource: "li", utmMedium: "social", utmCampaign: "q3", utmContent: "a",
    });
    expect(externalReferrer("https://app.harmonious.co/x", "www.harmonious.co")).toBeUndefined();
    expect(externalReferrer("https://google.com/search?q=secret", "www.harmonious.co")).toBe("https://google.com/search");
  });
  it("validates the short lead form and maps to Salesforce Lead fields", () => {
    const lead = leadSchema.parse({ name: "Ada Lovelace", workEmail: "ada@fund.com", company: "Fund", intent: "spv", attribution: { cta: "start_spv", utmSource: "g" } });
    expect(toSalesforceLead(lead)).toMatchObject({ FirstName: "Ada", LastName: "Lovelace", Company: "Fund", LeadSource: "Website", Harmonious_CTA__c: "start_spv" });
    expect(() => leadSchema.parse({ name: "", workEmail: "bad", company: "", intent: "spv" })).toThrow();
    expect(() => leadSchema.parse({ name: "a", workEmail: "a@b.co", company: "c", intent: "admin" })).toThrow();
  });
  it("lead submission only writes marketing_leads — never grants application access", () => {
    const src = read("src/lib/marketing/leads.functions.ts");
    expect(src.match(/\.from\("([a-z_]+)"\)/g)).toEqual(['.from("marketing_leads")']);
    expect(src).not.toMatch(/auth\.admin|user_roles|client_users|signUp/);
  });
});

describe("claims, metrics, pricing, comparisons", () => {
  it("removes unconditional same-day and wire/ACH execution claims", () => {
    for (const f of ["index.tsx", "spvs.tsx", "platform.tsx", "fund-administration.tsx", "about.tsx"]) {
      const s = read(`src/routes/${f}`);
      expect(s, f).not.toMatch(/same-day|Same-Day|Same-day|Wire & ACH|wire or ACH|Wire and ACH/);
    }
  });
  it("publishes no metrics or prices until approved", () => {
    expect(APPROVED_METRICS).toEqual([]);
    expect(hasPublishedPricing()).toBe(false);
    expect(PRICING.map((s) => s.title)).toEqual(["SPVs", "Fund Administration", "Cap Tables", "Additional Services"]);
  });
  it("formats fixed, starting-at and custom prices", () => {
    const base = { name: "n", description: "d", approved: true } as const;
    expect(formatPrice({ ...base, kind: "fixed", amountUsd: 8000 })).toBe("$8,000");
    expect(formatPrice({ ...base, kind: "starting_at", amountUsd: 1500, unit: "per year" })).toBe("Starting at $1,500 per year");
    expect(formatPrice({ ...base, kind: "custom" })).toBe("Custom pricing");
    expect(formatPrice({ ...base, approved: false, kind: "fixed", amountUsd: 1 })).toBe("Custom pricing");
  });
  it("no comparison page is published or routed", () => {
    for (const c of COMPARISON_PAGES) {
      expect(c.published).toBe(false);
      expect(routeFileExists(`/${c.slug}`)).toBe(false);
    }
  });
});
