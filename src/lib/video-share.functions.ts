import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/video-share.server");

export const videoShareStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ recordingId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).shareStatus(context.userId, data.recordingId));

export const createVideoShareFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ recordingId: z.string().uuid(), includeCamera: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).createShareLink(context.userId, data));

export const cancelVideoShareFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ recordingId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).cancelShareLink(context.userId, data.recordingId));
