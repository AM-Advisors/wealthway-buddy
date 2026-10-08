/**
 * Personal LinkedIn delegation rules (pure). Ownership is explicit (owner_user_id);
 * platform roles — including Super Admin — are deliberately never consulted here.
 */
export const LI_PERMS = [
  { key: "view", label: "View content" },
  { key: "create", label: "Create drafts" },
  { key: "edit", label: "Edit drafts" },
  { key: "submit", label: "Submit for approval" },
  { key: "propose_schedule", label: "Propose scheduling" },
  { key: "schedule", label: "Schedule approved posts" },
  { key: "publish_approved", label: "Publish approved posts" },
  { key: "publish_direct", label: "Publish without individual approval" },
] as const;
export type LiPerm = (typeof LI_PERMS)[number]["key"];

export type LiGrant = {
  perms: Partial<Record<LiPerm, boolean>>;
  direct_publish_authorized_at?: string | null;
  expires_at?: string | null;
  suspended?: boolean;
  revoked_at?: string | null;
  max_posts_per_day?: number | null;
  series?: string[] | null;
  hours_start?: number | null; // Denver local hour, inclusive
  hours_end?: number | null; // exclusive
};
export type LiCtx = { actorId: string; ownerId: string; grant: LiGrant | null; now: Date; postsToday?: number; series?: string | null };
export type Verdict = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Verdict => ({ ok: false, reason });

export function denverHour(d: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hourCycle: "h23" }).format(d));
}

export function grantActive(g: LiGrant | null, now: Date): Verdict {
  if (!g) return no("You haven't been given access to this LinkedIn account.");
  if (g.revoked_at) return no("Your access to this LinkedIn account was revoked.");
  if (g.suspended) return no("Your access to this LinkedIn account is suspended.");
  if (g.expires_at && new Date(g.expires_at) <= now) return no("Your access to this LinkedIn account has expired.");
  return { ok: true };
}

export function allowed(ctx: LiCtx, perm: LiPerm): Verdict {
  if (ctx.actorId === ctx.ownerId) return { ok: true };
  const a = grantActive(ctx.grant, ctx.now);
  if (!a.ok) return a;
  const g = ctx.grant!;
  if (!g.perms[perm]) return no(`You don't have "${LI_PERMS.find((p) => p.key === perm)!.label}" permission.`);
  if (perm === "publish_direct" && !g.direct_publish_authorized_at) return no("Publishing without approval needs a separate authorization from the account owner.");
  if (perm === "publish_approved" || perm === "publish_direct" || perm === "schedule") {
    if (g.series?.length && ctx.series && !g.series.includes(ctx.series)) return no("This series isn't one you're allowed to post for.");
    if (g.series?.length && !ctx.series) return no("Your access is limited to specific series; choose one.");
  }
  if (perm === "publish_approved" || perm === "publish_direct") {
    if (g.max_posts_per_day != null && (ctx.postsToday ?? 0) >= g.max_posts_per_day) return no("Daily post limit reached.");
    if (g.hours_start != null && g.hours_end != null) {
      const h = denverHour(ctx.now);
      const inside = g.hours_start <= g.hours_end ? h >= g.hours_start && h < g.hours_end : h >= g.hours_start || h < g.hours_end;
      if (!inside) return no(`Publishing is only allowed between ${g.hours_start}:00 and ${g.hours_end}:00 Denver time.`);
    }
  }
  return { ok: true };
}

/** Delegates may never manage delegates — only the owner. */
export function canManageDelegates(actorId: string, ownerId: string): Verdict {
  return actorId === ownerId ? { ok: true } : no("Only the account owner can manage access.");
}

export type LiAccount = { owner_user_id: string; status: string; member_sub: string | null; expires_at: string | null; has_token: boolean };
export type LiPost = { owner_user_id: string; status: string; version: number; approved_version: number | null; series_key?: string | null };

/** Full pre-publish check, run again by the scheduler immediately before posting. */
export function publishCheck(acct: LiAccount, post: LiPost, ctx: LiCtx): Verdict {
  if (post.owner_user_id !== acct.owner_user_id || acct.owner_user_id !== ctx.ownerId) return no("Destination account doesn't match this post.");
  if (acct.status !== "connected" || !acct.has_token || !acct.member_sub) return no("The LinkedIn account isn't connected. The owner needs to reconnect it.");
  if (acct.expires_at && new Date(acct.expires_at) <= ctx.now) return no("LinkedIn authorization expired. The owner needs to reconnect.");
  if (["published", "publishing", "cancelled", "rejected"].includes(post.status)) return no(`This post is ${post.status}.`);
  const approved = (post.status === "approved" || post.status === "scheduled") && post.approved_version === post.version;
  const c = { ...ctx, series: post.series_key ?? null };
  if (approved) return allowed(c, "publish_approved").ok ? { ok: true } : allowed(c, "publish_direct").ok ? { ok: true } : allowed(c, "publish_approved");
  // Not approved (or approved version changed): owner may publish her own content; delegates need direct-publish.
  if (ctx.actorId === ctx.ownerId) return { ok: true };
  const d = allowed(c, "publish_direct");
  return d.ok ? d : no("This version hasn't been approved by the account owner.");
}

/** Material edit to approved content invalidates approval. */
export function afterEdit(post: LiPost & { body: string }, newBody: string) {
  if (newBody.trim() === post.body.trim()) return { changed: false, invalidates: false, version: post.version };
  return { changed: true, invalidates: post.approved_version != null, version: post.version + 1 };
}
