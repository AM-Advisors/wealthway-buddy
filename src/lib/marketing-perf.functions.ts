import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const q = () => import("@/lib/marketing-queue.server");
const reason = z.object({ reason: z.string().min(1).max(1000) });

export const getPerformance = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(7).max(90) }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/marketing-perf.server")).dashboard(context.userId, data.days));
export const getPublishingMode = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await q()).modeState(context.userId));
export const requestLivePublishing = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => reason.parse(d)).handler(async ({ data, context }) => (await q()).requestLive(context.userId, data.reason));
export const approveLivePublishing = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => reason.parse(d)).handler(async ({ data, context }) => (await q()).approveLive(context.userId, data.reason));
export const returnToTestPublishing = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await q()).backToTest(context.userId));
export const chooseSearchProperty = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ siteUrl: z.string().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => (await q()).chooseProperty(context.userId, data.siteUrl));
