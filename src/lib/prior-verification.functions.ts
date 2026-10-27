import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/prior-verification.server");
const s = z.string().trim().max(200).optional();

export const investorMissingInfoFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ onboardingId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).missingInfo(context.userId, data.onboardingId));

export const loadPriorVerificationFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({
    onboardingId: z.string().uuid(),
    provider: z.string().trim().min(1, "Name where the earlier check was done.").max(100),
    checkedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for the check date."),
    reference: s,
    person: z.record(z.string(), z.string().max(200)).optional(),
    entity: z.record(z.string(), z.string().max(200)).optional(),
    rerun: z.object({ aml: z.boolean(), kycLink: z.boolean(), kyb: z.boolean() }),
  }).refine((x) => !x.person?.["date_of_birth"] || /^\d{4}-\d{2}-\d{2}$/.test(x.person["date_of_birth"]), "Use YYYY-MM-DD for the date of birth.").parse)
  .handler(async ({ data, context }) => (await srv()).loadPriorVerification(context.userId, data as any));
