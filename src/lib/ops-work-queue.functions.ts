import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const opsWorkQueueFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOpsStaff } = await import("@/lib/fund-manager-profile.server");
    await assertOpsStaff(context.userId);
    const { workQueue } = await import("@/lib/ops-work-queue.server");
    return workQueue();
  });

export const clientTimelineFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clientId: z.string().uuid(), before: z.string().datetime().nullable().optional() }).parse)
  .handler(async ({ data, context }) => {
    const { assertOpsStaff } = await import("@/lib/fund-manager-profile.server");
    await assertOpsStaff(context.userId);
    const { clientTimeline } = await import("@/lib/ops-work-queue.server");
    return clientTimeline(data.clientId, data.before ?? null);
  });
