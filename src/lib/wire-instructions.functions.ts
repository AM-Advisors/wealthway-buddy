import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WIRE_FIELDS } from "@/lib/offerings.functions";
import { diffRecords, summarizeChanges } from "@/lib/offering-audit";

const wireSchema = z.object({
  offering_id: z.string().uuid(),
  bank_name: z.string().trim().max(160).default(""),
  bank_address: z.string().trim().max(240).default(""),
  account_name: z.string().trim().max(160).default(""),
  account_number: z.string().trim().max(64).default(""),
  routing_number: z.string().trim().max(64).default(""),
  swift: z.string().trim().max(32).default(""),
  memo: z.string().trim().max(240).default(""),
});

async function managedOfferingIds(supabase: any, userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  if (isAdmin) return { isAdmin, offeringIds: null as string[] | null };

  const { data: assignments } = await supabase
    .from("fund_managers")
    .select("offering_id")
    .eq("user_id", userId);
  return { isAdmin, offeringIds: (assignments ?? []).map((a: any) => a.offering_id as string) };
}

export const listManagedWireInstructions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin, offeringIds } = await managedOfferingIds(context.supabase, context.userId);
    if (!isAdmin && (offeringIds ?? []).length === 0) {
      return { canEdit: false, isAdmin, funds: [] as any[] };
    }

    let query = context.supabase
      .from("offerings")
      .select("id, name, slug, reg_type, min_investment_cents, is_open")
      .order("name", { ascending: true });
    if (!isAdmin) query = query.in("id", offeringIds ?? []);

    const { data: offerings, error } = await query;
    if (error) throw new Error(error.message);

    const { data: wireRows } = await context.supabase.rpc("list_wire_instructions");
    const wireByOffering = new Map<string, { details: Record<string, string>; updated_at: string | null }>(
      (wireRows ?? []).map((w: any) => [
        w.offering_id as string,
        { details: (w.details ?? {}) as Record<string, string>, updated_at: w.updated_at ?? null },
      ]),
    );

    return {
      canEdit: true,
      isAdmin,
      funds: (offerings ?? []).map((o: any) => ({
        ...o,
        wire_instructions: wireByOffering.get(o.id)?.details ?? {},
        wire_updated_at: wireByOffering.get(o.id)?.updated_at ?? null,
      })),
    };
  });

export const saveManagedWireInstructions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => wireSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { isAdmin, offeringIds } = await managedOfferingIds(context.supabase, context.userId);
    if (!isAdmin && !(offeringIds ?? []).includes(data.offering_id)) {
      throw new Error("Forbidden: you are not assigned to this fund.");
    }

    const next = Object.fromEntries(
      WIRE_FIELDS.map((field) => [field, String((data as any)[field] ?? "").trim()]),
    ) as Record<string, string>;

    const { data: existing } = await context.supabase
      .rpc("get_wire_instructions", { p_offering_id: data.offering_id })
      .maybeSingle();
    const previous = ((existing as any)?.details ?? {}) as Record<string, unknown>;

    const details = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== ""));

    const { error } = await context.supabase.rpc("save_wire_instructions", {
      p_offering_id: data.offering_id,
      p_details: details as any,
    });
    if (error) throw new Error(error.message);

    const changes = diffRecords(previous, next, [...WIRE_FIELDS]);
    if (changes.length > 0) {
      try {
        const { data: profile } = await context.supabase
          .from("profiles")
          .select("legal_name, email")
          .eq("user_id", context.userId)
          .maybeSingle();
        await context.supabase.from("offering_audit_events").insert({
          offering_id: data.offering_id,
          event_type: "wire_updated",
          changes,
          summary: summarizeChanges("wire_updated", changes),
          actor_id: context.userId,
          actor_name: (profile as any)?.legal_name ?? null,
          actor_email:
            (profile as any)?.email ?? ((context.claims as any)?.email as string | undefined) ?? null,
        });
      } catch (err) {
        console.error("wire audit insert failed", err);
      }
    }

    return { ok: true, changed: changes.length };
  });
