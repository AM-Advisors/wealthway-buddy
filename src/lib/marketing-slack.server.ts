/**
 * Slack for Marketing post approvals. Server-only.
 * - On submit: posts to #team-marketing tagging Alyssa and McKay with title, channels, text and image.
 * - In Slack: a ✅ reaction approves, ❌ sends back. The reacting Slack user is matched to a
 *   Harmonious account by email and decidePost re-checks role + maker-checker, so Slack never grants authority.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { decidePost } from "@/lib/marketing.server";

const GATEWAY = "https://connector-gateway.lovable.dev/slack/api";
export const MARKETING_SLACK_CHANNEL = "C07KX1FB6KF"; // #team-marketing
const MENTIONS = ["U04BP9Q4DHP", "U07UAMG3VAA"]; // Alyssa Pettit, McKay
const SITE = "https://app.harmonious.co";
const APPROVE = new Set(["white_check_mark", "heavy_check_mark", "white_tick"]);
const REJECT = new Set(["x", "negative_squared_cross_mark"]);

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
// The provisioned approvals app's bot key (falls back to the shared Slack connection for sending).
const botKey = () => process.env["MARKETING_SLACK_API_KEY"] ?? process.env["SLACK_API_KEY_1"] ?? process.env["SLACK_API_KEY"];

async function slack(method: string, body: Record<string, unknown>) {
  const lk = process.env["LOVABLE_API_KEY"], key = botKey();
  if (!lk || !key) throw new Error("Slack is not connected.");
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": key, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`Slack ${method} failed [${res.status}]: ${data.error ?? "unknown"}`);
  return data;
}

/** Best-effort: never blocks the submit. */
export async function notifyPostSubmitted(postId: string, submitterId: string) {
  try {
    const db = await admin();
    const { data: p } = await db.from("marketing_posts").select("*").eq("id", postId).maybeSingle();
    if (!p) return;
    const { data: prof } = await db.from("profiles").select("legal_name, email").eq("user_id", submitterId).maybeSingle();
    const paths: string[] = p.image_paths ?? [];
    const { data: urls } = paths.length ? await db.storage.from("marketing-assets").createSignedUrls(paths.slice(0, 3), 7 * 86400) : { data: [] };
    const text = String(p.body ?? "").slice(0, 2800);
    const chans = (p.channels ?? []).map((c: string) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ") || "—";
    const blocks: any[] = [
      { type: "section", text: { type: "mrkdwn", text: `${MENTIONS.map((u) => `<@${u}>`).join(" ")} a post is ready for approval${prof ? ` (submitted by ${prof.legal_name || prof.email})` : ""}.` } },
      { type: "section", fields: [{ type: "mrkdwn", text: `*Title*\n${p.title}` }, { type: "mrkdwn", text: `*Channels*\n${chans}` }] },
      { type: "section", text: { type: "mrkdwn", text: `*Post text*\n${text || "_(empty)_"}` } },
      ...((urls ?? []) as any[]).filter((u) => u.signedUrl).map((u, i) => ({ type: "image", image_url: u.signedUrl, alt_text: `${p.title} image ${i + 1}` })),
      { type: "context", elements: [{ type: "mrkdwn", text: `React :white_check_mark: to approve or :x: to send back · <${SITE}/marketing/posts/${p.id}|Open in Harmonious>` }] },
    ];
    try { await slack("conversations.join", { channel: MARKETING_SLACK_CHANNEL }); } catch { /* may lack scope; bot may already be a member */ }
    const r = await slack("chat.postMessage", { channel: MARKETING_SLACK_CHANNEL, text: `Post ready for approval: ${p.title}`, blocks, unfurl_links: false });
    await db.from("marketing_slack_messages").insert({ post_id: p.id, channel: r.channel, ts: r.ts });
  } catch (e) {
    console.error("marketing slack notify", e);
  }
}

export function verifySlackSignature(raw: string, ts: string | null, sig: string | null) {
  const secret = process.env["SLACK_SIGNING_SECRET"];
  if (!secret) return "absent" as const;
  if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return "invalid" as const;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex")}`;
  const a = Buffer.from(expected), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b) ? ("ok" as const) : ("invalid" as const);
}

export async function handleReaction(ev: any) {
  const name = String(ev?.reaction ?? "").split("::")[0] ?? "";
  const action = APPROVE.has(name) ? "approve" : REJECT.has(name) ? "reject" : null;
  if (!action || ev?.item?.type !== "message") return;
  const db = await admin();
  const { data: m } = await db.from("marketing_slack_messages").select("post_id, channel, ts").eq("channel", ev.item.channel).eq("ts", ev.item.ts).maybeSingle();
  if (!m) return;
  const reply = (t: string) => slack("chat.postMessage", { channel: m.channel, thread_ts: m.ts, text: t }).catch((e) => console.error(e));
  let email: string | null = null;
  try { email = (await slack("users.info", { user: ev.user })).user?.profile?.email ?? null; } catch (e) { console.error(e); }
  if (!email) return reply(`<@${ev.user}> I couldn't match your Slack account to Harmonious. Please approve in the app.`);
  const { data: prof } = await db.from("profiles").select("user_id").ilike("email", email).maybeSingle();
  if (!prof) return reply(`<@${ev.user}> no Harmonious account uses ${email}. Please approve in the app.`);
  try {
    await decidePost(prof.user_id, m.post_id, action, "Decided in Slack");
    await reply(action === "approve" ? `:white_check_mark: Approved by <@${ev.user}>. It will publish on schedule.` : `:x: Sent back to the author by <@${ev.user}>.`);
  } catch (e: any) {
    await reply(`<@${ev.user}> couldn't ${action === "approve" ? "approve" : "send back"}: ${e?.message ?? "error"}`);
  }
}
