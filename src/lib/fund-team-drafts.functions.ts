import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isGrantLive } from "@/lib/fund-team-access";

/**
 * Assistant drafts. Assistants prepare; only a Fund Manager of that Fund
 * reviews. Nothing here sends email, invites anyone or sends documents - the
 * manager uses the draft in the existing explicit-send flows and marks it used.
 */

const DRAFT_KINDS = ["investor_invitation", "investor_message", "document_send"] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function isManagerOf(db: any, userId: string, offeringId: string) {
  const { data } = await db.from("fund_managers").select("id").eq("user_id", userId).eq("offering_id", offeringId).maybeSingle();
  return !!data;
}

async function liveGrant(db: any, userId: string, fundId: string) {
  const { data } = await db
    .from("fund_team_grants")
    .select("offering_id, role, status, expires_at, granted_by")
    .eq("grantee_user_id", userId)
    .eq("offering_id", fundId)
    .eq("status", "active")
    .maybeSingle();
  if (!data || !isGrantLive(data)) return null;
  if (!(await isManagerOf(db, data.granted_by, fundId))) return null;
  return data as { role: string };
}

export const listMyFundDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    if (!(await liveGrant(db, context.userId, data.fundId))) throw new Error("Forbidden: you don't have access to that fund.");
    const { data: rows } = await db
      .from("fund_team_drafts")
      .select("id, kind, title, recipient_email, body, status, review_note, updated_at")
      .eq("offering_id", data.fundId)
      .eq("author_user_id", context.userId)
      .order("updated_at", { ascending: false });
    return {
      drafts: ((rows ?? []) as any[]).map((r) => ({
        id: r.id as string,
        kind: r.kind as (typeof DRAFT_KINDS)[number],
        title: r.title as string,
        recipientEmail: (r.recipient_email as string | null) ?? "",
        body: r.body as string,
        status: r.status as string,
        reviewNote: r.review_note as string | null,
        updatedAt: r.updated_at as string,
      })),
    };
  });

export const saveFundDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fundId: z.string().uuid(),
        draftId: z.string().uuid().nullable().optional(),
        kind: z.enum(DRAFT_KINDS),
        title: z.string().trim().min(1).max(200),
        recipientEmail: z.string().trim().max(255).nullable().optional(),
        body: z.string().max(10000),
        submit: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const g = await liveGrant(db, context.userId, data.fundId);
    if (!g) throw new Error("Forbidden: you don't have access to that fund.");
    if (g.role !== "fund_assistant") throw new Error("Only Assistants can prepare drafts.");
    const fields = {
      kind: data.kind,
      title: data.title,
      recipient_email: data.recipientEmail || null,
      body: data.body,
      status: data.submit ? "submitted" : "draft",
      updated_at: new Date().toISOString(),
    };
    if (data.draftId) {
      const { data: ex } = await db.from("fund_team_drafts").select("author_user_id, offering_id, status").eq("id", data.draftId).maybeSingle();
      if (!ex || ex.author_user_id !== context.userId || ex.offering_id !== data.fundId) throw new Error("Draft not found.");
      if (ex.status === "used") throw new Error("This draft was already used by the manager.");
      await db.from("fund_team_drafts").update(fields).eq("id", data.draftId);
    } else {
      await db.from("fund_team_drafts").insert({ ...fields, offering_id: data.fundId, author_user_id: context.userId });
    }
    return { ok: true };
  });

export const withdrawFundDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ draftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: ex } = await db.from("fund_team_drafts").select("author_user_id, status").eq("id", data.draftId).maybeSingle();
    if (!ex || ex.author_user_id !== context.userId || ex.status === "used") throw new Error("Draft not found.");
    await db.from("fund_team_drafts").update({ status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", data.draftId);
    return { ok: true };
  });

export const listFundDraftsForReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    if (!(await isManagerOf(db, context.userId, data.fundId))) return { drafts: [] };
    const { data: rows } = await db
      .from("fund_team_drafts")
      .select("id, author_user_id, kind, title, recipient_email, body, status, review_note, updated_at")
      .eq("offering_id", data.fundId)
      .in("status", ["submitted", "used", "returned"])
      .order("updated_at", { ascending: false })
      .limit(50);
    const { data: grants } = await db.from("fund_team_grants").select("grantee_user_id, grantee_email").eq("offering_id", data.fundId);
    const emails = new Map(((grants ?? []) as any[]).map((g) => [g.grantee_user_id, g.grantee_email]));
    return {
      drafts: ((rows ?? []) as any[]).map((r) => ({
        id: r.id as string,
        author: (emails.get(r.author_user_id) as string) ?? "Assistant",
        kind: r.kind as string,
        title: r.title as string,
        recipientEmail: r.recipient_email as string | null,
        body: r.body as string,
        status: r.status as string,
        reviewNote: r.review_note as string | null,
      })),
    };
  });

export const reviewFundDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ draftId: z.string().uuid(), decision: z.enum(["used", "returned"]), note: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: ex } = await db.from("fund_team_drafts").select("offering_id, status, author_user_id").eq("id", data.draftId).maybeSingle();
    if (!ex || ex.status !== "submitted") throw new Error("Only submitted drafts can be reviewed.");
    if (!(await isManagerOf(db, context.userId, ex.offering_id))) throw new Error("Forbidden: you do not manage that fund.");
    if (ex.author_user_id === context.userId) throw new Error("You can't review your own draft.");
    if (data.decision === "returned" && !data.note?.trim()) throw new Error("Add a note so the assistant knows what to change.");
    await db
      .from("fund_team_drafts")
      .update({ status: data.decision, reviewed_by: context.userId, reviewed_at: new Date().toISOString(), review_note: data.note ?? null, updated_at: new Date().toISOString() })
      .eq("id", data.draftId);
    return { ok: true };
  });
