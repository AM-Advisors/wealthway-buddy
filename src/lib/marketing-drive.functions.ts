import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const id = z.string().uuid();
const uid = (c: any) => c.userId as string;

export const syncMarketingDriveNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("@/lib/marketing-drive.server")).syncMarketingDrive(uid(context)));

export const getMarketingAssets = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["image", "sheet", "video", "other"]).nullish(), theme: z.string().max(200).nullish(), search: z.string().max(120).nullish() }).parse(d ?? {}))
  .handler(async ({ context, data }) => (await import("@/lib/marketing-drive.server")).listMarketingAssets(uid(context), data));

export const loadMarketingPreviews = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(id).max(24) }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/marketing-drive.server")).loadPreviews(uid(context), data.ids));

export const useMarketingDriveImage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assetId: id }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/marketing-drive.server")).useDriveImage(uid(context), data.assetId));

export const getCampaignAssets = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: id }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/marketing-drive.server")).campaignAssets(uid(context), data.campaignId));

export const addCampaignAsset = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: id, assetId: id }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/marketing-drive.server")).addCampaignAsset(uid(context), data.campaignId, data.assetId));

export const removeCampaignAsset = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/marketing-drive.server")).removeCampaignAsset(uid(context), data.id));

export const createMarketingShareLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assetId: id, audience: z.enum(["client", "prospect", "investor", "partner", "other"]), recipientName: z.string().max(200).nullish(), recipientEmail: z.string().email().max(200).nullish().or(z.literal("")) }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/marketing-drive.server")).createShareLink(uid(context), data));

export const getMarketingShareLinks = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("@/lib/marketing-drive.server")).listShareLinks(uid(context)));

export const revokeMarketingShareLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/marketing-drive.server")).revokeShareLink(uid(context), data.id));
