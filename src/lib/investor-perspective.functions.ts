import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "./require-auth";

export const investorPerspectiveFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ onboardingId: z.string().uuid(), participantId: z.string().uuid().nullable().optional() }).parse)
  .handler(async ({ context, data }) => (await import("./investor-perspective.server")).investorPerspective(context.userId, { onboardingId: data.onboardingId, participantId: data.participantId ?? null }));