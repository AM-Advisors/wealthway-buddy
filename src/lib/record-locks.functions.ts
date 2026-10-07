import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const listLockedEditsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("@/lib/record-locks.server")).listLockedEdits(context.userId));

export const decideLockedEditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ requestId: z.string().uuid(), decision: z.enum(["approve", "reject"]), note: z.string().max(500).nullish() }).parse)
  .handler(async ({ data, context }) => (await import("@/lib/record-locks.server")).decideLockedEdit(context as any, data));
