import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const em = () => import("@/lib/investor-emails.server");
const pp = () => import("@/lib/onboarding-participants.server");
const rec = () => import("@/lib/investor-record.server");
const onb = z.object({ onboardingId: z.string().uuid() });
const str = z.string().max(300).nullable().optional();

export const investorEmailHistoryFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(onb.parse)
  .handler(async ({ data, context }) => (await em()).investorEmailHistory(context.userId, data.onboardingId));
export const checkEmailDeliveryFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(onb.parse)
  .handler(async ({ data, context }) => (await em()).lookupProviderDeliveries(context.userId, data.onboardingId));

export const listParticipantsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(onb.parse)
  .handler(async ({ data, context }) => (await pp()).listParticipants(context.userId, data.onboardingId));
export const assignParticipantFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(onb.extend({ role: z.enum(["preparer", "signer", "contact"]), fullName: z.string().min(1).max(160), email: z.string().email().max(254), title: str }).parse)
  .handler(async ({ data, context }) => (await pp()).assignParticipant(context.userId, data));
export const removeParticipantFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(z.object({ participantId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await pp()).removeParticipant(context.userId, data.participantId));

export const preparerWorkspaceFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(z.object({ token: z.string().min(20).max(100) }).parse)
  .handler(async ({ data, context }) => (await pp()).preparerWorkspace(context.userId, data.token));
export const preparerSaveFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(onb.extend({
    preparerId: z.string().uuid(),
    person: z.object({ firstName: z.string().max(120).optional(), middleName: str, lastName: z.string().max(120).optional(), phone: str, citizenship: str, addressLine1: str, addressLine2: str, city: str, region: str, postalCode: str, country: str }).optional(),
    profile: z.object({ legalName: str, details: z.record(z.string(), z.union([z.string().max(500), z.null()])).optional() }).optional(),
    taxId: z.string().regex(/^\d{9}$/, "The tax ID must be 9 digits.").nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => (await rec()).updateInvestorRecord(context.userId, data as any));
export const preparerAddPartyFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(onb.extend({ preparerId: z.string().uuid(), add: z.object({ firstName: z.string().min(1).max(120), lastName: z.string().min(1).max(120), email: str, role: z.string().max(40), ownershipPercent: z.number().min(0).max(100).nullable().optional(), isSigner: z.boolean().optional() }) }).parse)
  .handler(async ({ data, context }) => (await rec()).editRelatedParty(context.userId, data as any));

export const contactWorkspaceFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(z.object({ token: z.string().min(20).max(100) }).parse)
  .handler(async ({ data, context }) => (await pp()).contactWorkspace(context.userId, data.token));
export const changeInvestingAsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(onb.extend({ type: z.enum(["joint", "entity", "trust"]), subType: str, legalName: str }).parse)
  .handler(async ({ data, context }) => (await pp()).changeInvestingAs(context.userId, data as any));
export const addPersonForKycFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(onb.extend({
    firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120), email: z.string().email().max(254),
    role: z.enum(["joint_owner", "authorized_signer", "beneficial_owner", "control_person", "trustee", "officer", "manager", "member"]),
    title: str, ownershipPercent: z.number().min(0).max(100).nullable().optional(), sendKyc: z.boolean(), sendSignature: z.boolean(),
  }).parse)
  .handler(async ({ data, context }) => (await pp()).addPersonForKyc(context.userId, data as any));
