/**
 * Marketing publishing to company social pages and Brevo email sends. Server-only.
 * LinkedIn: connector gateway (LINKEDIN_API_KEY), organization URN from marketing_channels.
 * Facebook/Instagram: Meta Graph API with META_PAGE_ACCESS_TOKEN; page / IG business ids from marketing_channels.
 */
const GATEWAY = "https://connector-gateway.lovable.dev";
const GRAPH = "https://graph.facebook.com/v21.0";

async function fail(res: Response, what: string): Promise<never> {
  const body = await res.text().catch(() => "");
  console.error(`${what} failed [${res.status}]: ${body}`);
  throw new Error(`${what} failed [${res.status}]: ${body.slice(0, 400)}`);
}

function liToken() { return process.env["LINKEDIN_ORG_ACCESS_TOKEN"]?.trim().replace(/^["']|["']$/g, ""); }
export async function linkedinConfigured() {
  if (process.env["LINKEDIN_CLIENT_ID"] && process.env["LINKEDIN_CLIENT_SECRET"]) {
    const s = await (await import("@/lib/linkedin-direct.server")).directStatus().catch(() => null) as any;
    if (s?.connected) return true;
  }
  return !!liToken();
}
/** Company-page token: the in-app LinkedIn connection (auto-refreshing) first, then a manually saved token. */
async function liBearer(): Promise<string> {
  try { return await (await import("@/lib/linkedin-direct.server")).accessToken(); }
  catch (e) { const t = liToken(); if (t) return t; throw e; }
}

/** Direct LinkedIn API with the Harmonious company-page token (Community Management API). */
async function liFetch(path: string, init: RequestInit = {}) {
  const token = await liBearer();
  return fetch(`https://api.linkedin.com${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202504", "X-Restli-Protocol-Version": "2.0.0" },
  });
}

async function linkedinImage(owner: string, imageUrl: string): Promise<string | null> {
  try {
    const init = await liFetch(`/rest/images?action=initializeUpload`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
    });
    if (!init.ok) { console.error(`LinkedIn image init failed [${init.status}]: ${await init.text()}`); return null; }
    const v = (await init.json())?.value;
    const bytes = await (await fetch(imageUrl)).arrayBuffer();
    const put = await fetch(v.uploadUrl, { method: "PUT", body: bytes, headers: { Authorization: `Bearer ${await liBearer()}` } });
    return put.ok ? String(v.image) : null;
  } catch (e) { console.error("LinkedIn image upload skipped", e); return null; }
}

/** Always posts as the company page set in Channels; never as a person. */
export async function publishLinkedIn(orgId: string, text: string, imageUrl: string | null): Promise<string> {
  if (!orgId || orgId === "me") throw new Error("Set the Harmonious company page in Marketing → Channels first.");
  const author = orgId.startsWith("urn:") ? orgId : `urn:li:organization:${orgId}`;
  const image = imageUrl ? await linkedinImage(author, imageUrl) : null;
  const res = await liFetch(`/rest/posts`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      author, commentary: text, visibility: "PUBLIC", lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(image ? { content: { media: { id: image } } } : {}),
    }),
  });
  if (!res.ok) await fail(res, "LinkedIn post");
  return res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "posted";
}

export function metaConfigured() { return !!process.env["META_PAGE_ACCESS_TOKEN"]?.trim(); }
function metaToken() {
  // Strip stray whitespace/quotes picked up when the token was copied.
  const t = process.env["META_PAGE_ACCESS_TOKEN"]?.trim().replace(/^["']|["']$/g, "");
  if (!t) throw new Error("Facebook/Instagram isn't connected yet.");
  return t;
}

/**
 * The saved token may be a Page token or a (system) user token that manages the page.
 * Posting needs the Page token, so when the saved token can list pages we swap in the
 * matching page's token. `id` may be a Facebook page id or its Instagram business id.
 */
async function metaTarget(id: string): Promise<{ token: string; id: string }> {
  const saved = metaToken();
  try {
    const r = await fetch(`${GRAPH}/me/accounts?${new URLSearchParams({ access_token: saved, fields: "id,access_token,instagram_business_account", limit: "100" })}`);
    if (r.ok) {
      const pages: any[] = (await r.json()).data ?? [];
      const byPage = pages.find((p) => p.id === id);
      if (byPage?.access_token) return { token: byPage.access_token, id };
      const byIg = pages.find((p) => p.instagram_business_account?.id === id);
      if (byIg?.access_token) return { token: byIg.access_token, id };
      // A single managed page with Instagram: use it when the configured id isn't recognised.
      const withIg = pages.filter((p) => p.instagram_business_account?.id && p.access_token);
      if (withIg.length === 1 && !pages.some((p) => p.id === id)) {
        return { token: withIg[0].access_token, id: withIg[0].instagram_business_account.id };
      }
    }
  } catch { /* fall back to the saved token as-is */ }
  return { token: saved, id };
}

/** Facebook: no image = text post, one image = photo post, 2-10 images = multi-photo post. */
export async function publishFacebook(pageId: string, text: string, images: string | string[] | null): Promise<string> {
  const urls = (Array.isArray(images) ? images : images ? [images] : []).slice(0, 10);
  const { token } = await metaTarget(pageId);
  const base = `${GRAPH}/${encodeURIComponent(pageId)}`;
  if (urls.length > 1) {
    const ids: string[] = [];
    for (const u of urls) {
      const r = await fetch(`${base}/photos`, { method: "POST", body: new URLSearchParams({ url: u, published: "false", access_token: token }) });
      if (!r.ok) await fail(r, "Facebook photo upload");
      ids.push(String((await r.json()).id));
    }
    const p = new URLSearchParams({ message: text, access_token: token });
    ids.forEach((id, i) => p.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
    const res = await fetch(`${base}/feed`, { method: "POST", body: p });
    if (!res.ok) await fail(res, "Facebook post");
    return String((await res.json()).id);
  }
  const p = new URLSearchParams({ access_token: token });
  let url: string;
  if (urls[0]) { p.set("url", urls[0]); p.set("caption", text); url = `${base}/photos`; }
  else {
    p.set("message", text); url = `${base}/feed`;
    const link = text.match(/https?:\/\/[^\s)<>"']+/)?.[0]; // link preview card
    if (link) p.set("link", link.replace(/[.,!?;:]+$/, ""));
  }
  const res = await fetch(url, { method: "POST", body: p });
  if (!res.ok) await fail(res, "Facebook post");
  const j: any = await res.json();
  return String(j.post_id ?? j.id);
}

/** Instagram: one image = single post, 2-10 images = swipeable carousel. */
export async function publishInstagram(configuredId: string, text: string, images: string | string[] | null): Promise<string> {
  const urls = (Array.isArray(images) ? images : images ? [images] : []).slice(0, 10);
  if (!urls.length) throw new Error("Instagram posts need an image.");
  const { token, id: igId } = await metaTarget(configuredId);
  const media = `${GRAPH}/${encodeURIComponent(igId)}/media`;
  let creation: string;
  if (urls.length > 1) {
    const children: string[] = [];
    for (const u of urls) {
      const c = await fetch(media, { method: "POST", body: new URLSearchParams({ image_url: u, is_carousel_item: "true", access_token: token }) });
      if (!c.ok) await fail(c, "Instagram carousel slide");
      children.push(String((await c.json()).id));
    }
    const c = await fetch(media, { method: "POST", body: new URLSearchParams({ media_type: "CAROUSEL", children: children.join(","), caption: text, access_token: token }) });
    if (!c.ok) await fail(c, "Instagram carousel");
    creation = (await c.json()).id;
  } else {
    const c = await fetch(media, { method: "POST", body: new URLSearchParams({ image_url: urls[0]!, caption: text, access_token: token }) });
    if (!c.ok) await fail(c, "Instagram media");
    creation = (await c.json()).id;
  }
  // Container processing is usually quick for images; give it a short moment.
  await new Promise((r) => setTimeout(r, urls.length > 1 ? 5000 : 3000));
  const p = await fetch(`${GRAPH}/${encodeURIComponent(igId)}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: creation, access_token: token }) });
  if (!p.ok) await fail(p, "Instagram publish");
  return String((await p.json()).id);
}

/** One marketing email through Brevo with List-Unsubscribe. */
export async function sendMarketingEmail(to: string, subject: string, html: string, text: string, unsubscribeUrl: string, key: string, replyTo?: string, attachments?: { url: string; name: string }[]) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const brevo = process.env["BREVO_API_KEY"];
  if (!lovable || !brevo) throw new Error("Email sending isn't configured.");
  const res = await fetch(`${GATEWAY}/brevo/smtp/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": brevo },
    body: JSON.stringify({
      sender: { name: "Harmonious", email: "marketing@onboarding.harmonious.co" },
      to: [{ email: to }], ...(replyTo ? { replyTo: { email: replyTo } } : {}), subject, htmlContent: html, textContent: text, tags: ["marketing"], ...(attachments?.length ? { attachment: attachments } : {}),
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "X-Idempotency-Key": key },
    }),
  });
  if (!res.ok) await fail(res, "Email send");
}

/* ---------- Confirmation, test mode and insights (Meta Graph, supported endpoints only) ---------- */
/** A submission only counts once the platform returns the object with a permalink. */
export async function confirmMeta(channel: "facebook" | "instagram", ref: string, externalId: string): Promise<{ confirmed: boolean; permalink: string | null; error?: string }> {
  const { token } = await metaTarget(ref);
  const fields = channel === "facebook" ? "id,permalink_url,is_published" : "id,permalink";
  const r = await fetch(`${GRAPH}/${encodeURIComponent(externalId)}?${new URLSearchParams({ fields, access_token: token })}`);
  const body = await r.text();
  if (!r.ok) return { confirmed: false, permalink: null, error: `[${r.status}] ${body.slice(0, 300)}` };
  const j: any = JSON.parse(body);
  const permalink = j.permalink_url ?? j.permalink ?? null;
  if (channel === "facebook" && j.is_published === false) return { confirmed: false, permalink, error: "Facebook reports the post as unpublished." };
  return { confirmed: !!j.id && !!permalink, permalink, error: permalink ? undefined : "No permalink returned yet." };
}

/** Test mode: Facebook gets a nonpublic (unpublished) Page post; Instagram has no private destination, so it is validated only. */
export async function testFacebook(pageId: string, text: string, images: string[]): Promise<string> {
  const { token } = await metaTarget(pageId);
  const p = new URLSearchParams({ message: `[TEST — not public] ${text}`, published: "false", access_token: token });
  if (images[0]) p.set("link", images[0]);
  const res = await fetch(`${GRAPH}/${encodeURIComponent(pageId)}/feed`, { method: "POST", body: p });
  if (!res.ok) await fail(res, "Facebook test post");
  return String((await res.json()).id);
}
export async function validateInstagram(ref: string, text: string, images: string[]) {
  if (!images.length) throw new Error("Instagram needs at least one image.");
  if (text.length > 2200) throw new Error("Instagram captions are limited to 2,200 characters.");
  if ((text.match(/#/g) ?? []).length > 30) throw new Error("Instagram allows at most 30 hashtags.");
  const { token, id } = await metaTarget(ref);
  const r = await fetch(`${GRAPH}/${encodeURIComponent(id)}?${new URLSearchParams({ fields: "id,username", access_token: token })}`);
  if (!r.ok) await fail(r, "Instagram account check");
  for (const u of images) { const h = await fetch(u, { method: "HEAD" }); if (!h.ok) throw new Error(`An image couldn't be reached [${h.status}].`); }
  return "validated";
}

/** Post-level metrics. Any metric the API doesn't return is reported as unavailable (never zero). */
export async function metaInsights(channel: "facebook" | "instagram", ref: string, externalId: string) {
  const { token } = await metaTarget(ref);
  const out: Record<string, number> = {}; const unavailable: string[] = [];
  const get = async (path: string, q: Record<string, string>) => {
    const r = await fetch(`${GRAPH}/${path}?${new URLSearchParams({ ...q, access_token: token })}`);
    return r.ok ? r.json() : null;
  };
  if (channel === "facebook") {
    const base: any = await get(encodeURIComponent(externalId), { fields: "shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)" });
    if (base) { out.shares = base.shares?.count ?? 0; out.comments = base.comments?.summary?.total_count ?? 0; out.reactions = base.reactions?.summary?.total_count ?? 0; }
    else unavailable.push("shares", "comments", "reactions");
    const ins: any = await get(`${encodeURIComponent(externalId)}/insights`, { metric: "post_impressions,post_impressions_unique,post_clicks" });
    const val = (n: string) => ins?.data?.find((d: any) => d.name === n)?.values?.[0]?.value;
    for (const [k, n] of [["impressions", "post_impressions"], ["reach", "post_impressions_unique"], ["link_clicks", "post_clicks"]] as const) {
      const v = val(n); if (typeof v === "number") out[k] = v; else unavailable.push(k);
    }
    unavailable.push("saves");
  } else {
    const base: any = await get(encodeURIComponent(externalId), { fields: "like_count,comments_count" });
    if (base) { out.reactions = base.like_count ?? 0; out.comments = base.comments_count ?? 0; } else unavailable.push("reactions", "comments");
    const ins: any = await get(`${encodeURIComponent(externalId)}/insights`, { metric: "reach,saved,shares,views" });
    const val = (n: string) => ins?.data?.find((d: any) => d.name === n)?.values?.[0]?.value;
    for (const [k, n] of [["reach", "reach"], ["saves", "saved"], ["shares", "shares"], ["impressions", "views"]] as const) {
      const v = val(n); if (typeof v === "number") out[k] = v; else unavailable.push(k);
    }
    unavailable.push("link_clicks");
  }
  return { metrics: out, unavailable };
}
