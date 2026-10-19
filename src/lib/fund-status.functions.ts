import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { canRequestStatusChange, reopenApprovalError } from "@/lib/fund-status-model";

const reason = z.string().trim().min(3).max(1000);

async function viewer(uid: string, fundId: string) {
  const { db, isStaff } = await import("@/lib/fund-tabs.server");
  const d = await db();
  const [{ data: mgr }, staff, { isSuperAdmin }] = await Promise.all([
    d.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", fundId).maybeSingle(),
    isStaff(uid),
    import("@/lib/self-approval.server"),
  ]);
  return { d, isManager: !!mgr, isStaff: staff, isSuperAdmin: await isSuperAdmin(uid) };
}

export const fundStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const v = await viewer(context.userId, data.offeringId);
    if (!canRequestStatusChange(v)) throw new Error("You don't have access to this Fund.");
    const [{ data: o }, { data: pending }, { data: events }] = await Promise.all([
      v.d.from("offerings").select("lifecycle_status, closed_at, closed_reason").eq("id", data.offeringId).maybeSingle(),
      v.d.from("fund_reopen_requests").select("id, requested_by, reason, created_at").eq("offering_id", data.offeringId).eq("status", "pending").maybeSingle(),
      v.d.from("fund_status_events").select("id, action, actor_id, reason, self_approved, created_at").eq("offering_id", data.offeringId).order("created_at", { ascending: false }).limit(20),
    ]);
    const ids = [...new Set([pending?.requested_by, ...((events ?? []) as any[]).map((e) => e.actor_id)].filter(Boolean))];
    const { data: people } = ids.length ? await v.d.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
    const name = (id: string) => { const p = (people ?? []).find((x: any) => x.user_id === id); return p?.legal_name || p?.email || "Unknown"; };
    return {
      status: (o?.lifecycle_status ?? "open") as "open" | "closed",
      closedAt: o?.closed_at ?? null,
      closedReason: o?.closed_reason ?? null,
      pending: pending ? { id: pending.id, reason: pending.reason, createdAt: pending.created_at, requestedBy: name(pending.requested_by), mine: pending.requested_by === context.userId } : null,
      canApprove: v.isManager || v.isSuperAdmin,
      history: ((events ?? []) as any[]).map((e) => ({ id: e.id, action: e.action, reason: e.reason, at: e.created_at, by: name(e.actor_id), selfApproved: e.self_approved })),
    };
  });

export const closeFundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid(), reason }).parse)
  .handler(async ({ data, context }) => {
    const v = await viewer(context.userId, data.offeringId);
    if (!canRequestStatusChange(v)) throw new Error("Only this fund's managers or Harmonious Operations can close it.");
    const { error } = await v.d.rpc("close_fund", { _offering: data.offeringId, _actor: context.userId, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestReopenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid(), reason }).parse)
  .handler(async ({ data, context }) => {
    const v = await viewer(context.userId, data.offeringId);
    if (!canRequestStatusChange(v)) throw new Error("Only this fund's managers or Harmonious Operations can request reopening.");
    const { data: o } = await v.d.from("offerings").select("lifecycle_status").eq("id", data.offeringId).maybeSingle();
    if (o?.lifecycle_status !== "closed") throw new Error("This fund is already open.");
    const { data: req, error } = await v.d.from("fund_reopen_requests").insert({ offering_id: data.offeringId, requested_by: context.userId, reason: data.reason }).select("id").single();
    if (error) throw new Error(error.message.includes("fund_reopen_one_pending") ? "A reopen request is already waiting for approval." : "Couldn't save the request.");
    await v.d.from("fund_status_events").insert({ offering_id: data.offeringId, action: "reopen_requested", actor_id: context.userId, reason: data.reason, request_id: req.id });
    return { ok: true };
  });

export const decideReopenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ requestId: z.string().uuid(), approve: z.boolean(), reason }).parse)
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/fund-tabs.server");
    const { data: req } = await (await db()).from("fund_reopen_requests").select("id, offering_id, requested_by, status").eq("id", data.requestId).maybeSingle();
    if (!req || req.status !== "pending") throw new Error("This reopen request is no longer waiting.");
    const v = await viewer(context.userId, req.offering_id);
    const isRequester = req.requested_by === context.userId;
    let selfApproved = false;
    if (isRequester && v.isSuperAdmin) {
      const { selfApprove } = await import("@/lib/self-approval.server");
      selfApproved = await selfApprove(context.userId, "fund_reopen", [req.id]);
    }
    const err = reopenApprovalError({ isManager: v.isManager, isSuperAdmin: v.isSuperAdmin, isRequester, selfApproved });
    if (err) throw new Error(err);
    const { error } = await v.d.rpc("decide_fund_reopen", { _request: req.id, _actor: context.userId, _approve: data.approve, _reason: data.reason, _self_approved: selfApproved });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
