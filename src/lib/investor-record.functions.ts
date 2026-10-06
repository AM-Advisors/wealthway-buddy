import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/investor-record.server");
const uuid = z.string().uuid();
const str = z.string().max(500).nullable().optional();
const cents = z.number().int().nonnegative().max(1e14).nullable().optional();

const person = z.object({
  firstName: z.string().max(120).optional(), middleName: str, lastName: z.string().max(120).optional(), preferredName: str,
  email: z.string().max(254).optional(), phone: str, dateOfBirth: str, citizenship: str,
  addressLine1: str, addressLine2: str, city: str, region: str, postalCode: str, country: str,
  mailingAddress: z.record(z.string(), z.string().max(300)).nullable().optional(),
});
const details = z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional();
const investment = z.object({
  amountCents: cents, commitmentCents: cents, acceptedCents: cents, investmentDate: str, unitCount: z.number().nonnegative().nullable().optional(),
  sourceReferral: str, managerNotes: z.string().max(4000).nullable().optional(), internalNotes: z.string().max(4000).nullable().optional(),
});
const related = z.array(z.object({ firstName: z.string().max(120), lastName: z.string().max(120), email: str, role: z.string().max(40), ownershipPercent: z.number().min(0).max(100).nullable().optional(), isSigner: z.boolean().optional() })).max(20);

export const searchInvestorsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, email: str, name: str, entityName: str }).parse)
  .handler(async ({ data, context }) => (await srv()).searchInvestors(context.userId, data as any));

export const createInvestorFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    offeringId: uuid, personId: uuid.nullable().optional(), profileId: uuid.nullable().optional(), confirmedNew: z.boolean().optional(),
    person, profile: z.object({ type: z.string().max(40), subType: str, legalName: str, details }), investment, related: related.optional(),
    taxId: z.string().regex(/^\d{9}$/, "The SSN / Tax ID must be 9 digits.").nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => (await srv()).createInvestor(context.userId, data as any));

export const updateInvestorRecordFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, person: person.optional(), profile: z.object({ legalName: str, details }).optional(), investment: investment.optional() }).parse)
  .handler(async ({ data, context }) => (await srv()).updateInvestorRecord(context.userId, data as any));

export const removeFromFundFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, reason: str }).parse)
  .handler(async ({ data, context }) => (await srv()).removeFromFund(context.userId, data as any));

export const fundInvestorRecordsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).fundInvestorRecords(context.userId, data.offeringId));

export const investorRecordDetailFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).investorRecordDetail(context.userId, data.onboardingId));

export const resolveSuggestionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, action: z.enum(["accept", "reject", "review_later"]) }).parse)
  .handler(async ({ data, context }) => (await srv()).resolveSuggestion(context.userId, data));

export const bulkPreviewFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, csv: z.string().max(500_000) }).parse)
  .handler(async ({ data, context }) => JSON.parse(JSON.stringify(await (await srv()).bulkPreview(context.userId, data))) as { importId: string; summary: Record<string, number>; rows: { index: number; cls: string; errors: string[]; name: string; email: string; amount: string; conflicts: { field: string; current: string | number | null; proposed: string | number | null }[] }[] });

export const bulkCommitFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ importId: uuid, decisions: z.record(z.string(), z.enum(["keep", "use_imported", "later"])).optional() }).parse)
  .handler(async ({ data, context }) => (await srv()).bulkCommit(context.userId, data as any));

export const bulkCancelFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ importId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).bulkCancel(context.userId, data.importId));

export const prefillForInvestorFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).prefillForInvestor(context.userId, data.onboardingId));

export const confirmInvestorInformationFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: uuid, corrections: z.record(z.string(), z.string().max(300)).optional() }).parse)
  .handler(async ({ data, context }) => (await srv()).confirmInvestorInformation(context.userId, data as any));

/* ------------------------------------------------ related-person review (staff) */

export const listRelatedPersonReviewsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertStaff } = await import("@/lib/investor-onboarding.server");
    await assertStaff(context.userId);
    const { listRelatedPersonReviews } = await import("@/lib/related-person.server");
    return { items: await listRelatedPersonReviews() };
  });

export const resolveRelatedPersonReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    reviewId: z.string().uuid(), resolution: z.enum(["use_existing", "keep_new", "review_later"]),
    personId: z.string().uuid().nullable().optional(), note: z.string().trim().max(500).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { assertStaff } = await import("@/lib/investor-onboarding.server");
    await assertStaff(context.userId);
    const { resolveRelatedPersonReview } = await import("@/lib/related-person.server");
    return resolveRelatedPersonReview({ ...data, actorUserId: context.userId });
  });

export const readInvestorDocumentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    onboardingId: uuid, fileName: z.string().max(200),
    mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
    base64: z.string().max(14_000_000),
  }).parse)
  .handler(async ({ data, context }) => (await (await import("@/lib/investor-document-ai.server")).readInvestorDocument(context.userId, data)) as unknown as { documentKind: string; summary: string; found: { label: string; value: string; suggested: boolean }[] });

/** Reads a Google Sheet shared "anyone with the link" as CSV. Only docs.google.com sheet ids are fetched. */
export const fetchGoogleSheetCsvFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ url: z.string().url().max(2000) }).parse)
  .handler(async ({ data }) => {
    const m = data.url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
    if (!m) throw new Error("That isn't a Google Sheets link.");
    const gid = data.url.match(/[#&?]gid=(\d+)/)?.[1];
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`, { redirect: "follow" });
    const text = await res.text();
    if (!res.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error("Couldn't open that sheet. Set sharing to \"Anyone with the link can view\", or download it as Excel and upload the file.");
    return { csv: text.slice(0, 500_000) };
  });
