import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REG_TYPE_VALUES } from "@/lib/reg-types";
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

export const FUND_TYPES = [
  "SPV",
  "Private Equity",
  "Venture Capital",
  "Family Office",
  "Hedge Fund",
  "Other",
] as const;

export const ENTITY_TYPES = ["LLC", "LP", "GP", "Series LLC", "Master LLC"] as const;

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
  reg_type: z.enum(REG_TYPE_VALUES),
  min_investment_cents: z.number().int().min(0),
  target_raise_cents: z.number().int().min(0).nullable().default(null),
  // Fields a screen may leave out. Anything omitted is left exactly as it is
  // on the fund rather than being reset, so one editor never wipes another's work.
  wire_fee_cents: z.number().int().min(0).optional(),
  closing_cost_cents: z.number().int().min(0).optional(),
  share_price_cents: z.number().int().min(0).optional(),

  legal_entity_name: z.string().trim().max(200).optional(),
  fund_type: z.enum(FUND_TYPES).nullable().optional(),
  fund_type_other: z.string().trim().max(120).optional(),
  entity_type: z.enum(ENTITY_TYPES).nullable().optional(),
  state_formed: z.string().trim().max(60).optional(),
  date_formed: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-01-31")
    .nullable()
    .optional(),

  is_open: z.boolean().default(true),
  wire_instructions: wireSchema,
  client_id: z.string().uuid().nullable().optional(),
  sow_id: z.string().uuid().nullable().optional(),
});


const documentSchema = z.object({
  id: z.string().uuid().optional(),
  offering_id: z.string().uuid(),
  title: z.string().trim().min(2, "Enter a document title").max(200),
  doc_type: z.string().trim().min(2).max(60),
  body: z.string().trim().max(200000).default(""),
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

/** Funds the caller can edit (all for admins, assigned funds for managers) with their documents. */
export const listManagedFundDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const isAdmin = await isAdminUser(supabase, userId);

    let managedIds: string[] = [];
    if (!isAdmin) {
      const { data: assignments, error } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      managedIds = [...new Set(((assignments ?? []) as any[]).map((a) => a.offering_id as string))];
      if (managedIds.length === 0) return { isAdmin, offerings: [] };
    }

    let query = supabase
      .from("offerings")
      .select("id, name, reg_type, min_investment_cents, is_open")
      .order("name");
    if (!isAdmin) query = query.in("id", managedIds);
    const { data: offerings, error: offeringError } = await query;
    if (offeringError) throw new Error(offeringError.message);

    const ids = ((offerings ?? []) as any[]).map((o) => o.id as string);
    const { data: documents } = ids.length
      ? await supabase
          .from("offering_documents")
          .select(
            "id, offering_id, title, doc_type, body, requires_signature, sort_order, file_name, file_path, file_size_bytes",
          )
          .in("offering_id", ids)
          .order("sort_order", { ascending: true })
      : { data: [] as any[] };

    return {
      isAdmin,
      offerings: ((offerings ?? []) as any[]).map((o) => ({
        ...o,
        documents: ((documents ?? []) as any[]).filter((d) => d.offering_id === o.id),
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
  "wire_fee_cents",
  "closing_cost_cents",
  "share_price_cents",
  "legal_entity_name",
  "fund_type",
  "fund_type_other",
  "entity_type",
  "state_formed",
  "date_formed",


  "is_open",
];

const DOCUMENT_FIELDS = ["title", "doc_type", "requires_signature", "sort_order", "body"];

export const saveOffering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => offeringSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);

    // Only the fields the screen actually sent are written. A screen that does
    // not show the legal entity details or the fees leaves them untouched.
    const payload: Record<string, unknown> = {
      name: data.name,
      slug: data.slug,
      summary: data.summary || null,
      reg_type: data.reg_type,
      min_investment_cents: data.min_investment_cents,
      target_raise_cents: data.target_raise_cents,
      is_open: data.is_open,
    };
    if (data.wire_fee_cents !== undefined) payload["wire_fee_cents"] = data.wire_fee_cents;
    if (data.closing_cost_cents !== undefined)
      payload["closing_cost_cents"] = data.closing_cost_cents;
    if (data.share_price_cents !== undefined)
      payload["share_price_cents"] = data.share_price_cents;
    if (data.legal_entity_name !== undefined)
      payload["legal_entity_name"] = data.legal_entity_name || null;
    if (data.fund_type !== undefined) {
      payload["fund_type"] = data.fund_type;
      payload["fund_type_other"] =
        data.fund_type === "Other" ? data.fund_type_other || null : null;
    } else if (data.fund_type_other !== undefined) {
      payload["fund_type_other"] = data.fund_type_other || null;
    }
    if (data.entity_type !== undefined) payload["entity_type"] = data.entity_type;
    if (data.state_formed !== undefined) payload["state_formed"] = data.state_formed || null;
    if (data.date_formed !== undefined) payload["date_formed"] = data.date_formed;

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

      // A fee typed in by hand stops following a rate card until it is pointed
      // back at one on the fund's fee panel.
      const feePatch: Record<string, unknown> = {};
      if (
        previousOffering &&
        data.wire_fee_cents !== undefined &&
        previousOffering["wire_fee_cents"] !== data.wire_fee_cents
      ) {
        feePatch["wire_fee_source"] = "custom";
        feePatch["wire_fee_rate_id"] = null;
      }
      if (
        previousOffering &&
        data.closing_cost_cents !== undefined &&
        previousOffering["closing_cost_cents"] !== data.closing_cost_cents
      ) {
        feePatch["closing_cost_source"] = "custom";
        feePatch["closing_cost_rate_id"] = null;
      }

      const { error } = await context.supabase
        .from("offerings")
        .update({ ...payload, ...feePatch } as any)
        .eq("id", offeringId);
      if (error) throw new Error(error.message);
    } else {
      // A fund cannot exist before its statement of work is signed.
      if (!data.sow_id) {
        throw new Error(
          "Choose the signed statement of work that covers this fund before creating it.",
        );
      }
      const { data: sow, error: sowError } = await context.supabase
        .from("client_sows")
        .select("id, client_id, title, status, signed_on, signed_by, offering_id, approval_status")
        .eq("id", data.sow_id)
        .maybeSingle();
      if (sowError) throw new Error(sowError.message);
      if (!sow) throw new Error("That statement of work could not be found.");
      const row = sow as any;
      if (row.status !== "active" || !row.signed_on || !row.signed_by) {
        throw new Error(
          "That statement of work is not signed yet. A fund can only be created once the client has signed.",
        );
      }
      if (row.approval_status !== "approved") {
        throw new Error(
          row.approval_status === "rejected"
            ? "That statement of work was rejected in review. It cannot be used for a fund."
            : "That statement of work is still waiting for approval. An administrator has to approve it before a fund can be created.",
        );
      }
      if (row.offering_id) {
        throw new Error("That statement of work already covers another fund.");
      }
      if (data.client_id && row.client_id !== data.client_id) {
        throw new Error("That statement of work belongs to a different client.");
      }

      const { data: inserted, error } = await context.supabase
        .from("offerings")
        .insert({ ...payload, client_id: row.client_id } as any)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      offeringId = (inserted as any).id as string;

      const { error: linkError } = await context.supabase
        .from("client_sows")
        .update({ offering_id: offeringId } as any)
        .eq("id", row.id)
        .is("offering_id", null);
      if (linkError) throw new Error(linkError.message);
    }

    const { error: wireError } = await context.supabase.rpc("save_wire_instructions", {
      p_offering_id: offeringId!,
      p_details: wireDetails as any,
    });
    if (wireError) throw new Error(wireError.message);

    const offeringChanges = diffRecords(
      previousOffering,
      payload,
      OFFERING_FIELDS.filter((f) => f in payload),
    );
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

