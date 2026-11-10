/** Combined Marketing approvals queue. Reads only; decisions go through each area's existing engine. */
import { requireMarketing } from "./marketing.server";
import { STUDIO_NEXT, findLikelyDuplicates, studioApprover } from "./marketing-approvals-model";
import { routineApprovalAllowed } from "./routine-approval-policy";

export async function approvalQueue(userId: string) {
  const { db, roles, canApprove } = await requireMarketing(userId);
  const [posts, emails, articles, collateral] = await Promise.all([
    db.from("marketing_posts").select("id, title, scheduled_at, author_id, channels").eq("status", "submitted").limit(200),
    db.from("marketing_emails").select("id, name, scheduled_at, author_id").eq("status", "submitted").limit(200),
    db.from("marketing_content_items").select("id, article_title, topic, publish_at, author_id, status, post_id, post_ids, email_id").in("status", Object.keys(STUDIO_NEXT)).limit(200),
    db.from("marketing_collateral").select("id, title, updated_at, author_id").eq("status", "submitted").limit(200),
  ]);
  const ids = [...(posts.data ?? []), ...(emails.data ?? []), ...(articles.data ?? []), ...(collateral.data ?? [])].map((r: any) => r.author_id).filter(Boolean);
  const { data: prof } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", [...new Set(ids)]) : { data: [] };
  const who = new Map(((prof ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
  const ok = routineApprovalAllowed("marketing_post", canApprove);
  const plain = (kind: "post" | "email" | "collateral", r: any, title: string, at: string | null) => ({
    kind, id: r.id, title: title || "Untitled", at, author: who.get(r.author_id) ?? "", stage: "Waiting for approval",
    canApprove: ok, reason: ok ? null : "Waiting for a Marketing Manager", children: [] as any[],
  });
  const p = (posts.data ?? []).map((r: any) => plain("post", r, r.title, r.scheduled_at));
  const e = (emails.data ?? []).map((r: any) => plain("email", r, r.name, r.scheduled_at));
  const linked = new Set<string>();
  const a = (articles.data ?? []).map((r: any) => {
    const kids = [...p, ...e].filter((x) => (x.kind === "post" ? [r.post_id, ...(r.post_ids ?? [])] : [r.email_id]).includes(x.id));
    kids.forEach((k) => linked.add(`${k.kind}:${k.id}`));
    return { kind: "article" as const, id: r.id, title: r.article_title || r.topic || "Untitled", at: r.publish_at, author: who.get(r.author_id) ?? "",
      stage: r.status === "fact_check" ? "Fact check" : r.status === "internal_review" ? "Internal review" : "CEO approval", status: r.status,
      ...studioApprover(r.status, roles), children: kids };
  });
  const c = (collateral.data ?? []).map((r: any) => plain("collateral", r, r.title, null));
  const rows = [...a, ...p.filter((x: any) => !linked.has(`post:${x.id}`)), ...e.filter((x: any) => !linked.has(`email:${x.id}`)), ...c]
    .sort((x, y) => (x.at ?? "9").localeCompare(y.at ?? "9"));
  return { rows, mine: rows.filter((r) => r.canApprove).length };
}

/** Open posts/emails/articles with the same title on the same day. */
export async function openDuplicates(userId: string, kind: "post" | "email", title: string, at: string | null, selfId: string | null) {
  const { db } = await requireMarketing(userId);
  const pat = title.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
  const closed = ["published", "sent", "rejected", "cancelled"];
  const [posts, emails] = await Promise.all([
    db.from("marketing_posts").select("id, title, scheduled_at, status").ilike("title", pat).limit(20),
    db.from("marketing_emails").select("id, name, scheduled_at, status").ilike("name", pat).limit(20),
  ]);
  const open = [
    ...((posts.data ?? []) as any[]).filter((r) => !closed.includes(r.status)).map((r) => ({ id: r.id, kind: "post" as const, title: r.title, at: r.scheduled_at })),
    ...((emails.data ?? []) as any[]).filter((r) => !closed.includes(r.status)).map((r) => ({ id: r.id, kind: "email" as const, title: r.name, at: r.scheduled_at })),
  ].filter((r) => !(r.kind === kind && r.id === selfId));
  return findLikelyDuplicates(title, at, open);
}
