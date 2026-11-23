import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/assisted-identity.server");
const file = z.object({ base64: z.string().min(10).max(14_000_000), contentType: z.string().max(60), fileName: z.string().max(200) });
const base = { onboardingId: z.string().uuid(), preparerId: z.string().uuid().optional() };

export const assistedIdentityStatusFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object(base).parse)
  .handler(async ({ data, context }) => (await srv()).assistedIdentityStatus(context.userId, data));

export const runAssistedIdentityCheckFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ ...base, documentType: z.enum(["drivers_license", "passport", "state_id"]), front: file, back: file.optional(), permission: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await srv()).runAssistedIdentityCheck(context.userId, data));
