import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, requireSupabaseAuthUnverified } from "@/lib/require-auth";

const path = z.string().max(500);
const srv = () => import("@/lib/session-recordings.server");

// Recording runs before identity verification too, so people stuck at sign-in can be helped.
export const startRecordingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .validator((d) => z.object({ kind: z.enum(["replay", "screen"]), path, userAgent: z.string().max(300).optional(), deviceId: z.string().max(100).optional() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).startRecording(context.userId, data));

export const appendReplayChunkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .validator((d) => z.object({ id: z.string().uuid(), seq: z.number().int().min(0).max(100000), path, events: z.string().max(8_000_000) }).parse(d))
  .handler(async ({ context, data }) => (await srv()).appendReplayChunk(context.userId, data));

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
