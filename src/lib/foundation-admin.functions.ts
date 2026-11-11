import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { AUTHORITY_ROLES, AUTHORITY_SCOPES, CLASSIFICATIONS, COMPONENT_KEYS, EXEMPTION_STATUSES, LEGAL_STRUCTURES } from "@/lib/foundation-admin-model";

const F = () => import("@/lib/foundation-admin.server");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const getFoundationWorkspace = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await F()).getFoundationWorkspace(context.userId, data.clientId));

export const setFoundationFlag = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ enabled: z.boolean(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await F()).setFoundationFlag(context.userId, data));

export const saveFoundationProfile = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    id: z.string().uuid().nullish(), clientId: z.string().uuid(), clientEntityId: z.string().uuid(),
    legalStructure: z.enum(keys(LEGAL_STRUCTURES)), legalStructureOther: z.string().max(200).nullish(),
    classification: z.enum(keys(CLASSIFICATIONS)), exemptionStatus: z.enum(keys(EXEMPTION_STATUSES)),
    exemptionEffectiveOn: day.nullish(), determinationLetterOn: day.nullish(),
    fiscalYearEndMonth: z.number().int().min(1).max(12).nullish(), mission: z.string().max(4000).nullish(),
    primaryContactPersonId: z.string().uuid().nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await F()).saveFoundationProfile(context.userId, data));

export const storeFoundationTaxId = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: z.string().uuid(), ein: z.string().max(20) }).parse(d))
  .handler(async ({ data, context }) => (await F()).storeFoundationTaxId(context.userId, data));

export const uploadFoundationDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    profileId: z.string().uuid(), kind: z.enum(["governing_document", "determination_letter", "authority_evidence", "supporting_evidence"]),
    title: z.string().trim().min(2).max(200), fileName: z.string().min(1).max(255), mimeType: z.string().max(200),
    base64: z.string().min(4).max(36_000_000), replacesId: z.string().uuid().nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await F()).uploadFoundationDocument(context.userId, data));

export const openFoundationDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await F()).openFoundationDocument(context.userId, data.documentId));

export const addFoundationAuthority = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    profileId: z.string().uuid(), personId: z.string().uuid(), role: z.enum(keys(AUTHORITY_ROLES)), title: z.string().max(200).nullish(),
    scopes: z.array(z.enum(keys(AUTHORITY_SCOPES))).max(8), evidenceDocumentId: z.string().uuid().nullish(),
    evidenceNote: z.string().max(1000).nullish(), effectiveOn: day.nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await F()).addFoundationAuthority(context.userId, data));

export const endFoundationAuthority = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ roleId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await F()).endFoundationAuthority(context.userId, data));

export const startFoundationHandoff = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ profileId: z.string().uuid(), components: z.array(z.enum(COMPONENT_KEYS)).max(6) }).parse(d))
  .handler(async ({ data, context }) => (await F()).startFoundationHandoff(context.userId, data));

export const getQuoteFoundationOptions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await F()).quoteFoundationOptions(context.userId, data.clientId));

export const getFoundationFlagState = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await F()).foundationFlagState(context.userId));
