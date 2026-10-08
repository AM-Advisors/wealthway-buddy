import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { DESIGN_FORMATS, TEMPLATES } from "@/lib/marketing-design-model";

const srv = () => import("@/lib/marketing-design.server");
const fmt = z.enum(Object.keys(DESIGN_FORMATS) as [string, ...string[]]);
const tpl = z.enum(TEMPLATES.map((t) => t.key) as [string, ...string[]]);
const doc = z.object({ format: fmt, series_key: z.string().max(60).nullable(), pages: z.array(z.object({ id: z.string().max(60), background: z.string().max(20), layers: z.array(z.record(z.string(), z.any())).max(80) })).min(1).max(20) });

export const getBrandKitFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).getBrandKit(context.userId));
export const saveBrandKitFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kit: z.record(z.string(), z.any()), note: z.string().max(500).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveBrandKit(context.userId, data.kit as any, data.note ?? null));
export const getDesignHome = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).designHome(context.userId));
export const createDesignFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["blank", "template", "item", "story", "design"]), template: tpl, format: fmt, source_id: z.string().uuid().nullish(), title: z.string().max(200).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).createDesign(context.userId, data as any));
export const getDesignFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).getDesign(context.userId, data.id));
export const saveDesignFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), title: z.string().min(1).max(200), base_version: z.number().int(), doc }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveDesign(context.userId, data.id, data.doc as any, data.title, data.base_version));
export const restoreDesignVersionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), version: z.number().int().min(1) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).restoreDesignVersion(context.userId, data.id, data.version));
