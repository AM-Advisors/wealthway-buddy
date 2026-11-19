import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { POA_POWERS } from "@/lib/power-of-attorney-model";

const srv = () => import("@/lib/power-of-attorney.server");
const subject = z.object({ kind: z.enum(["investment_profile", "client"]), id: z.string().uuid() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listPowersOfAttorneyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ subject }).parse(d))
  .handler(async ({ context, data }) => (await srv()).listPowersOfAttorney(context.userId, data.subject));

export const startPoaUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ subject, fileName: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => (await srv()).startPoaUpload(context.userId, data.subject, data.fileName));

export const submitPowerOfAttorneyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    subject, agentName: z.string().max(200), agentEmail: z.string().max(320).nullable().optional(), agentRelationship: z.string().max(80).nullable().optional(),
    poaKind: z.enum(["general", "limited"]), durable: z.boolean(), coveredPowers: z.array(z.enum(POA_POWERS)).max(POA_POWERS.length),
    limitsNote: z.string().max(1000).nullable().optional(), effectiveOn: date, expiresOn: date.nullable().optional(),
    fileName: z.string().min(1).max(200), storagePath: z.string().max(600), documentHash: z.string().max(128).nullable().optional(), replacesId: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => { const { subject: s, ...rest } = data; return (await srv()).submitPowerOfAttorney(context.userId, s, rest); });

export const reviewPowerOfAttorneyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), decision: z.enum(["accept", "reject"]), note: z.string().max(1000).nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).reviewPowerOfAttorney(context.userId, data.id, data.decision, data.note));

export const revokePowerOfAttorneyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), reason: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ context, data }) => (await srv()).revokePowerOfAttorney(context.userId, data.id, data.reason));

export const powerOfAttorneyFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).powerOfAttorneyFileUrl(context.userId, data.id));

export const investorProfilesForPoaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ investorUserId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await srv()).investorProfilesForPoa(context.userId, data.investorUserId));
