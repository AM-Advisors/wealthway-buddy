/** Classroom HTML helpers (pure; safe for server and tests). */

const ALLOWED = new Set(["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "u", "a", "img", "blockquote", "br", "figure", "figcaption"]);

/** Wix image URLs carry a resize suffix; keep the original media file. */
export function cleanWixImage(src: string): string {
  const m = src.match(/^(https:\/\/static\.wixstatic\.com\/media\/[^/]+)/);
  return m ? m[1]! : src;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i")) ?? tag.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? m[1]! : null;
}
const esc = (s: string) => s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Allow-list sanitizer: only simple text tags survive, with no attributes except safe href/src/alt. */
export function sanitizeHtml(input: string): string {
  let h = input
    .replace(/<(script|style|svg|button|noscript|iframe|template)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  h = h.replace(/<\/?([a-zA-Z0-9-]+)\b[^>]*>/g, (tag, raw: string) => {
    let name = raw.toLowerCase();
    if (name === "b") name = "strong";
    if (name === "i") name = "em";
    if (name === "h1") name = "h2";
    if (name === "h5" || name === "h6") name = "h4";
    if (!ALLOWED.has(name)) return "";
    const closing = tag.startsWith("</");
    if (closing) return name === "img" || name === "br" ? "" : `</${name}>`;
    if (name === "a") {
      const href = attr(tag, "href") ?? "";
      const ok = /^(https?:\/\/|\/|mailto:)/i.test(href) && !/^javascript:/i.test(href);
      return ok ? `<a href="${esc(href)}" rel="noopener">` : "<a>";
    }
    if (name === "img") {
      const src = attr(tag, "src") ?? "";
      if (!/^https:\/\//.test(src) && !src.startsWith("/classroom-img/")) return "";
      return `<img src="${esc(cleanWixImage(src))}" alt="${esc(attr(tag, "alt") ?? "")}" loading="lazy" />`;
    }
    if (name === "br") return "<br />";
    return `<${name}>`;
  });
  return h
    .replace(/<p>\s*(<br \/>\s*)*<\/p>/g, "")
    .replace(/<(strong|em|u)>\s*<\/\1>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export type ParsedWixPost = {
  title: string; metaTitle: string | null; metaDescription: string | null; author: string | null;
  publishedAt: string | null; heroImage: string | null; heroAlt: string; contentHtml: string; wixCategory: string | null;
};

/** Extracts a Wix blog post page into plain fields. Returns null if the page has no post body. */
export function parseWixPost(html: string): ParsedWixPost | null {
  const s = html.indexOf("rcv-block-first"), e = html.indexOf("rcv-block-last");
  if (s < 0 || e < 0 || e <= s) return null;
  const start = html.indexOf(">", s) + 1;
  let body = sanitizeHtml(html.slice(start, e).replace(/<[^>]*$/, ""));
  const meta = (p: string) => { const m = html.match(new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)"`)); return m ? decode(m[1]!) : null; };
  const titleTag = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const ogTitle = meta("og:title");
  let hero: string | null = null, heroAlt = "";
  const first = body.match(/^(?:\s*<br \/>)*\s*(?:<figure>\s*)?<img src="([^"]+)" alt="([^"]*)"[^>]*\/>\s*(?:<\/figure>)?/);
  if (first) { hero = decode(first[1]!); heroAlt = decode(first[2]!); body = body.slice(first[0].length).replace(/^(\s*<br \/>)+/, "").trim(); }
  const ogImg = meta("og:image");
  if (!hero && ogImg?.startsWith("https://")) hero = cleanWixImage(ogImg);
  const title = ogTitle || (titleTag ? decode(titleTag).replace(/\s*\|.*$/, "") : "");
  if (!title || !body) return null;
  return {
    title,
    metaTitle: titleTag ? decode(titleTag) : null,
    metaDescription: meta("description") ?? meta("og:description"),
    author: html.match(/"author":\{"@type":"Person","name":"([^"]+)"/)?.[1] ?? null,
    publishedAt: html.match(/"datePublished":"([^"]+)"/)?.[1] ?? null,
    heroImage: hero, heroAlt: heroAlt || title,
    contentHtml: body,
    wixCategory: html.match(/\/harmoniousclassroom\/categories\/([a-z0-9-]+)/)?.[1] ?? null,
  };
}

/** Best-effort category from Wix category or slug words. */
export function guessCategory(slug: string, wixCategory: string | null, map: Record<string, string>): string {
  if (wixCategory && map[wixCategory]) return map[wixCategory]!;
  const s = slug;
  if (/spv/.test(s)) return "spvs";
  if (/cap-table|equity|chain-of-title|409a/.test(s)) return "cap-tables";
  if (/k-1|k1|tax|1065|boi|form-d|blue-sky/.test(s)) return s.includes("boi") || s.includes("form-d") ? "compliance" : "tax-reporting";
  if (/kyc|aml|compliance|accredit/.test(s)) return "compliance";
  if (/investor|onboard/.test(s)) return "investor-onboarding";
  if (/accounting|nav|books/.test(s)) return "fund-accounting";
  if (/fund|gp|lp|carry|management-fee/.test(s)) return "fund-administration";
  return "private-markets";
}
