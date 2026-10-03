import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/marketing-campaigns.server");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getCampaigns = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: z.string().nullish(), to: z.string().nullish() }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await srv()).listCampaigns(context.userId, data.from, data.to));

export const getCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).getCampaign(context.userId, data.id));

export const saveCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().nullish(), name: z.string().max(160), theme: z.string().max(500).nullable(), goal: z.string().max(500).nullable(),
    notes: z.string().max(5000).nullable(), color: z.string().max(20), startsOn: day, endsOn: day,
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveCampaign(context.userId, data));

export const archiveCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).archiveCampaign(context.userId, data.id));

export const assignToCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["email", "post"]), itemId: z.string().uuid(), campaignId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).assignToCampaign(context.userId, data.kind, data.itemId, data.campaignId));

export const composeCampaignEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    campaignId: z.string().uuid(), name: z.string().max(200), subject: z.string().min(1).max(200), heading: z.string().max(300).nullable(),
    body: z.string().min(1).max(10000), buttonText: z.string().max(100).nullable(), buttonHref: z.string().url().max(2000).nullable(),
    audienceId: z.string().uuid(), sendAt: z.string().datetime().nullable(), submit: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).composeCampaignEmail(context.userId, data));
