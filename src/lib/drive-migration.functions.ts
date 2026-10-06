import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const S = () => import("@/lib/drive-migration.server");
const uuid = z.string().uuid();
const driveId = z.string().regex(/^[A-Za-z0-9_-]{5,200}$/);

export const getFolderSources = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).folderSources(context.userId));

export const searchDriveFolders = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().max(120).nullable().optional(), parentId: driveId.nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => (await S()).searchFolders(context.userId, data));

export const startDriveMigration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: uuid, folderId: driveId.nullable() }).parse(d))
  .handler(async ({ context, data }) => (await S()).startMigration(context.userId, data));

export const rescanDriveMigration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ migrationId: uuid }).parse(d))
  .handler(async ({ context, data }) => { const s = await S(); await s.requireManager(context.userId); await s.scan(data.migrationId, context.userId); return { ok: true }; });

export const getDriveMigration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await S()).getMigration(context.userId, data.offeringId));

export const getDriveMigrationOverview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await S()).migrationOverview(context.userId, data.offeringId));

export const updateDriveMigrationItems = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    ids: z.array(uuid).min(1).max(2000), action: z.enum(["pending", "accept", "skip", "duplicate"]).optional(),
    category: z.enum(["fund", "investor"]).optional(), documentType: z.string().max(60).optional(), onboardingId: uuid.nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => (await S()).updateItems(context.userId, data as any));

export const aiSortDriveMigration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ migrationId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await S()).aiSort(context.userId, data.migrationId));

export const applyDriveMigration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ migrationId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await S()).applyBatch(context.userId, data.migrationId));

export const extractDriveMigration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ migrationId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await S()).extractNext(context.userId, data.migrationId));

export const decideDriveSuggestion = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, accept: z.boolean(), note: z.string().max(500).nullable().optional(), investorType: z.enum(["individual", "joint", "entity", "trust", "ira"]).nullable().optional(), email: z.string().email().max(200).nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => (await S()).decideSuggestion(context.userId, context.supabase, data));
