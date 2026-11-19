import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

/** Staff mark or unmark a test investor. Harmonious emails always stay test investors (server-checked). */
export const setTestInvestorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ onboardingId: z.string().uuid(), isTest: z.boolean(), reason: z.string().max(500) }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/test-investor.server")).setTestInvestor(context.userId, data));
