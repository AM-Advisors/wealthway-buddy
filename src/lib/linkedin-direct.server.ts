/**
 * Direct LinkedIn integration using the Harmonious developer app (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET).
 * One company-wide token stored in public.linkedin_oauth (service role only). Posts go out as the company page only.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const LINKEDIN_REDIRECT_URI = "https://wealthway-buddy.lovable.app/api/public/linkedin/callback";
const SCOPES = "openid profile w_member_social w_organization_social r_organization_social rw_organization_admin";
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

function creds() {
  const id = process.env["LINKEDIN_CLIENT_ID"], secret = process.env["LINKEDIN_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("The LinkedIn app credentials aren't saved yet.");
  return { id, secret };
}
function sign(payload: string) { return createHmac("sha256", creds().secret).update(payload).digest("hex"); }

export function authUrl(userId: string) {
  const { id } = creds();
  const payload = `${userId}.${Date.now()}`;
  const state = Buffer.from(`${payload}.${sign(payload)}`).toString("base64url");
  const p = new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: LINKEDIN_REDIRECT_URI, state, scope: SCOPES });
  return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
}

/** Returns the userId that started the flow, or throws. State is valid for 15 minutes. */
export function verifyState(state: string): string {
  const raw = Buffer.from(state, "base64url").toString();
  const [userId, ts, sig] = raw.split(".");
  if (!userId || !ts || !sig) throw new Error("Bad state");
  const exp = sign(`${userId}.${ts}`);
  if (sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) throw new Error("Bad state");
  if (Date.now() - Number(ts) > 15 * 60_000) throw new Error("This sign-in link expired. Start again.");
  return userId;
}

async function tokenRequest(body: Record<string, string>) {
  const { id, secret } = creds();
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: id, client_secret: secret }),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`LinkedIn token failed [${res.status}]: ${text}`); throw new Error(`LinkedIn sign-in failed [${res.status}]: ${text.slice(0, 300)}`); }
  return JSON.parse(text);
}

function tokenRow(t: any) {
  const now = Date.now();
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expires_at: t.expires_in ? new Date(now + t.expires_in * 1000).toISOString() : null,
    refresh_expires_at: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : null,
    scopes: t.scope ?? null,
  };
}

export const liHeaders = (token: string, extra: Record<string, string> = {}) =>
  ({ Authorization: `Bearer ${token}`, "LinkedIn-Version": "202405", "X-Restli-Protocol-Version": "2.0.0", ...extra });

/** Company pages the connected person administers. */
async function adminOrgs(token: string) {
  const res = await fetch("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED", { headers: liHeaders(token) });
  if (!res.ok) { console.error(`LinkedIn org list failed [${res.status}]: ${await res.text()}`); return []; }
  const ids: string[] = ((await res.json()).elements ?? []).map((e: any) => String(e.organization ?? e.organizationTarget ?? "").split(":").pop()).filter(Boolean);
  const out: { id: string; name: string }[] = [];
  for (const id of ids) {
    const o = await fetch(`https://api.linkedin.com/rest/organizations/${id}`, { headers: liHeaders(token) });
    out.push({ id, name: o.ok ? ((await o.json()).localizedName ?? `Page ${id}`) : `Page ${id}` });
  }
  return out;
}

export async function completeAuth(code: string, userId: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: LINKEDIN_REDIRECT_URI });
  const orgs = await adminOrgs(t.access_token);
  const db = await admin();
  await db.from("linkedin_oauth").upsert({ id: true, ...tokenRow(t), organizations: orgs, connected_by: userId, connected_at: new Date().toISOString() });
  // Pick the Harmonious page automatically when it's clear which one.
  const pick = orgs.find((o) => /harmonious/i.test(o.name)) ?? (orgs.length === 1 ? orgs[0] : null);
  if (pick) await db.from("marketing_channels").upsert({ channel: "linkedin", account_ref: pick.id, display_name: pick.name, updated_by: userId, updated_at: new Date().toISOString() });
  return { orgs, picked: pick };
}

export async function directStatus() {
  const { data } = await (await admin()).from("linkedin_oauth").select("expires_at, refresh_expires_at, organizations, connected_at").maybeSingle();
  return data ? { connected: true, expiresAt: data.expires_at, organizations: data.organizations ?? [], connectedAt: data.connected_at } : { connected: false, expiresAt: null, organizations: [], connectedAt: null };
}

export async function disconnectDirect() { await (await admin()).from("linkedin_oauth").delete().eq("id", true); }

/** A valid access token, refreshed when close to expiry. */
export async function accessToken(): Promise<string> {
  const db = await admin();
  const { data } = await db.from("linkedin_oauth").select("*").maybeSingle();
  if (!data) throw new Error("LinkedIn company page isn't connected yet.");
  const exp = data.expires_at ? new Date(data.expires_at).getTime() : Infinity;
  if (exp - Date.now() > 5 * 60_000) return data.access_token;
  if (!data.refresh_token) throw new Error("LinkedIn access expired. A Marketing Manager needs to reconnect LinkedIn in Marketing → Channels.");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  const row = tokenRow(t);
  await db.from("linkedin_oauth").update({ ...row, refresh_token: row.refresh_token ?? data.refresh_token }).eq("id", true);
  return row.access_token;
}
