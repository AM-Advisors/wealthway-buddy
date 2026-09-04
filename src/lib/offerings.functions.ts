import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

export const WIRE_FIELDS = [
  "bank_name",
  "bank_address",
  "account_name",
  "account_number",
  "routing_number",
  "swift",
  "memo",
] as const;

const wireSchema = z.object({
  bank_name: z.string().trim().max(160).default(""),
  bank_address: z.string().trim().max(240).default(""),
  account_name: z.string().trim().max(160).default(""),
  account_number: z.string().trim().max(64).default(""),
  routing_number: z.string().trim().max(64).default(""),
  swift: z.string().trim().max(32).default(""),
  memo: z.string().trim().max(240).default(""),
});

const offeringSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Enter the fund name").max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only"),
  summary: z.string().trim().max(1000).default(""),
  reg_type: z.enum(["506b", "506c"]),
  min_investment_cents: z.number().int().min(0),
  target_raise_cents: z.number().int().min(0).nullable().default(null),
  is_open: z.boolean().default(true),
  wire_instructions: wireSchema,
});

const documentSchema = z.object({
  id: z.string().uuid().optional(),
  offering_id: z.string().uuid(),
  title: z.string().trim().min(2, "Enter a document title").max(200),
  doc_type: z.string().trim().min(2).max(60),
  body: z.string().trim().min(10, "Add the document text").max(200000),
  requires_signature: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
});

export const listOfferings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: offerings, error } = await context.supabase
      .from("offerings")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: documents, error: docError } = await context.supabase
      .from("offering_documents")
      .select("*")
      .order("sort_order", { ascending: true });
    if (docError) throw new Error(docError.message);

    const { data: applications } = await context.supabase
      .from("investor_applications")
      .select("offering_id");

    const { data: wireRows } = await context.supabase
      .from("offering_wire_instructions")
      .select("offering_id, details");

    const wireByOffering = new Map<string, Record<string, string>>(
      (wireRows ?? []).map((w: any) => [w.offering_id as string, (w.details ?? {}) as Record<string, string>]),
    );

    const counts: Record<string, number> = {};
    for (const row of applications ?? []) {
      const key = (row as any).offering_id as string;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return {
      offerings: (offerings ?? []).map((o: any) => ({
        ...o,
        wire_instructions: wireByOffering.get(o.id) ?? {},
        documents: (documents ?? []).filter((d: any) => d.offering_id === o.id),
        applicationCount: counts[o.id] ?? 0,
      })),
    };
  });

export const saveOffering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => offeringSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);

    const payload = {
      name: data.name,
      slug: data.slug,
      summary: data.summary || null,
      reg_type: data.reg_type,
      min_investment_cents: data.min_investment_cents,
      target_raise_cents: data.target_raise_cents,
      is_open: data.is_open,
    };

    const wireDetails = Object.fromEntries(
      Object.entries(data.wire_instructions).filter(([, v]) => String(v).trim() !== ""),
    );

    let offeringId = data.id;

    if (offeringId) {
      const { error } = await context.supabase.from("offerings").update(payload).eq("id", offeringId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await context.supabase
        .from("offerings")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      offeringId = (inserted as any).id as string;
    }

    const { error: wireError } = await context.supabase
      .from("offering_wire_instructions")
      .upsert(
        { offering_id: offeringId, details: wireDetails, updated_at: new Date().toISOString() },
        { onConflict: "offering_id" },
      );
    if (wireError) throw new Error(wireError.message);

    return { id: offeringId };
  });

export const saveOfferingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => documentSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);

    const payload = {
      offering_id: data.offering_id,
      title: data.title,
      doc_type: data.doc_type,
      body: data.body,
      requires_signature: data.requires_signature,
      sort_order: data.sort_order,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("offering_documents")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: inserted, error } = await context.supabase
      .from("offering_documents")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id as string };
  });

export const deleteOfferingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);

    const { count } = await context.supabase
      .from("document_signatures")
      .select("id", { count: "exact", head: true })
      .eq("offering_document_id", data.id);

    if ((count ?? 0) > 0) {
      throw new Error("This document has already been signed by an investor and cannot be removed.");
    }

    const { error } = await context.supabase.from("offering_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
