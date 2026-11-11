import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { COMPONENT_KEYS } from "@/lib/foundation-admin-model";

const S = () => import("@/lib/foundation-onboarding.server");
const id = z.string().uuid();
const upload = z.object({
  profileId: id, kind: z.enum(["governing_document", "determination_letter", "authority_evidence", "supporting_evidence"]),
  title: z.string().trim().min(2).max(200), fileName: z.string().min(1).max(255), mimeType: z.string().max(200),
  base64: z.string().min(4).max(36_000_000), replacesId: id.nullish(),
});

// ---- Client members (exact-client membership, re-checked on every call)
export const getClientFoundationAvailability = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).clientFoundationAvailability(context.userId));
export const getClientFoundations = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).getClientFoundations(context.userId));
export const submitClientFoundationFacts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: id, facts: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => (await S()).submitClientFoundationFacts(context.userId, data));
export const requestClientFoundationPerson = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: id, request: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => (await S()).requestClientFoundationPerson(context.userId, data));
export const uploadClientFoundationDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => upload.parse(d))
  .handler(async ({ data, context }) => (await S()).uploadClientFoundationDocument(context.userId, data));
export const openClientFoundationDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ documentId: id }).parse(d))
  .handler(async ({ data, context }) => (await S()).openClientFoundationDocument(context.userId, data.documentId));
export const markClientFoundationReady = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: id }).parse(d))
  .handler(async ({ data, context }) => (await S()).markClientFoundationReady(context.userId, data.profileId));
export const withdrawClientFoundationSubmission = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ submissionId: id }).parse(d))
  .handler(async ({ data, context }) => (await S()).withdrawClientFoundationSubmission(context.userId, data.submissionId));

// ---- Harmonious staff
export const getFoundationReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: id }).parse(d))
  .handler(async ({ data, context }) => (await S()).getFoundationReview(context.userId, data.profileId));
export const reviewFoundationSubmission = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    submissionId: id, decision: z.enum(["accepted", "correction_requested"]), note: z.string().max(2000).nullish(), confirmReplace: z.boolean().optional(),
    person: z.object({ action: z.enum(["create_new", "use_existing"]), personId: id.nullish() }).nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await S()).reviewFoundationSubmission(context.userId, data));
export const reviewFoundationDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ documentId: id, decision: z.enum(["accepted", "correction_requested"]), note: z.string().max(1000).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await S()).reviewFoundationDocument(context.userId, data));
export const getFoundationVerification = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: id }).parse(d))
  .handler(async ({ data, context }) => (await S()).getFoundationVerification(context.userId, data.profileId));
export const decideFoundationEntityReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: id, decision: z.enum(["approved", "declined", "more_information"]), evidenceDocumentIds: z.array(id).max(20), note: z.string().trim().min(3).max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).decideFoundationEntityReview(context.userId, data));
export const getFoundationReleaseControls = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await S()).getFoundationReleaseControls(context.userId));
const evidence = z.object({ terms: z.string().max(2000), pricing_policy: z.string().max(2000), verification: z.string().max(2000), delivery_workflow: z.string().max(2000), validation: z.string().max(2000) }).partial();
export const requestFoundationRelease = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ component: z.enum(COMPONENT_KEYS), dimension: z.enum(["commercial", "delivery"]), evidence, reason: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).requestFoundationRelease(context.userId, data));
export const decideFoundationRelease = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ component: z.enum(COMPONENT_KEYS), dimension: z.enum(["commercial", "delivery"]), action: z.enum(["approved", "withdrawn", "revoked"]), reason: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).decideFoundationRelease(context.userId, data));
