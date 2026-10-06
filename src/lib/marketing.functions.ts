import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const id = z.object({ id: z.string().uuid() });
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().max(300) }),
  z.object({ type: z.literal("text"), text: z.string().max(10000) }),
  z.object({ type: z.literal("image"), url: z.string().max(4000), alt: z.string().max(300).optional() }),
  z.object({ type: z.literal("button"), text: z.string().max(100), href: z.string().max(2000) }),
  z.object({ type: z.literal("divider") }),
]);
const decision = z.object({ id: z.string().uuid(), action: z.enum(["submit", "approve", "reject"]), note: z.string().max(1000).nullish() });
const srv = () => import("@/lib/marketing.server");

export const getMarketingDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).dashboard(context.userId));

export const getMarketingCalendar = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).calendar(context.userId, data.from, data.to));

export const getMarketingPosts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listPosts(context.userId));

export const getMarketingPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d))
  .handler(async ({ data, context }) => (await srv()).getPost(context.userId, data.id));

export const saveMarketingPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().nullish(), title: z.string().max(200), body: z.string().max(63000),
    channels: z.array(z.enum(["linkedin", "facebook", "instagram"])).max(3), imagePaths: z.array(z.string().max(300)).max(10),
    scheduledAt: z.string().datetime().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).savePost(context.userId, data));

export const decideMarketingPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => decision.parse(d))
  .handler(async ({ data, context }) => (await srv()).decidePost(context.userId, data.id, data.action, data.note));

export const uploadMarketingAsset = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileName: z.string().max(200), contentType: z.string().max(100), base64: z.string().max(21_000_000) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).uploadAsset(context.userId, data.fileName, data.contentType, data.base64));

export const getMarketingChannels = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).channelStatus(context.userId));

export const setMarketingChannel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ channel: z.enum(["linkedin", "facebook", "instagram"]), accountRef: z.string().trim().max(80), displayName: z.string().max(120).nullable() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).setChannel(context.userId, data.channel, data.accountRef, data.displayName));

export const getMarketingAudiences = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listAudiences(context.userId));

export const createMarketingAudience = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(120), sources: z.array(z.enum(["sales", "clients", "investors", "csv"])).min(1), csv: z.string().max(5_000_000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).createAudience(context.userId, data));

export const getMarketingEmails = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listEmails(context.userId));

export const getMarketingEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d))
  .handler(async ({ data, context }) => (await srv()).getEmail(context.userId, data.id));

export const saveMarketingEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().nullish(), name: z.string().max(200), subject: z.string().max(200), preheader: z.string().max(200).nullable(),
    blocks: z.array(block).max(60), audienceId: z.string().uuid().nullable(), scheduledAt: z.string().datetime().nullable(),
    attachmentAssetIds: z.array(z.string().uuid()).max(5).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveEmail(context.userId, data));

export const decideMarketingEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => decision.parse(d))
  .handler(async ({ data, context }) => (await srv()).decideEmail(context.userId, data.id, data.action, data.note));

export const sendMarketingTestEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => id.parse(d))
  .handler(async ({ data, context }) => (await srv()).sendTestEmail(context.userId, data.id));

export const marketingDraftCopy = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["linkedin", "facebook", "instagram", "email", "subject"]), brief: z.string().trim().min(3).max(3000), current: z.string().max(20000).nullish() }).parse(d))
  .handler(async ({ data, context }) => {
    await (await srv()).requireMarketing(context.userId);
    const { draftCopy } = await import("@/lib/marketing-ai.server");
    return { text: await draftCopy(data.kind, data.brief, data.current) };
  });

export const marketingGenerateImage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prompt: z.string().trim().min(3).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await srv();
    await s.requireMarketing(context.userId);
    const { generateImage } = await import("@/lib/marketing-ai.server");
    const img = await generateImage(data.prompt);
    return s.uploadAsset(context.userId, "ai-image.png", img.contentType, img.base64);
  });

/** Public: unsubscribe link from a marketing email (token is the only key). */
export const unsubscribeEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().regex(/^[a-f0-9]{20,80}$/) }).parse(d))
  .handler(async ({ data }) => (await srv()).unsubscribeByToken(data.token));

export const marketingSuggestPostLayout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ title: z.string().max(300), body: z.string().trim().min(10).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    await (await srv()).requireMarketing(context.userId);
    const { suggestPostLayout } = await import("@/lib/marketing-ai.server");
    return suggestPostLayout(data.title, data.body);
  });

/** Returns a data URL (not stored) so the browser can render it under the layout. */
export const marketingBackgroundArt = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ theme: z.string().trim().min(3).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await (await srv()).requireMarketing(context.userId);
    const { generateBackground } = await import("@/lib/marketing-ai.server");
    const img = await generateBackground(data.theme);
    return { dataUrl: `data:${img.contentType};base64,${img.base64}` };
  });

export const startLinkedInConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).linkedinStart(context.userId));
export const getLinkedInDirect = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).linkedinDirectStatus(context.userId));
export const disconnectLinkedIn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).linkedinDisconnect(context.userId));
