import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { complianceTemplate } from "@/lib/compliance-templates";

const STATUSES = ["not_started", "in_progress", "filed", "not_applicable"] as const;

async function isAdminUser(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function assertCanManage(supabase: any, userId: string, offeringId: string) {
  if (await isAdminUser(supabase, userId)) return true;
  const { data, error } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: you do not manage that fund.");
  return false;
}

function summarize(items: any[]) {
  const today = new Date().toISOString().slice(0, 10);
  const counted = items.filter((i) => i.status !== "not_applicable");
  const filed = counted.filter((i) => i.status === "filed");
  const overdue = counted.filter(
    (i) => i.status !== "filed" && typeof i.due_date === "string" && i.due_date < today,
  );
  const upcoming = counted
    .filter((i) => i.status !== "filed" && typeof i.due_date === "string" && i.due_date >= today)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  return {
    total: counted.length,
    filed: filed.length,
    inProgress: counted.filter((i) => i.status === "in_progress").length,
    notApplicable: items.length - counted.length,
    overdue: overdue.length,
    percent: counted.length ? Math.round((filed.length / counted.length) * 100) : 0,
    nextDue: upcoming.length ? { label: upcoming[0].label, due_date: upcoming[0].due_date } : null,
  };
}

async function readItems(supabase: any, offeringId: string) {
  const { data, error } = await supabase
    .from("fund_compliance_items")
    .select(
      "id, offering_id, key, label, category, status, due_date, filed_on, owner_name, reference, note, sort_order, created_at, updated_at",
    )
    .eq("offering_id", offeringId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

/** Create any template rows this fund is missing. Idempotent on (offering_id, key). */
async function seed(supabase: any, offeringId: string, regType: string | null, userId: string) {
  const existing = await readItems(supabase, offeringId);
  const seen = new Set(existing.filter((i) => i.key).map((i) => i.key as string));
  const missing = complianceTemplate(regType).filter((t) => !seen.has(t.key));
  if (!missing.length) return existing;
  const { error } = await supabase.from("fund_compliance_items").insert(
    missing.map((t) => ({
      offering_id: offeringId,
      key: t.key,
      label: t.label,
      category: t.category,
      sort_order: t.sort_order,
      created_by: userId,
    })),
  );
  if (error) throw new Error(error.message);
  return readItems(supabase, offeringId);
}

export const getFundCompliance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offeringId: z.string().uuid(), seed: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const isAdmin = await assertCanManage(supabase, context.userId, data.offeringId);

    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select("id, name, reg_type")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (offeringError) throw new Error(offeringError.message);
    if (!offering) throw new Error("Fund not found.");

    let items = await readItems(supabase, data.offeringId);
    if (data.seed !== false && items.length === 0) {
      items = await seed(supabase, data.offeringId, offering.reg_type ?? null, context.userId);
    }

    return {
      isAdmin,
      offering: { id: offering.id, name: offering.name, reg_type: offering.reg_type as string },
      items,
      summary: summarize(items),
    };
  });

export const seedComplianceChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offeringId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    await assertCanManage(supabase, context.userId, data.offeringId);
    const { data: offering, error } = await supabase
      .from("offerings")
      .select("reg_type")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const items = await seed(supabase, data.offeringId, offering?.reg_type ?? null, context.userId);
    return { ok: true, count: items.length };
  });

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  offeringId: z.string().uuid(),
  label: z.string().trim().min(2, "Give the filing a name").max(200),
  category: z.string().trim().max(60).default("Other"),
  status: z.enum(STATUSES).default("not_started"),
  due_date: z.string().trim().max(10).nullable().default(null),
  filed_on: z.string().trim().max(10).nullable().default(null),
  owner_name: z.string().trim().max(120).default(""),
  reference: z.string().trim().max(120).default(""),
  note: z.string().trim().max(2000).default(""),
});

export const saveComplianceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    await assertCanManage(supabase, context.userId, data.offeringId);

    const payload = {
      label: data.label,
      category: data.category || "Other",
      status: data.status,
      due_date: data.due_date || null,
      filed_on: data.status === "filed" ? data.filed_on || new Date().toISOString().slice(0, 10) : data.filed_on || null,
      owner_name: data.owner_name || null,
      reference: data.reference || null,
      note: data.note || null,
    };

    if (data.id) {
      const { error } = await supabase
        .from("fund_compliance_items")
        .update(payload)
        .eq("id", data.id)
        .eq("offering_id", data.offeringId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    const { data: inserted, error } = await supabase
      .from("fund_compliance_items")
      .insert({
        ...payload,
        offering_id: data.offeringId,
        sort_order: 500,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id as string };
  });

export const deleteComplianceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offeringId: z.string().uuid(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    await assertCanManage(supabase, context.userId, data.offeringId);
    const { error } = await supabase
      .from("fund_compliance_items")
      .delete()
      .eq("id", data.id)
      .eq("offering_id", data.offeringId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
