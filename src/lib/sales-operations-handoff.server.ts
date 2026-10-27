import { can, capabilitiesFor } from "./ops-capabilities";
import type { HandoffData } from "./sales-operations-handoff-model";

async function access(context: any) {
  const result = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (result.error) throw new Error("Couldn't verify handoff access.");
  const roles: string[] = (result.data ?? []).map((r: any) => String(r.role));
  if (can(capabilitiesFor(roles), "funds", "see")) {
    await (await import("./ops-access.functions")).requireOperations(context, "funds", "see");
    return { roles, visible: null as string[] | null, operations: true };
  }
  const actor = await (await import("./sales-hub.server")).salesActor(context.userId);
  return { roles, visible: actor.visible, operations: false };
}

export async function loadFundHandoffs(context: any, fundId: string): Promise<HandoffData> {
  const a = await access(context);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const fund = await db.from("offerings").select("id,consolidated_into").eq("id", fundId).single();
  if (fund.error) throw new Error("Fund not found.");
  let query = db.from("sales_quotes").select("id,quote_number,title,owner_user_id").eq("status", "signed").eq("onboarded_offering_id", fundId);
  if (a.visible) query = query.in("owner_user_id", a.visible);
  const [quotes, tasks] = await Promise.all([query, db.from("staff_tasks").select("id,source_ref,assignee_user_id,due_date,status").eq("offering_id", fundId).eq("source", "workflow").like("source_ref", "sales-handoff:%")]);
  if (quotes.error || tasks.error) throw new Error("Couldn't load the handoff. Please retry.");
  if (!quotes.data?.length) return { rows: [], owners: [] };
  const { staffDirectory } = await import("./harmonious-team.server");
  const owners = (await staffDirectory()).filter(s => s.eligible.operations);
  const { data: receiverRoles, error: receiverError } = await db.from("user_roles").select("user_id").in("role", ["admin", "operations", "fund_administration"]);
  if (receiverError) throw new Error("Couldn't load Operations owners.");
  const receivers = new Set((receiverRoles ?? []).map(r => r.user_id));
  const eligibleOwners = owners.filter(o => receivers.has(o.id));
  const writable = a.roles.some(r => ["admin", "super_admin", "operations", "fund_administration", "account_manager", "sales", "account_executive", "bdr", "sales_management", "cro", "executive"].includes(r)) && !fund.data.consolidated_into;
  return { owners: eligibleOwners.map(s => ({ id: s.id, name: s.name })), rows: quotes.data.map(q => {
    const t = tasks.data?.find(t => t.source_ref === `sales-handoff:${q.id}`);
    const terminal = t?.status === "done" || t?.status === "cancelled";
    return { quoteId: q.id, quoteNumber: String(q.quote_number), title: q.title, taskId: t?.id ?? null, ownerId: t?.assignee_user_id ?? null, ownerName: owners.find(s => s.id === t?.assignee_user_id)?.name ?? null, dueDate: t?.due_date ?? null, status: t?.status ?? "open", canAssign: writable && !terminal, canReceive: writable && t?.assignee_user_id === context.userId && a.roles.some(r => ["admin", "super_admin", "operations", "fund_administration"].includes(r)) };
  }) };
}

export async function saveFundHandoff(context: any, input: { fundId: string; quoteId: string; action: "assign" | "acknowledge" | "complete"; ownerId?: string; dueDate?: string }) {
  const current = await loadFundHandoffs(context, input.fundId);
  const row = current.rows.find(r => r.quoteId === input.quoteId);
  if (!row || (input.action === "assign" ? !row.canAssign : !row.canReceive)) throw new Error("This handoff action isn't available to your account.");
  if (input.action === "assign" && !current.owners.some(o => o.id === input.ownerId)) throw new Error("Choose an Operations owner.");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const saved = await db.rpc("save_sales_operations_handoff", { _actor: context.userId, _quote: input.quoteId, _fund: input.fundId, _action: input.action, _owner: input.ownerId, _due: input.dueDate });
  if (saved.error) throw new Error("Couldn't save the handoff. Refresh and check the owner, due date and current status.");
  return { ok: true };
}

/** Called only by the canonical signed-quote handoff. Idempotent work item, no sends or access grants. */
export async function ensureHandoffTask(db: any, quote: any, fundId: string) {
  const saved = await db.from("staff_tasks").insert({ title: "Sales to Operations handoff", source: "workflow", source_ref: `sales-handoff:${quote.id}`, team: "operations", client_id: quote.client_id, offering_id: fundId, created_by: quote.owner_user_id, related_workflow_type: "sales_handoff", related_workflow_id: quote.id });
  // The existing source index is partial, so use explicit insert and unique-conflict handling instead.
  if (saved.error && saved.error.code !== "23505") throw new Error("Couldn't create Operations handoff task.");
}