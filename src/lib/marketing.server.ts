/**
 * Marketing: posts, emails, audiences, calendar, approvals and the scheduler. Server-only.
 * Every write re-checks the caller's role; approver must differ from author (maker-checker).
 * Nothing publishes or sends unless approved; published/sent items are locked.
 */
import {
  CHANNELS, MARKETING_ACCESS, MARKETING_APPROVERS, emailProblems, parseCsvEmails, postProblems,
  renderEmailHtml, renderEmailText, type EmailBlock,
} from "@/lib/marketing-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const BUCKET = "marketing-assets";
const SITE = "https://app.harmonious.co";
const EDITABLE = ["draft", "submitted", "approved", "scheduled", "rejected", "failed"];

async function rolesOf(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
export async function requireMarketing(userId: string) {
  const db = await admin();
  const roles = await rolesOf(db, userId);
  if (!roles.some((r) => MARKETING_ACCESS.includes(r))) throw new Error("Only the Marketing team can use this.");
  return { db, roles, canApprove: roles.some((r) => MARKETING_APPROVERS.includes(r)) };
}
async function audit(db: any, item_type: "post" | "email", item_id: string, action: string, actor_id: string, note?: string | null) {
  await db.from("marketing_approvals").insert({ item_type, item_id, action, actor_id, note: note ?? null });
}
async function names(db: any, ids: string[]) {
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return new Map<string, string>();
  const { data } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", u);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
}
async function signed(db: any, paths: string[], secs = 3600) {
  if (!paths.length) return [] as string[];
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, secs);
  return ((data ?? []) as any[]).map((d) => d.signedUrl as string);
}

/* ---------- Assets ---------- */
export async function uploadAsset(userId: string, fileName: string, contentType: string, base64: string) {
  const { db } = await requireMarketing(userId);
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(contentType)) throw new Error("Upload a PNG, JPG, GIF or WebP image.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 15 * 1024 * 1024) throw new Error("Images must be under 15 MB.");
  const path = `${userId}/${crypto.randomUUID()}-${fileName.replace(/[^\w.-]/g, "_").slice(-60)}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType });
  if (error) throw new Error(error.message);
  const [url] = await signed(db, [path]);
  return { path, url: url ?? "" };
}

/* ---------- Posts ---------- */
export async function listPosts(userId: string) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("marketing_posts").select("*").order("updated_at", { ascending: false }).limit(300);
  const rows = (data ?? []) as any[];
  const n = await names(db, rows.map((r) => r.author_id));
  return rows.map((r) => ({ ...r, author_name: n.get(r.author_id) ?? "" }));
}

export async function getPost(userId: string, id: string) {
  const { db, canApprove } = await requireMarketing(userId);
  const { data: p } = await db.from("marketing_posts").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Post not found.");
  const [{ data: targets }, { data: history }] = await Promise.all([
    db.from("marketing_post_targets").select("*").eq("post_id", id),
    db.from("marketing_approvals").select("*").eq("item_type", "post").eq("item_id", id).order("created_at", { ascending: false }),
  ]);
  const n = await names(db, [p.author_id, p.approved_by, ...((history ?? []) as any[]).map((h) => h.actor_id)]);
  return {
    post: { ...p, author_name: n.get(p.author_id) ?? "", approver_name: p.approved_by ? n.get(p.approved_by) ?? "" : null },
    imageUrls: await signed(db, p.image_paths ?? []),
    targets: targets ?? [],
    history: ((history ?? []) as any[]).map((h) => ({ ...h, actor_name: n.get(h.actor_id) ?? "" })),
    canApprove: canApprove && p.author_id !== userId,
    isAuthor: p.author_id === userId,
  };
}

export async function savePost(userId: string, d: { id?: string | null | undefined; title: string; body: string; channels: string[]; imagePaths: string[]; scheduledAt: string | null }) {
  const { db } = await requireMarketing(userId);
  const channels = d.channels.filter((c) => (CHANNELS as readonly string[]).includes(c));
  const fields = { title: d.title.slice(0, 200), body: d.body, channels, image_paths: d.imagePaths.slice(0, 10), scheduled_at: d.scheduledAt, updated_at: new Date().toISOString() };
  if (!d.id) {
    const { data, error } = await db.from("marketing_posts").insert({ ...fields, author_id: userId, status: "draft" }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(db, "post", data.id, "created", userId);
    return { id: data.id as string };
  }
  const { data: cur } = await db.from("marketing_posts").select("status").eq("id", d.id).maybeSingle();
  if (!cur) throw new Error("Post not found.");
  if (!EDITABLE.includes(cur.status)) throw new Error("Published posts are locked.");
  const reset = cur.status !== "draft";
  await db.from("marketing_posts").update({ ...fields, status: "draft", approved_by: null, approved_at: null }).eq("id", d.id);
  await audit(db, "post", d.id, reset ? "edited_back_to_draft" : "edited", userId);
  return { id: d.id };
}

export async function decidePost(userId: string, id: string, action: "submit" | "approve" | "reject", note?: string | null) {
  const { db, canApprove } = await requireMarketing(userId);
  const { data: p } = await db.from("marketing_posts").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Post not found.");
  if (action === "submit") {
    if (p.status !== "draft" && p.status !== "rejected") throw new Error("Only drafts can be submitted.");
    const probs = postProblems({ title: p.title, body: p.body, channels: p.channels, imageCount: (p.image_paths ?? []).length });
    if (probs.length) throw new Error(probs.join(" "));
    const missing = await missingChannels(db, p.channels);
    if (missing.length) throw new Error(`Connect ${missing.join(", ")} on the Channels page first.`);
    await db.from("marketing_posts").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", id);
  } else {
    if (p.status !== "submitted") throw new Error("Only submitted posts can be approved or sent back.");
    if (!canApprove) throw new Error("Only a Marketing Manager or leadership can approve.");
    if (p.author_id === userId) throw new Error("Someone other than the author must approve.");
    if (action === "approve") {
      const scheduled_at = p.scheduled_at ?? new Date().toISOString();
      await db.from("marketing_posts").update({ status: "scheduled", scheduled_at, approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
      await db.from("marketing_post_targets").upsert(p.channels.map((channel: string) => ({ post_id: id, channel, status: "pending", error: null })), { onConflict: "post_id,channel" });
    } else {
      await db.from("marketing_posts").update({ status: "rejected" }).eq("id", id);
    }
  }
  await audit(db, "post", id, action === "submit" ? "submitted" : action === "approve" ? "approved" : "sent_back", userId, note);
  if (action === "approve") await runDue().catch((e) => console.error("marketing run after approve", e));
  return { ok: true };
}

/* ---------- Channels ---------- */
async function channelRows(db: any) {
  const { data } = await db.from("marketing_channels").select("*");
  return new Map(((data ?? []) as any[]).map((c) => [c.channel, c]));
}
async function missingChannels(db: any, channels: string[]) {
  const st = await channelStatusInner(db);
  return channels.filter((c) => !st.find((s) => s.channel === c)?.ready).map((c) => st.find((s) => s.channel === c)?.label ?? c);
}
async function channelStatusInner(db: any) {
  const { linkedinConfigured, metaConfigured } = await import("@/lib/marketing-publish.server");
  const rows = await channelRows(db);
  const li = linkedinConfigured(), meta = metaConfigured();
  return [
    { channel: "linkedin", label: "LinkedIn", credential: li, accountRef: rows.get("linkedin")?.account_ref ?? null, displayName: rows.get("linkedin")?.display_name ?? null, ready: li && !!rows.get("linkedin")?.account_ref, refHint: "LinkedIn company page (organization) ID" },
    { channel: "facebook", label: "Facebook", credential: meta, accountRef: rows.get("facebook")?.account_ref ?? null, displayName: rows.get("facebook")?.display_name ?? null, ready: meta && !!rows.get("facebook")?.account_ref, refHint: "Facebook Page ID" },
    { channel: "instagram", label: "Instagram", credential: meta, accountRef: rows.get("instagram")?.account_ref ?? null, displayName: rows.get("instagram")?.display_name ?? null, ready: meta && !!rows.get("instagram")?.account_ref, refHint: "Instagram Business account ID" },
  ];
}
export async function channelStatus(userId: string) {
  const { db, canApprove } = await requireMarketing(userId);
  return { channels: await channelStatusInner(db), canEdit: canApprove };
}
export async function setChannel(userId: string, channel: string, accountRef: string, displayName: string | null) {
  const { db, canApprove } = await requireMarketing(userId);
  if (!canApprove) throw new Error("Only a Marketing Manager or leadership can change channels.");
  if (!(CHANNELS as readonly string[]).includes(channel)) throw new Error("Unknown channel.");
  if (!/^[\w:.-]{3,80}$/.test(accountRef)) throw new Error("That account ID doesn't look right.");
  await db.from("marketing_channels").upsert({ channel, account_ref: accountRef, display_name: displayName, updated_by: userId, updated_at: new Date().toISOString() });
  return { ok: true };
}

/* ---------- Audiences ---------- */
async function unsubscribedSet(db: any, emails: string[]) {
  if (!emails.length) return new Set<string>();
  const out = new Set<string>();
  for (let i = 0; i < emails.length; i += 500) {
    const { data } = await db.from("email_unsubscribes").select("email").in("email", emails.slice(i, i + 500)).not("unsubscribed_at", "is", null);
    for (const r of (data ?? []) as any[]) out.add(r.email);
  }
  return out;
}

export async function listAudiences(userId: string) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("marketing_audiences").select("id, name, sources, created_at").order("created_at", { ascending: false });
  const rows = (data ?? []) as any[];
  const counts = await Promise.all(rows.map(async (a) => (await db.from("marketing_audience_members").select("id", { count: "exact", head: true }).eq("audience_id", a.id)).count ?? 0));
  return rows.map((a, i) => ({ ...a, members: counts[i] }));
}

export async function createAudience(userId: string, d: { name: string; sources: string[]; csv?: string | null | undefined }) {
  const { db } = await requireMarketing(userId);
  const members = new Map<string, string | null>();
  const add = (email: string | null | undefined, name: string | null | undefined) => { const e = email?.trim().toLowerCase(); if (e && /@/.test(e) && !members.has(e)) members.set(e, name ?? null); };
  if (d.sources.includes("sales")) {
    const { data } = await db.from("crm_contacts").select("email, full_name, consent").eq("scope", "harmonious").is("archived_at", null).not("email", "is", null).limit(10000);
    for (const c of (data ?? []) as any[]) if (c.consent !== "unsubscribed") add(c.email, c.full_name);
  }
  if (d.sources.includes("clients")) {
    const { data } = await db.from("client_contacts").select("email, full_name").is("deactivated_at", null).not("email", "is", null).limit(10000);
    for (const c of (data ?? []) as any[]) add(c.email, c.full_name);
  }
  if (d.sources.includes("investors")) {
    const { data: r } = await db.from("user_roles").select("user_id").eq("role", "investor").limit(10000);
    const ids = ((r ?? []) as any[]).map((x) => x.user_id);
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await db.from("profiles").select("email, legal_name").in("user_id", ids.slice(i, i + 500));
      for (const p of (data ?? []) as any[]) add(p.email, p.legal_name);
    }
  }
  if (d.sources.includes("csv") && d.csv) for (const m of parseCsvEmails(d.csv)) add(m.email, m.full_name);
  if (!members.size) throw new Error("No email addresses found for those sources.");
  const { data: a, error } = await db.from("marketing_audiences").insert({ name: d.name.slice(0, 120), sources: d.sources, created_by: userId }).select("id").single();
  if (error) throw new Error(error.message);
  const rows = [...members].map(([email, full_name]) => ({ audience_id: a.id, email, full_name }));
  for (let i = 0; i < rows.length; i += 500) await db.from("marketing_audience_members").insert(rows.slice(i, i + 500));
  return { id: a.id as string, members: rows.length };
}

/* ---------- Emails ---------- */
export async function listEmails(userId: string) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("marketing_emails").select("id, name, subject, status, scheduled_at, sent_at, author_id, audience_id, updated_at").order("updated_at", { ascending: false }).limit(300);
  const rows = (data ?? []) as any[];
  const n = await names(db, rows.map((r) => r.author_id));
  return rows.map((r) => ({ ...r, author_name: n.get(r.author_id) ?? "" }));
}

export async function getEmail(userId: string, id: string) {
  const { db, canApprove } = await requireMarketing(userId);
  const { data: e } = await db.from("marketing_emails").select("*").eq("id", id).maybeSingle();
  if (!e) throw new Error("Email not found.");
  const [{ data: history }, { data: sends }] = await Promise.all([
    db.from("marketing_approvals").select("*").eq("item_type", "email").eq("item_id", id).order("created_at", { ascending: false }),
    db.from("marketing_email_sends").select("status").eq("email_id", id),
  ]);
  const n = await names(db, [e.author_id, ...((history ?? []) as any[]).map((h) => h.actor_id)]);
  const tally: Record<string, number> = {};
  for (const s of (sends ?? []) as any[]) tally[s.status] = (tally[s.status] ?? 0) + 1;
  return {
    email: { ...e, author_name: n.get(e.author_id) ?? "" },
    history: ((history ?? []) as any[]).map((h) => ({ ...h, actor_name: n.get(h.actor_id) ?? "" })),
    sends: tally,
    canApprove: canApprove && e.author_id !== userId,
  };
}

export async function saveEmail(userId: string, d: { id?: string | null | undefined; name: string; subject: string; preheader: string | null; blocks: EmailBlock[]; audienceId: string | null; scheduledAt: string | null; attachmentAssetIds?: string[] | undefined }) {
  const { db } = await requireMarketing(userId);
  const fields = { name: d.name.slice(0, 200), subject: d.subject.slice(0, 200), preheader: d.preheader, blocks: d.blocks.slice(0, 60), audience_id: d.audienceId, scheduled_at: d.scheduledAt, updated_at: new Date().toISOString(), ...(d.attachmentAssetIds ? { attachment_asset_ids: d.attachmentAssetIds.slice(0, 5) } : {}) };
  if (!d.id) {
    const { data, error } = await db.from("marketing_emails").insert({ ...fields, author_id: userId, status: "draft" }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(db, "email", data.id, "created", userId);
    return { id: data.id as string };
  }
  const { data: cur } = await db.from("marketing_emails").select("status").eq("id", d.id).maybeSingle();
  if (!cur) throw new Error("Email not found.");
  if (!EDITABLE.includes(cur.status)) throw new Error("Sent emails are locked.");
  await db.from("marketing_emails").update({ ...fields, status: "draft", approved_by: null, approved_at: null }).eq("id", d.id);
  await audit(db, "email", d.id, cur.status !== "draft" ? "edited_back_to_draft" : "edited", userId);
  return { id: d.id };
}

export async function decideEmail(userId: string, id: string, action: "submit" | "approve" | "reject", note?: string | null) {
  const { db, canApprove } = await requireMarketing(userId);
  const { data: e } = await db.from("marketing_emails").select("*").eq("id", id).maybeSingle();
  if (!e) throw new Error("Email not found.");
  if (action === "submit") {
    if (e.status !== "draft" && e.status !== "rejected") throw new Error("Only drafts can be submitted.");
    const probs = emailProblems({ subject: e.subject, blocks: e.blocks ?? [], audienceId: e.audience_id });
    if (probs.length) throw new Error(probs.join(" "));
    await db.from("marketing_emails").update({ status: "submitted" }).eq("id", id);
  } else {
    if (e.status !== "submitted") throw new Error("Only submitted emails can be approved or sent back.");
    if (!canApprove) throw new Error("Only a Marketing Manager or leadership can approve.");
    if (e.author_id === userId) throw new Error("Someone other than the author must approve.");
    if (action === "approve") await db.from("marketing_emails").update({ status: "scheduled", scheduled_at: e.scheduled_at ?? new Date().toISOString(), approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
    else await db.from("marketing_emails").update({ status: "rejected" }).eq("id", id);
  }
  await audit(db, "email", id, action === "submit" ? "submitted" : action === "approve" ? "approved" : "sent_back", userId, note);
  if (action === "approve") await runDue().catch((err) => console.error("marketing run after approve", err));
  return { ok: true };
}

async function unsubscribeUrl(db: any, email: string) {
  await db.from("email_unsubscribes").upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
  const { data } = await db.from("email_unsubscribes").select("token").eq("email", email).single();
  return `${SITE}/unsubscribe/${data.token}`;
}

export async function unsubscribeUrlFor(email: string) { return unsubscribeUrl(await admin(), email); }

export async function sendTestEmail(userId: string, id: string) {
  const { db } = await requireMarketing(userId);
  const { data: e } = await db.from("marketing_emails").select("*").eq("id", id).maybeSingle();
  if (!e) throw new Error("Email not found.");
  const { data: me } = await db.from("profiles").select("email").eq("user_id", userId).maybeSingle();
  if (!me?.email) throw new Error("Your profile has no email address.");
  const unsub = await unsubscribeUrl(db, me.email);
  const { sendMarketingEmail } = await import("@/lib/marketing-publish.server");
  await sendMarketingEmail(me.email, `[Test] ${e.subject}`, renderEmailHtml(e, unsub), renderEmailText(e, unsub), unsub, crypto.randomUUID());
  return { to: me.email as string };
}

/* ---------- Unsubscribe (public, by token) ---------- */
export async function unsubscribeByToken(token: string) {
  const db = await admin();
  const { data } = await db.from("email_unsubscribes").select("email, unsubscribed_at").eq("token", token).maybeSingle();
  if (!data) return { ok: false as const };
  if (!data.unsubscribed_at) {
    await db.from("email_unsubscribes").update({ unsubscribed_at: new Date().toISOString() }).eq("token", token);
    await db.from("crm_contacts").update({ consent: "unsubscribed", consent_recorded_at: new Date().toISOString(), consent_note: "Unsubscribed via email link" }).ilike("email", data.email);
    await (await import("@/lib/email-flows.server")).onUnsubscribe(data.email);
  }
  return { ok: true as const };
}

/* ---------- Scheduler ---------- */
export async function runDue() {
  const db = await admin();
  const now = new Date().toISOString();
  const pub = await import("@/lib/marketing-publish.server");
  const result = { posts: 0, emails: 0 };

  const { data: posts } = await db.from("marketing_posts").select("*").in("status", ["scheduled", "approved"]).lte("scheduled_at", now).limit(20);
  for (const p of (posts ?? []) as any[]) {
    const { data: claimed } = await db.from("marketing_posts").update({ status: "publishing" }).eq("id", p.id).in("status", ["scheduled", "approved"]).select("id");
    if (!claimed?.length) continue;
    const ch = await channelRows(db);
    const [img] = await signed(db, (p.image_paths ?? []).slice(0, 1), 86400);
    let ok = 0;
    const { data: targets } = await db.from("marketing_post_targets").select("*").eq("post_id", p.id).neq("status", "published");
    for (const t of (targets ?? []) as any[]) {
      const ref = ch.get(t.channel)?.account_ref;
      try {
        if (!ref) throw new Error("Channel not connected.");
        const ext = t.channel === "linkedin" ? await pub.publishLinkedIn(ref, p.body, img ?? null)
          : t.channel === "facebook" ? await pub.publishFacebook(ref, p.body, img ?? null)
          : await pub.publishInstagram(ref, p.body, img ?? null);
        await db.from("marketing_post_targets").update({ status: "published", external_id: ext, error: null, published_at: new Date().toISOString() }).eq("id", t.id);
        ok++;
      } catch (e) {
        await db.from("marketing_post_targets").update({ status: "failed", error: String((e as Error).message).slice(0, 500) }).eq("id", t.id);
      }
    }
    const allDone = ok === (targets ?? []).length;
    await db.from("marketing_posts").update({ status: allDone ? "published" : "failed", published_at: allDone ? new Date().toISOString() : null }).eq("id", p.id);
    result.posts++;
  }

  const { data: emails } = await db.from("marketing_emails").select("*").in("status", ["scheduled", "approved"]).lte("scheduled_at", now).limit(5);
  for (const e of (emails ?? []) as any[]) {
    const { data: claimed } = await db.from("marketing_emails").update({ status: "sending" }).eq("id", e.id).in("status", ["scheduled", "approved"]).select("id");
    if (!claimed?.length) continue;
    const { data: members } = await db.from("marketing_audience_members").select("email").eq("audience_id", e.audience_id).limit(20000);
    const { data: done } = await db.from("marketing_email_sends").select("recipient").eq("email_id", e.id).limit(20000);
    const already = new Set(((done ?? []) as any[]).map((d) => d.recipient));
    const list = ((members ?? []) as any[]).map((m) => m.email as string).filter((m) => !already.has(m));
    const unsub = await unsubscribedSet(db, list);
    const files = await (await import("@/lib/marketing-drive.server")).attachmentsFor(db, e.attachment_asset_ids ?? []).catch((err) => { console.error("attachments", err); return []; });
    let failed = 0;
    for (const to of list) {
      if (unsub.has(to)) { await db.from("marketing_email_sends").insert({ email_id: e.id, recipient: to, status: "skipped_unsubscribed" }); continue; }
      try {
        const url = await unsubscribeUrl(db, to);
        const { trackMarketingHtml } = await import("@/lib/email-tracking.server");
        const html = await trackMarketingHtml(renderEmailHtml(e, url), to, `mk:${e.id}`, url);
        await pub.sendMarketingEmail(to, e.subject, html, renderEmailText(e, url), url, `${e.id}:${to}`, undefined, files);
        await db.from("marketing_email_sends").insert({ email_id: e.id, recipient: to, status: "sent" });
      } catch (err) {
        failed++;
        await db.from("marketing_email_sends").insert({ email_id: e.id, recipient: to, status: "failed", error: String((err as Error).message).slice(0, 500) });
      }
    }
    await db.from("marketing_emails").update({ status: failed && failed === list.length ? "failed" : "sent", sent_at: new Date().toISOString() }).eq("id", e.id);
    result.emails++;
  }
  return result;
}

/* ---------- Calendar & dashboard ---------- */
export async function calendar(userId: string, from: string, to: string) {
  const { db, canApprove } = await requireMarketing(userId);
  const [{ data: posts }, { data: emails }] = await Promise.all([
    db.from("marketing_posts").select("id, title, status, channels, scheduled_at, published_at, campaign_id, author_id, external_source").or(`and(scheduled_at.gte.${from},scheduled_at.lt.${to}),and(published_at.gte.${from},published_at.lt.${to})`),
    db.from("marketing_emails").select("id, name, status, scheduled_at, sent_at, campaign_id, author_id, external_source").or(`and(scheduled_at.gte.${from},scheduled_at.lt.${to}),and(sent_at.gte.${from},sent_at.lt.${to})`),
  ]);
  // Display hint only — decidePost/decideEmail re-check role and maker-checker server-side.
  const mayApprove = (a: string | null) => !!canApprove && a !== userId;
  return [
    ...((posts ?? []) as any[]).map((p) => ({ kind: "post" as const, id: p.id, title: p.title, status: p.status, channels: p.channels as string[], at: p.published_at ?? p.scheduled_at, campaignId: p.campaign_id as string | null, source: p.external_source as string | null, canApprove: mayApprove(p.author_id) })),
    ...((emails ?? []) as any[]).map((e) => ({ kind: "email" as const, id: e.id, title: e.name, status: e.status, channels: ["email"], at: e.sent_at ?? e.scheduled_at, campaignId: e.campaign_id as string | null, source: e.external_source as string | null, canApprove: mayApprove(e.author_id) })),
  ].filter((x) => x.at);
}

export async function dashboard(userId: string) {
  const { db, canApprove } = await requireMarketing(userId);
  const now = new Date(), week = new Date(Date.now() + 7 * 864e5).toISOString(), month = new Date(Date.now() - 30 * 864e5).toISOString();
  const [posts, emails, sends] = await Promise.all([
    db.from("marketing_posts").select("id, title, status, channels, scheduled_at, published_at, author_id, external_source").limit(2000),
    db.from("marketing_emails").select("id, name, status, scheduled_at, sent_at, author_id, external_source").limit(2000),
    db.from("marketing_email_sends").select("status").gte("created_at", month).limit(50000),
  ]);
  const P = (posts.data ?? []) as any[], E = (emails.data ?? []) as any[], S = (sends.data ?? []) as any[];
  const { count: unsubs } = await db.from("email_unsubscribes").select("email", { count: "exact", head: true }).gte("unsubscribed_at", month);
  const upcoming = [
    ...P.filter((p) => ["scheduled", "approved"].includes(p.status) && p.scheduled_at && p.scheduled_at <= week).map((p) => ({ kind: "post", id: p.id, title: p.title, at: p.scheduled_at, channels: p.channels })),
    ...E.filter((e) => ["scheduled", "approved"].includes(e.status) && e.scheduled_at && e.scheduled_at <= week).map((e) => ({ kind: "email", id: e.id, title: e.name, at: e.scheduled_at, channels: ["email"] })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const waiting = [
    ...P.filter((p) => p.status === "submitted").map((p) => ({ kind: "post", id: p.id, title: p.title, mine: p.author_id === userId })),
    ...E.filter((e) => e.status === "submitted").map((e) => ({ kind: "email", id: e.id, title: e.name, mine: e.author_id === userId })),
  ];
  const byChannel: Record<string, number> = { LinkedIn: 0, Facebook: 0, Instagram: 0 };
  for (const p of P.filter((p) => p.status === "published" && p.published_at >= month)) for (const c of p.channels) byChannel[c === "linkedin" ? "LinkedIn" : c === "facebook" ? "Facebook" : "Instagram"]! += 1;

  // ClickUp content flow: Write → Approve → Send → Track, per imported task.
  const cuP = P.filter((p) => p.external_source === "clickup"), cuE = E.filter((e) => e.external_source === "clickup");
  const stage = (s: string) => (s === "draft" || s === "rejected" ? "write" : s === "submitted" ? "approve" : s === "approved" || s === "scheduled" ? "send" : s === "published" || s === "sent" ? "live" : s === "failed" ? "failed" : "other");
  const flowCounts: { write: number; approve: number; send: number; live: number; failed: number } = { write: 0, approve: 0, send: 0, live: 0, failed: 0 };
  for (const x of [...cuP, ...cuE]) { const k = stage(x.status); if (k in flowCounts) flowCounts[k as keyof typeof flowCounts] += 1; }
  const liveEmails = cuE.filter((e) => e.status === "sent").sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? "")).slice(0, 25);
  const ids = liveEmails.map((e) => e.id);
  const engagement = new Map<string, { opens: number; clicks: number; readers: Set<string> }>();
  const sentCount = new Map<string, number>();
  if (ids.length) {
    const [ev, sd] = await Promise.all([
      db.from("marketing_email_events").select("email_id, kind, recipient").in("email_id", ids).limit(50000),
      db.from("marketing_email_sends").select("email_id, status").in("email_id", ids).eq("status", "sent").limit(50000),
    ]);
    for (const r of (ev.data ?? []) as any[]) {
      const m = engagement.get(r.email_id) ?? { opens: 0, clicks: 0, readers: new Set<string>() };
      if (r.kind === "open") m.opens++; else if (r.kind === "click") m.clicks++;
      m.readers.add(r.recipient); engagement.set(r.email_id, m);
    }
    for (const r of (sd.data ?? []) as any[]) sentCount.set(r.email_id, (sentCount.get(r.email_id) ?? 0) + 1);
  }
  const clickupFlow = {
    counts: flowCounts,
    emails: liveEmails.map((e) => { const m = engagement.get(e.id); return { id: e.id, title: e.name, sentAt: e.sent_at, delivered: sentCount.get(e.id) ?? 0, opens: m?.opens ?? 0, clicks: m?.clicks ?? 0, readers: m?.readers.size ?? 0 }; }),
    posts: cuP.filter((p) => p.status === "published").sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")).slice(0, 25).map((p) => ({ id: p.id, title: p.title, at: p.published_at, channels: p.channels as string[] })),
  };
  return {
    canApprove,
    now: now.toISOString(),
    stats: {
      scheduledThisWeek: upcoming.length,
      waiting: waiting.length,
      published30: P.filter((p) => p.status === "published" && p.published_at >= month).length,
      emailsSent30: S.filter((s) => s.status === "sent").length,
      unsubscribes30: unsubs ?? 0,
      failed: P.filter((p) => p.status === "failed").length + E.filter((e) => e.status === "failed").length,
    },
    upcoming, waiting, clickupFlow,
    byChannel: Object.entries(byChannel).map(([name, value]) => ({ name, value })),
  };
}

/** Team dashboard figures for the Employees/dashboards area. */
export async function marketingTeamStats() {
  const db = await admin();
  const [p, e] = await Promise.all([db.from("marketing_posts").select("status").limit(5000), db.from("marketing_emails").select("status").limit(5000)]);
  const P = (p.data ?? []) as any[], E = (e.data ?? []) as any[];
  const countBy = (rows: any[]) => rows.reduce<Record<string, number>>((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {});
  return {
    stats: [
      { label: "Posts waiting for approval", value: P.filter((x) => x.status === "submitted").length },
      { label: "Posts scheduled", value: P.filter((x) => x.status === "scheduled").length },
      { label: "Emails waiting for approval", value: E.filter((x) => x.status === "submitted").length },
      { label: "Failed items", value: P.filter((x) => x.status === "failed").length + E.filter((x) => x.status === "failed").length },
    ],
    charts: [{ title: "Posts by status", data: countBy(P) }, { title: "Emails by status", data: countBy(E) }],
  };
}
