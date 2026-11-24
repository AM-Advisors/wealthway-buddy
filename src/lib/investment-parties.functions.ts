import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const investmentPartiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/investment-parties.server")).investmentParties(context.userId, data.onboardingId));

export const inviteCoOwnerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: z.string().uuid(), personId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/investment-parties.server")).inviteCoOwner(context.userId, data));
