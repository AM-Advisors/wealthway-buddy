/**
 * Phase 3B server functions.
 *
 * Professional side: prepare, upload, list what I prepared.
 * Client side: the "Items prepared for me" queue, and the decision.
 *
 * Every input is validated against a closed schema; there is no endpoint here
 * that accepts an arbitrary set of columns.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ASSISTED_DRAFT_TYPES } from "@/lib/assisted-fields";

const prepareSchema = z.object({
  delegation_id: z.string().uuid(),
  draft_type: z.enum(ASSISTED_DRAFT_TYPES),
  target_id: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  note: z.string().trim().max(2000).optional(),
});

/** A professional prepares something for the client to review. */
export const prepareAssistedDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => prepareSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { prepareDraft } = await import("@/lib/assisted-actions.server");
    return prepareDraft(context.userId, {
      delegationId: data.delegation_id,
      draftType: data.draft_type,
      targetId: data.target_id ?? null,
      payload: data.payload,
      note: data.note ?? null,
    });
  });

const uploadSchema = z.object({
  delegation_id: z.string().uuid(),
  target_type: z.enum(["investment", "investment_profile", "person"]),
  target_id: z.string().uuid().nullable().optional(),
  storage_path: z.string().min(1).max(500),
  original_filename: z.string().min(1).max(300),
  classification: z.string().min(1).max(100),
  draft_id: z.string().uuid().nullable().optional(),
});

/** Records an upload made by a professional, with the whole agency chain. */
export const recordAssistedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => uploadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { recordAssistedUpload } = await import("@/lib/assisted-actions.server");
    return recordAssistedUpload(context.userId, {
      delegationId: data.delegation_id,
      targetType: data.target_type,
      targetId: data.target_id ?? null,
      storagePath: data.storage_path,
      originalFilename: data.original_filename,
      classification: data.classification,
      draftId: data.draft_id ?? null,
    });
  });

/** What this professional has prepared, across all their clients. */
export const listItemsIPrepared = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listPreparedByMe } = await import("@/lib/assisted-actions.server");
    return { items: await listPreparedByMe(context.userId) };
  });

/** The client's single queue: everything prepared for them. */
export const listItemsPreparedForMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listPreparedForMe } = await import("@/lib/assisted-actions.server");
    return { items: await listPreparedForMe(context.userId) };
  });

const reviewSchema = z.object({
  draft_id: z.string().uuid(),
  decision: z.enum(["approve", "reject", "request_changes"]),
  note: z.string().trim().max(2000).optional(),
});

/** The client's own decision — approve, reject, or ask for changes. */
export const reviewPreparedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { reviewDraft } = await import("@/lib/assisted-actions.server");
    return reviewDraft(context.userId, data.draft_id, data.decision, data.note ?? null);
  });

/** Full before / proposed / decision / final history of one prepared item. */
export const getPreparedItemHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ draft_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { draftHistory } = await import("@/lib/assisted-actions.server");
    return { events: await draftHistory(context.userId, data.draft_id) };
  });
