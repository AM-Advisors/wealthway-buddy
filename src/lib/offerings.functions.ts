import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  diffRecords,
  summarizeChanges,
  type AuditChange,
  type OfferingAuditEventType,
} from "@/lib/offering-audit";

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

async function assertAdmin(supabase: any, userId: string) {
  if (!(await isAdminUser(supabase, userId))) {
    throw new Error("Forbidden: admin access required.");
  }
}

/** Admins, or a fund manager assigned to this fund. */
async function assertCanEditOffering(supabase: any, userId: string, offeringId: string) {
  if (await isAdminUser(supabase, userId)) return;
  const { data, error } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: you do not manage that fund.");
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
      .select("offering_id, source");

    const { data: wireRows } = await context.supabase.rpc("list_wire_instructions");

    const wireByOffering = new Map<string, Record<string, string>>(
      (wireRows ?? []).map((w: any) => [w.offering_id as string, (w.details ?? {}) as Record<string, string>]),
    );

    const counts: Record<string, number> = {};
    const sourceCounts: Record<string, Record<string, number>> = {};
    for (const row of applications ?? []) {
      const key = (row as any).offering_id as string;
      counts[key] = (counts[key] ?? 0) + 1;
      const source = ((row as any).source as string | undefined) ?? "portal";
      sourceCounts[key] = sourceCounts[key] ?? {};
      sourceCounts[key][source] = (sourceCounts[key][source] ?? 0) + 1;
    }

    return {
      offerings: (offerings ?? []).map((o: any) => ({
        ...o,
        wire_instructions: wireByOffering.get(o.id) ?? {},
        documents: (documents ?? []).filter((d: any) => d.offering_id === o.id),
        applicationCount: counts[o.id] ?? 0,
        sourceCounts: sourceCounts[o.id] ?? {},
      })),
    };
  });

async function actorIdentity(supabase: any, userId: string, claims: any) {
  const { data } = await supabase
    .from("profiles")
    .select("legal_name, email")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    actor_id: userId,
    actor_name: (data as any)?.legal_name ?? null,
    actor_email: (data as any)?.email ?? (claims?.email as string | undefined) ?? null,
  };
}

async function recordAudit(
  supabase: any,
  identity: { actor_id: string; actor_name: string | null; actor_email: string | null },
  event: {
    offering_id: string;
    offering_document_id?: string | null;
    event_type: OfferingAuditEventType;
    changes: AuditChange[];
  },
) {
  try {
    const { error } = await supabase.from("offering_audit_events").insert({
      offering_id: event.offering_id,
      offering_document_id: event.offering_document_id ?? null,
      event_type: event.event_type,
      changes: event.changes,
      summary: summarizeChanges(event.event_type, event.changes),
      ...identity,
    });
    if (error) console.error("offering audit insert failed", error.message);
  } catch (err) {
    console.error("offering audit insert threw", err);
  }
}

const OFFERING_FIELDS = [
  "name",
  "slug",
  "summary",
  "reg_type",
  "min_investment_cents",
  "target_raise_cents",
  "is_open",
];

const DOCUMENT_FIELDS = ["title", "doc_type", "requires_signature", "sort_order", "body"];

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
    const identity = await actorIdentity(context.supabase, context.userId, context.claims);

    let previousOffering: Record<string, unknown> | null = null;
    let previousWire: Record<string, unknown> | null = null;

    if (offeringId) {
      const { data: existing } = await context.supabase
        .from("offerings")
        .select("*")
        .eq("id", offeringId)
        .maybeSingle();
      previousOffering = (existing as any) ?? null;

      const { data: existingWire } = await context.supabase
        .rpc("get_wire_instructions", { p_offering_id: offeringId })
        .maybeSingle();
      previousWire = ((existingWire as any)?.details ?? null) as Record<string, unknown> | null;

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

    const { error: wireError } = await context.supabase.rpc("save_wire_instructions", {
      p_offering_id: offeringId!,
      p_details: wireDetails as any,
    });
    if (wireError) throw new Error(wireError.message);

    const offeringChanges = diffRecords(previousOffering, payload, OFFERING_FIELDS);
    if (!data.id) {
      await recordAudit(context.supabase, identity, {
        offering_id: offeringId!,
        event_type: "offering_created",
        changes: offeringChanges,
      });
    } else if (offeringChanges.length > 0) {
      await recordAudit(context.supabase, identity, {
        offering_id: offeringId!,
        event_type: "offering_updated",
        changes: offeringChanges,
      });
    }

    const wireChanges = diffRecords(
      previousWire ?? {},
      Object.fromEntries(WIRE_FIELDS.map((f) => [f, (wireDetails as any)[f] ?? ""])),
      [...WIRE_FIELDS],
    );
    if (wireChanges.length > 0) {
      await recordAudit(context.supabase, identity, {
        offering_id: offeringId!,
        event_type: "wire_updated",
        changes: wireChanges,
      });
    }

    return { id: offeringId };
  });

export const saveOfferingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => documentSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertCanEditOffering(context.supabase, context.userId, data.offering_id);


    const payload = {
      offering_id: data.offering_id,
      title: data.title,
      doc_type: data.doc_type,
      body: data.body,
      requires_signature: data.requires_signature,
      sort_order: data.sort_order,
    };

    const identity = await actorIdentity(context.supabase, context.userId, context.claims);

    if (data.id) {
      const { data: existing } = await context.supabase
        .from("offering_documents")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();

      const { error } = await context.supabase
        .from("offering_documents")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);

      const changes = diffRecords((existing as any) ?? null, payload, DOCUMENT_FIELDS);
      if (changes.length > 0) {
        await recordAudit(context.supabase, identity, {
          offering_id: data.offering_id,
          offering_document_id: data.id,
          event_type: "document_updated",
          changes,
        });
      }
      return { id: data.id };
    }

    const { data: inserted, error } = await context.supabase
      .from("offering_documents")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const newId = (inserted as any).id as string;
    await recordAudit(context.supabase, identity, {
      offering_id: data.offering_id,
      offering_document_id: newId,
      event_type: "document_created",
      changes: diffRecords(null, payload, DOCUMENT_FIELDS),
    });
    return { id: newId };
  });

export const deleteOfferingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: target } = await context.supabase
      .from("offering_documents")
      .select("offering_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!target) throw new Error("Document not found.");
    await assertCanEditOffering(
      context.supabase,
      context.userId,
      (target as any).offering_id as string,
    );


    const { count } = await context.supabase
      .from("document_signatures")
      .select("id", { count: "exact", head: true })
      .eq("offering_document_id", data.id);

    if ((count ?? 0) > 0) {
      throw new Error("This document has already been signed by an investor and cannot be removed.");
    }

    const { data: existing } = await context.supabase
      .from("offering_documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase.from("offering_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    if (existing) {
      const identity = await actorIdentity(context.supabase, context.userId, context.claims);
      await recordAudit(context.supabase, identity, {
        offering_id: (existing as any).offering_id as string,
        offering_document_id: data.id,
        event_type: "document_deleted",
        changes: [
          { field: "title", from: (existing as any).title as string, to: null },
          { field: "doc_type", from: (existing as any).doc_type as string, to: null },
        ],
      });
    }

    return { ok: true };
  });

export const listOfferingAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
        before: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);

    let query = context.supabase
      .from("offering_audit_events")
      .select("id, event_type, changes, summary, actor_name, actor_email, offering_document_id, created_at")
      .eq("offering_id", data.offering_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.before) query = query.lt("created_at", data.before);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const events = (rows ?? []).map((r: any) => ({
      id: r.id as string,
      event_type: r.event_type as OfferingAuditEventType,
      changes: (r.changes ?? []) as AuditChange[],
      summary: (r.summary ?? "") as string,
      actor_name: (r.actor_name ?? null) as string | null,
      actor_email: (r.actor_email ?? null) as string | null,
      offering_document_id: (r.offering_document_id ?? null) as string | null,
      created_at: r.created_at as string,
    }));

    return { events, hasMore: events.length === data.limit };
  });

