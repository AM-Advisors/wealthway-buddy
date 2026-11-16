import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/staff-verification.server");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const opt = (max: number) => z.string().trim().max(max).nullable().optional();

const kyc = z.object({
  legalName: z.string().trim().min(2).max(200), dateOfBirth: date,
  idType: z.enum(["drivers_license", "passport", "state_id", "other_government_id"]),
  issuingCountry: z.string().trim().min(2).max(80), issuingRegion: opt(80),
  idLast4: z.string().trim().regex(/^[A-Za-z0-9]{4}$/, "Enter the last 4 characters of the ID number."), idExpires: date,
  method: z.enum(["other_provider", "in_person", "video_call", "certified_copy"]), verifiedOn: date,
  selfie: z.enum(["passed", "not_performed"]),
});
const aml = z.object({
  screenedOn: date, listsChecked: z.string().trim().min(3).max(500),
  result: z.enum(["no_matches", "matches_ruled_out", "confirmed_match"]), explanation: z.string().trim().max(2000).nullable().optional(),
});
const kyb = z.object({
  legalName: z.string().trim().min(2).max(200), entityType: opt(80), formationJurisdiction: opt(80), formationDate: date.nullable().optional(),
  method: z.enum(["other_provider", "state_registry", "formation_documents", "certified_copy"]), verifiedOn: date, ownersChecked: z.string().trim().min(3).max(1000),
});
const details = z.object({
  addressLine1: opt(200), addressLine2: opt(200), city: opt(120), region: opt(80), postalCode: opt(20), country: opt(80),
  citizenship: opt(80), phone: opt(40), occupation: opt(120),
});
const entryFields = {
  subject: z.enum(["person", "company"]), kyc: kyc.nullable(), aml: aml.nullable(), kyb: kyb.nullable().optional(), details: details.nullable().optional(),
  runScreening: z.boolean().optional(), idNumber: opt(40), ssn: opt(20), ein: opt(20),
  sourceReference: z.string().trim().min(3, "Say where the original evidence is kept.").max(500),
  note: z.string().trim().max(2000).nullable(),
};

export const verificationPeopleFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).verificationPeople(context.userId));

export const verificationCompaniesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).verificationCompanies(context.userId));

export const verificationEntriesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ filter: z.enum(["review", "all"]) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).verificationEntries(context.userId, data.filter) as Promise<any[]>);

export const enterVerificationFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    ...entryFields, personId: z.string().uuid().nullable().optional(), profileId: z.string().uuid().nullable().optional(),
    clientKey: z.string().uuid().nullable().optional(),
    evidence: z.object({ fileName: z.string().min(1).max(255), contentType: z.enum(["application/pdf", "image/png", "image/jpeg"]), contentBase64: z.string().min(1).max(21_000_000) }).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).enterVerification(context.userId, data as any));

export const bulkEnterVerificationFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    batchId: z.string().uuid(),
    rows: z.array(z.object({
      row: z.number().int().min(1), clientKey: z.string().uuid(),
      match: z.union([z.object({ kind: z.literal("person"), email: z.string().trim().email().max(320) }), z.object({ kind: z.literal("company"), companyName: z.string().trim().min(2).max(200) })]),
      input: z.object(entryFields),
    })).min(1).max(5),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).bulkEnterVerification(context.userId, data as any));

export const decideVerificationFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entryId: z.string().uuid(), action: z.enum(["approve", "decline", "withdraw"]), note: z.string().max(2000).nullable() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).decideVerification(context.userId, data));

export const verificationEvidenceLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).evidenceLink(context.userId, data.entryId));
