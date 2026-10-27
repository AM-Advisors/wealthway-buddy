import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
export const saveFundOriginFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: z.string().uuid(), origin: z.enum(["new", "migration"]), reason: z.string().trim().min(3).max(500) }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/fund-origin.server")).saveFundOrigin(context.userId, data.offeringId, data.origin, data.reason));
