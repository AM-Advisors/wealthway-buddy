import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, requireSupabaseAuthUnverified } from "@/lib/require-auth";

const path = z.string().max(500);
const srv = () => import("@/lib/session-recordings.server");
const clientInfo = z.object({
  screen: z.string().max(30).optional(), window: z.string().max(30).optional(), pixelRatio: z.number().min(0).max(10).optional(),
  timeZone: z.string().max(60).optional(), language: z.string().max(35).optional(), touch: z.boolean().optional(),
  extendedDisplay: z.boolean().nullable().optional(), connection: z.string().max(20).nullable().optional(),
  camera: z.boolean().optional(), microphone: z.boolean().optional(), consentedAt: z.string().max(40).optional(),
}).optional();
async function requestIp(): Promise<string | null> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? getRequestHeader("x-real-ip") ?? null;
  return ip ? ip.slice(0, 64) : null;
}

// Recording runs before identity verification too, so people stuck at sign-in can be helped.
export const startRecordingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .validator((d) => z.object({ kind: z.enum(["replay", "screen"]), path, userAgent: z.string().max(300).optional(), deviceId: z.string().max(100).optional(), clientInfo, withCamera: z.boolean().optional() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).startRecording(context.userId, { ...data, ip: await requestIp() }));

export const appendReplayChunkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .validator((d) => z.object({ id: z.string().uuid(), seq: z.number().int().min(0).max(100000), path, events: z.string().max(8_000_000) }).parse(d))
  .handler(async ({ context, data }) => (await srv()).appendReplayChunk(context.userId, { ...data, ip: await requestIp() }));

export const finishScreenRecordingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .validator((d) => z.object({ id: z.string().uuid(), note: z.string().max(2000).optional(), bytes: z.number().int().min(0), path }).parse(d))
  .handler(async ({ context, data }) => (await srv()).finishScreen(context.userId, data));

export const listRecordingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ kind: z.enum(["replay", "screen"]).optional(), search: z.string().max(200).optional() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).listRecordings(context.userId, data));

export const openRecordingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).openRecording(context.userId, data.id));

export const downloadRecordingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).downloadRecording(context.userId, data.id));

export const recordingDetailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).recordingDetails(context.userId, data.id));
