/**
 * Marketing campaigns: themed date ranges that group posts and emails. Server-only.
 * Campaigns are planning containers; sending still goes through the email
 * approval flow in marketing.server.ts (approver differs from author).
 */
import { requireMarketing, saveEmail, decideEmail } from "@/lib/marketing.server";

export const CAMPAIGN_COLORS = ["teal", "navy", "amber", "rose", "violet", "green"] as const;

export async function listCampaigns(userId: string, from?: string | null, to?: string | null) {
  const { db } = await requireMarketing(userId);
  let q = db.from("marketing_campaigns").select("*").is("archived_at", null).order("starts_on");
  if (from && to) q = q.lte("starts_on", to.slice(0, 10)).gte("ends_on", from.slice(0, 10));
  const { data } = await q.limit(500);
  const rows = (data ?? []) as any[];
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, { emails: number; posts: number }>();
  if (ids.length) {
    const [{ data: e }, { data: p }] = await Promise.all([
      db.from("marketing_emails").select("campaign_id").in("campaign_id", ids),
      db.from("marketing_posts").select("campaign_id").in("campaign_id", ids),
    ]);
    for (const r of (e ?? []) as any[]) { const c = counts.get(r.campaign_id) ?? { emails: 0, posts: 0 }; c.emails++; counts.set(r.campaign_id, c); }
    for (const r of (p ?? []) as any[]) { const c = counts.get(r.campaign_id) ?? { emails: 0, posts: 0 }; c.posts++; counts.set(r.campaign_id, c); }
  }
  return rows.map((r) => ({ ...r, emails: counts.get(r.id)?.emails ?? 0, posts: counts.get(r.id)?.posts ?? 0 }));
}

export async function saveCampaign(userId: string, d: { id?: string | null | undefined; name: string; theme: string | null; goal: string | null; notes: string | null; color: string; startsOn: string; endsOn: string }) {
  const { db } = await requireMarketing(userId);
  if (d.endsOn < d.startsOn) throw new Error("The end date must be on or after the start date.");
  const fields = { name: d.name.trim().slice(0, 160), theme: d.theme, goal: d.goal, notes: d.notes, color: (CAMPAIGN_COLORS as readonly string[]).includes(d.color) ? d.color : "teal", starts_on: d.startsOn, ends_on: d.endsOn, updated_at: new Date().toISOString() };
  if (!fields.name) throw new Error("Give the campaign a name.");
  if (d.id) {
    const { error } = await db.from("marketing_campaigns").update(fields).eq("id", d.id);
    if (error) throw new Error(error.message);
    return { id: d.id };
  }
  const { data, error } = await db.from("marketing_campaigns").insert({ ...fields, created_by: userId }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function archiveCampaign(userId: string, id: string) {
  const { db } = await requireMarketing(userId);
  await db.from("marketing_campaigns").update({ archived_at: new Date().toISOString() }).eq("id", id);
  return { ok: true };
}

export async function getCampaign(userId: string, id: string) {
  const { db, canApprove } = await requireMarketing(userId);
  const { data: c } = await db.from("marketing_campaigns").select("*").eq("id", id).maybeSingle();
  if (!c) throw new Error("Campaign not found.");
  const [{ data: emails }, { data: posts }, { data: loose }, { data: audiences }] = await Promise.all([
    db.from("marketing_emails").select("id, name, subject, status, scheduled_at, sent_at, author_id").eq("campaign_id", id).order("scheduled_at"),
    db.from("marketing_posts").select("id, title, status, channels, scheduled_at, published_at").eq("campaign_id", id).order("scheduled_at"),
    db.from("marketing_emails").select("id, name, status").is("campaign_id", null).in("status", ["draft", "submitted", "approved", "scheduled", "rejected"]).limit(100),
    db.from("marketing_audiences").select("id, name").order("name"),
  ]);
  return { campaign: c, emails: emails ?? [], posts: posts ?? [], unassignedEmails: loose ?? [], audiences: audiences ?? [], canApprove, me: userId };
}

export async function assignToCampaign(userId: string, kind: "email" | "post", itemId: string, campaignId: string | null) {
  const { db } = await requireMarketing(userId);
  await db.from(kind === "email" ? "marketing_emails" : "marketing_posts").update({ campaign_id: campaignId }).eq("id", itemId);
  return { ok: true };
}

/** Write an email inside a campaign and submit it for approval in one step. */
export async function composeCampaignEmail(userId: string, d: { campaignId: string; name: string; subject: string; heading: string | null; body: string; buttonText: string | null; buttonHref: string | null; audienceId: string; sendAt: string | null; submit: boolean }) {
  const { db } = await requireMarketing(userId);
  const blocks: any[] = [];
  if (d.heading) blocks.push({ type: "heading", text: d.heading });
  blocks.push({ type: "text", text: d.body });
  if (d.buttonText && d.buttonHref) blocks.push({ type: "button", text: d.buttonText, href: d.buttonHref });
  const { id } = await saveEmail(userId, { name: d.name || d.subject, subject: d.subject, preheader: null, blocks, audienceId: d.audienceId, scheduledAt: d.sendAt });
  await db.from("marketing_emails").update({ campaign_id: d.campaignId }).eq("id", id);
  if (d.submit) await decideEmail(userId, id, "submit");
  return { id };
}
