/**
 * Saved-information locks. The first save of a section applies and locks it;
 * every later edit becomes a locked_edit_request that a different Harmonious
 * staff member must approve, which then replays the edit through the same
 * canonical save function under the approver's authority.
 */
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export class PendingApproval extends Error {
  constructor(public requestId: string) {
    super("This information is locked. Your change was sent to Harmonious for approval.");
  }
}

type Ctx = { supabase: any; userId: string; claims?: any };
type Action = { label: string; alwaysLocked?: boolean; key: (p: any) => string; apply: (ctx: Ctx, p: any) => Promise<unknown>; offering?: (p: any) => string | undefined };

const fundEngine = () => import("@/lib/fund-setup-canonical.server");
const p3 = () => import("@/lib/fund-setup-phase3.server");

export const LOCKED_ACTIONS: Record<string, Action> = {
  fund_fields: { label: "Fund details", key: (p) => `fund_fields:${p.offeringId}`, offering: (p) => p.offeringId, apply: async (c, p) => (await fundEngine()).saveFundSetupFields(c.userId, p) },
  legal_name: { label: "Fund legal name", key: (p) => `legal_name:${p.offeringId}`, offering: (p) => p.offeringId, apply: async (c, p) => (await fundEngine()).changeLegalName(c.userId, p) },
  economics: { label: "Fees & carried interest", key: (p) => `economics:${p.offeringId}`, offering: (p) => p.offeringId, apply: async (c, p) => (await fundEngine()).saveFundEconomics(c.userId, p) },
  ein: { label: "EIN", key: (p) => `ein:${p.offeringId}`, offering: (p) => p.offeringId, apply: async (c, p) => (await p3()).recordEin(c.supabase, c.userId, p) },
  administration: { label: "Administration & filings", key: (p) => `administration:${p.offeringId}`, offering: (p) => p.offeringId, apply: async (c, p) => (await p3()).saveAdministration(c.userId, p) },
  investor: { label: "Investor information", alwaysLocked: true, key: (p) => `investor:${p.onboardingId}`, apply: async (c, p) => (await import("@/lib/investor-record.server")).updateInvestorRecord(c.userId, p) },
  client: { label: "Client information", alwaysLocked: true, key: (p) => `client:${p.clientId}`, apply: async (c, p) => (await import("@/lib/client-admin.server")).applyUpdateClient(c, p) },
};

function summarize(p: any): string {
  const { offeringId, onboardingId, clientId, ...rest } = p ?? {};
  return JSON.stringify(rest).slice(0, 600);
}

/** Apply when unlocked (then lock); otherwise queue an approval request and throw PendingApproval. */
export async function lockedSave<T>(actionKey: keyof typeof LOCKED_ACTIONS, ctx: Ctx, payload: any, apply: () => Promise<T>): Promise<T> {
  const a = LOCKED_ACTIONS[actionKey]!;
  const key = a.key(payload);
  const db = await admin();
  const { data: lock } = await db.from("record_locks").select("resource_key").eq("resource_key", key).maybeSingle();
  if (!lock && !a.alwaysLocked) {
    const r = await apply();
    await db.from("record_locks").upsert({ resource_key: key, locked_by: ctx.userId }, { onConflict: "resource_key", ignoreDuplicates: true });
    return r;
  }
  await db.from("locked_edit_requests").update({ status: "withdrawn", decided_at: new Date().toISOString(), note: "Replaced by a newer request" })
    .eq("resource_key", key).eq("action", actionKey).eq("requested_by", ctx.userId).eq("status", "pending");
  const { data: req, error } = await db.from("locked_edit_requests")
    .insert({ resource_key: key, action: actionKey, summary: summarize(payload), payload, requested_by: ctx.userId })
    .select("id").single();
  if (error) throw new Error("Could not send your change for approval.");
  await db.from("staff_tasks").insert({
    title: `Approve locked edit: ${a.label}`,
    description: `A change to locked ${a.label.toLowerCase()} needs approval from a Harmonious staff member other than the requester. Review it in Operations → Locked edits. Request ${req.id}.`,
    priority: "high", team: "operations", offering_id: a.offering?.(payload) ?? null, client_id: payload?.clientId ?? null,
  });
  throw new PendingApproval(req.id);
}

async function assertApprover(userId: string) {
  const { isStaff } = await import("@/lib/fund-tabs.server");
  if (!(await isStaff(userId))) throw new Error("Only Harmonious staff can approve locked edits.");
}

export async function listLockedEdits(userId: string) {
  await assertApprover(userId);
  const db = await admin();
  const { data } = await db.from("locked_edit_requests").select("id, action, resource_key, summary, payload, requested_by, status, created_at, decided_at, note").order("created_at", { ascending: false }).limit(200);
  const ids = [...new Set(((data ?? []) as any[]).map((r) => r.requested_by))];
  const { data: profs } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const names = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Unknown"]));
  return ((data ?? []) as any[]).map((r) => ({ ...r, label: LOCKED_ACTIONS[r.action]?.label ?? r.action, requester: names.get(r.requested_by) ?? "Unknown", mine: r.requested_by === userId, payload: undefined, details: r.summary }));
}

export async function decideLockedEdit(ctx: Ctx, input: { requestId: string; decision: "approve" | "reject"; note?: string | null | undefined }) {
  await assertApprover(ctx.userId);
  const db = await admin();
  const { data: req } = await db.from("locked_edit_requests").select("*").eq("id", input.requestId).maybeSingle();
  if (!req || req.status !== "pending") throw new Error("This request is no longer pending.");
  if (req.requested_by === ctx.userId && !(await (await import("@/lib/self-approval.server")).selfApprove(ctx.userId, "locked_edit", [req.id]))) throw new Error("Someone other than the requester must approve this change.");
  const now = new Date().toISOString();
  if (input.decision === "reject") {
    await db.from("locked_edit_requests").update({ status: "rejected", decided_by: ctx.userId, decided_at: now, note: input.note ?? null }).eq("id", req.id).eq("status", "pending");
    return { ok: true };
  }
  const a = LOCKED_ACTIONS[req.action];
  if (!a) throw new Error("Unknown change type.");
  try {
    await a.apply(ctx, req.payload);
  } catch (e) {
    await db.from("locked_edit_requests").update({ status: "failed", decided_by: ctx.userId, decided_at: now, note: (e as Error).message.slice(0, 500) }).eq("id", req.id);
    throw e;
  }
  await db.from("locked_edit_requests").update({ status: "approved", decided_by: ctx.userId, decided_at: now, note: input.note ?? null }).eq("id", req.id);
  await db.from("record_locks").upsert({ resource_key: req.resource_key, locked_by: ctx.userId }, { onConflict: "resource_key", ignoreDuplicates: true });
  const off = a.offering?.(req.payload);
  if (off) await (await import("@/lib/fund-setup-extras.server")).autoCompleteAfterSave({ offeringId: off });
  return { ok: true };
}
