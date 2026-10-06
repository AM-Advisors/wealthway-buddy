import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/marketing-collateral.server");

export const listMarketingCollateral = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listCollateral(context.userId));

export const getMarketingCollateral = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).getCollateral(context.userId, data.id));

export const saveMarketingCollateral = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().nullish(), template: z.enum(["spv", "fof", "captable", "social"]), title: z.string().min(1).max(200), content: z.record(z.string(), z.any()) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveCollateral(context.userId, data));

export const decideMarketingCollateral = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), action: z.enum(["submit", "approve", "reject"]), note: z.string().max(1000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).decideCollateral(context.userId, data.id, data.action, data.note));

export const storeMarketingCollateralExport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), base64: z.string().max(36_000_000) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).storeExport(context.userId, data.id, data.base64));
