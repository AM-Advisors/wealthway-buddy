import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/staff-verification.server");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const kyc = z.object({
  legalName: z.string().trim().min(2).max(200), dateOfBirth: date,
  idType: z.enum(["drivers_license", "passport", "state_id", "other_government_id"]),
  issuingCountry: z.string().trim().min(2).max(80), issuingRegion: z.string().trim().max(80).nullable().optional(),
  idLast4: z.string().trim().regex(/^[A-Za-z0-9]{4}$/, "Enter the last 4 characters of the ID number."), idExpires: date,
  method: z.enum(["other_provider", "in_person", "video_call", "certified_copy"]), verifiedOn: date,
  selfie: z.enum(["passed", "not_performed"]),
});
const aml = z.object({
  screenedOn: date, listsChecked: z.string().trim().min(3).max(500),
  result: z.enum(["no_matches", "matches_ruled_out", "confirmed_match"]), explanation: z.string().trim().max(2000).nullable().optional(),
});

export const verificationPeopleFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).verificationPeople(context.userId));

export const verificationEntriesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ filter: z.enum(["review", "all"]) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).verificationEntries(context.userId, data.filter) as Promise<any[]>);

export const enterVerificationFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    personId: z.string().uuid(), kyc: kyc.nullable(), aml: aml.nullable(),
    sourceReference: z.string().trim().min(3, "Say where the original evidence is kept.").max(500),
    note: z.string().trim().max(2000).nullable(),
    evidence: z.object({ fileName: z.string().min(1).max(255), contentType: z.enum(["application/pdf", "image/png", "image/jpeg"]), contentBase64: z.string().min(1).max(21_000_000) }).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).enterVerification(context.userId, data as any));

export const decideVerificationFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entryId: z.string().uuid(), action: z.enum(["approve", "decline", "withdraw"]), note: z.string().max(2000).nullable() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).decideVerification(context.userId, data));

export const verificationEvidenceLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).evidenceLink(context.userId, data.entryId));
