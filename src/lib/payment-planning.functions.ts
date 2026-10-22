import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { paymentPlanDates } from "./payment-planning";

const schema = z.object({
  scope: z.enum(["invoices", "fund_invoices", "client_payments", "commissions"]),
  cadence: z.enum(["quarterly", "annual"]),
  firstDueOn: z.string(),
  items: z.array(z.object({ id: z.string().min(1).max(200), lineId: z.string().uuid().optional(), userId: z.string().uuid().nullable().optional(), layer: z.string().optional() })).min(1).max(500),
});

export const savePaymentPlan = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    paymentPlanDates(data.firstDueOn, data.cadence);
    const items = [...new Map(data.items.map(item => [item.id, item])).values()];
    // Re-read canonical records with the caller's existing authority. Browser amounts never enter storage.
    let snapshots: { id: string; cents: number; status: string; date: string | null }[];
    if (data.scope === "commissions") {
      const report = await (await import("./commissions.server")).commissionReport(context.userId, "1900-01-01", "2999-12-31");
      snapshots = items.map(item => {
        const row = report.rows.find((r: any) => r.lineId === item.lineId && r.userId === item.userId && r.layer === item.layer);
        if (!row || !row.paidOn || row.status === "cancelled") throw new Error("A selected commission is unavailable.");
        return { id: item.id, cents: row.amountCents, status: row.status, date: row.paidOn };
      });
    } else {
      const table = data.scope === "client_payments" ? "payment_instructions" : "invoices";
      const { data: records, error } = await context.supabase.from(table as "invoices").select("*").in("id", items.map(item => item.id));
      if (error) throw new Error("Couldn't verify selected payments.");
      snapshots = items.map(item => {
        const row = (records as any[] ?? []).find(r => r.id === item.id);
        if (!row || ["draft", "void", "cancelled", "canceled", "rejected"].includes(row.status)) throw new Error("A selected payment is unavailable.");
        return { id: row.id, cents: Number(table === "invoices" ? row.total_cents : row.amount_cents), status: row.status, date: row.paid_on ?? row.due_date ?? null };
      });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("payment_plan_versions").insert({ actor_id: context.userId, scope: data.scope, cadence: data.cadence, first_due_on: data.firstDueOn, items: snapshots });
    if (error) throw new Error("The payment schedule couldn't be saved.");
    return { ok: true };
  });

export const getPaymentPlans = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: schema.shape.scope }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plans, error } = await supabaseAdmin.from("payment_plan_versions").select("id, cadence, first_due_on, items, created_at").eq("actor_id", context.userId).eq("scope", data.scope).order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error("Couldn't load payment schedules.");
    return plans ?? [];
  });