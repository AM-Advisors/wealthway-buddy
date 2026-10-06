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

export async function linkedinConfigured() {
  const { directStatus } = await import("@/lib/linkedin-direct.server");
  return (await directStatus()).connected;
}
export function metaConfigured() { return !!process.env["META_PAGE_ACCESS_TOKEN"]; }

const LI = "https://api.linkedin.com";

async function linkedinImage(token: string, orgUrn: string, imageUrl: string): Promise<string | null> {
  const { liHeaders } = await import("@/lib/linkedin-direct.server");
  try {
    const init = await fetch(`${LI}/rest/images?action=initializeUpload`, {
      method: "POST", headers: liHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ initializeUploadRequest: { owner: orgUrn } }),
    });
    if (!init.ok) { console.error(`LinkedIn image init failed [${init.status}]: ${await init.text()}`); return null; }
    const v = (await init.json())?.value;
    const bytes = await (await fetch(imageUrl)).arrayBuffer();
    const put = await fetch(v.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: bytes });
    return put.ok ? String(v.image) : null;
  } catch (e) { console.error("LinkedIn image upload skipped", e); return null; }
}

/** Posts only as the Harmonious company page (never a personal profile). */
export async function publishLinkedIn(orgId: string, text: string, imageUrl: string | null): Promise<string> {
  if (!orgId || orgId === "me") throw new Error("Set the LinkedIn company page in Marketing → Channels.");
  const { accessToken, liHeaders } = await import("@/lib/linkedin-direct.server");
  const token = await accessToken();
  const author = orgId.startsWith("urn:") ? orgId : `urn:li:organization:${orgId}`;
  const image = imageUrl ? await linkedinImage(token, author, imageUrl) : null;
  const res = await fetch(`${LI}/rest/posts`, {
    method: "POST", headers: liHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      author, commentary: text, visibility: "PUBLIC", lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(image ? { content: { media: { id: image } } } : {}),
    }),
  });
  if (!res.ok) await fail(res, "LinkedIn post");
  return res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "posted";
}

function metaToken() {
  const t = process.env["META_PAGE_ACCESS_TOKEN"];
  if (!t) throw new Error("Facebook/Instagram isn't connected yet.");
  return t;
}

export async function publishFacebook(pageId: string, text: string, imageUrl: string | null): Promise<string> {
  const p = new URLSearchParams({ access_token: metaToken() });
  let url: string;
  if (imageUrl) { p.set("url", imageUrl); p.set("caption", text); url = `${GRAPH}/${encodeURIComponent(pageId)}/photos`; }
  else { p.set("message", text); url = `${GRAPH}/${encodeURIComponent(pageId)}/feed`; }
  const res = await fetch(url, { method: "POST", body: p });
  if (!res.ok) await fail(res, "Facebook post");
  const j: any = await res.json();
  return String(j.post_id ?? j.id);
}

export async function publishInstagram(igId: string, text: string, imageUrl: string | null): Promise<string> {
  if (!imageUrl) throw new Error("Instagram posts need an image.");
  const token = metaToken();
  const c = await fetch(`${GRAPH}/${encodeURIComponent(igId)}/media`, { method: "POST", body: new URLSearchParams({ image_url: imageUrl, caption: text, access_token: token }) });
  if (!c.ok) await fail(c, "Instagram media");
  const creation = (await c.json()).id;
  // Container processing is usually instant for images; give it a short moment.
  await new Promise((r) => setTimeout(r, 3000));
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
