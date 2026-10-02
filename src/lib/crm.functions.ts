import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { DEAL_STAGES } from "@/lib/crm-model";

const scope = z.enum(["harmonious", "fund"]);
const uuid = z.string().uuid();
const opt = (s: z.ZodString) => s.optional().nullable();
const audience = z.object({ tags: z.array(z.string().max(60)).max(20).optional(), stages: z.array(z.enum(DEAL_STAGES)).optional() });
const srv = () => import("@/lib/crm.server");
const ctx = (c: any) => c.userId as string;

export const getCrmWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: z.enum(["harmonious", "fund", "all"]), offeringId: uuid.optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).crmWorkspace(ctx(context), data));

export const getContactDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contactId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await srv()).contactDetail(ctx(context), data.contactId));

export const saveCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(), scope, offering_id: uuid.nullable(),
    full_name: z.string().trim().min(1).max(200), email: opt(z.string().trim().email().max(254)), phone: opt(z.string().max(40)),
    organization: opt(z.string().max(200)), title: opt(z.string().max(120)), source: opt(z.string().max(120)), tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveContact(ctx(context), data));

export const setCrmConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contactId: uuid, consent: z.enum(["opted_in", "unknown", "unsubscribed"]), note: z.string().trim().min(3, "Say how consent was given.").max(500) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).setConsent(ctx(context), data));

export const archiveCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contactId: uuid, reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).archiveContact(ctx(context), data));

export const reassignCrmOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ table: z.enum(["crm_contacts", "crm_deals", "crm_campaigns"]), id: uuid, ownerUserId: uuid, reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).reassignOwner(ctx(context), data));

export const listCrmOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).staffOwners(ctx(context)));

export const logCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contactId: uuid, dealId: uuid.optional(), kind: z.enum(["note", "call", "meeting", "email_logged"]), summary: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).logNote(ctx(context), data));

export const saveCrmDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(), contactId: uuid, title: z.string().trim().min(1).max(200), stage: z.enum(DEAL_STAGES),
    amount_cents: z.number().int().min(0).nullable().optional(), expected_close: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), lost_reason: opt(z.string().max(500)),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveDeal(ctx(context), data));

export const previewCrmAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope, offering_id: uuid.nullable(), audience, ownerUserId: uuid.optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).previewAudience(ctx(context), data));

export const saveCrmCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid.optional(), scope, offering_id: uuid.nullable(), name: z.string().trim().min(1).max(200), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20000), audience }).parse(d))
  .handler(async ({ data, context }) => (await srv()).saveCampaign(ctx(context), data));

export const submitCrmCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => (await srv()).submitCampaign(ctx(context), data.id));

export const decideCrmCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, decision: z.enum(["approve", "decline"]), note: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).decideCampaign(ctx(context), data));

export const sendCrmCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, confirmCount: z.number().int().min(1) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).sendCampaign(ctx(context), data));

// ---------------------------------------------------------------- messaging with Harmonious

export const listSupportConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["manager", "investor"]).optional(), offeringId: uuid.optional(), staffView: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await srv()).listConversations(ctx(context), data));

export const getSupportConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => (await srv()).getConversation(ctx(context), data.id));

export const startSupportConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["manager", "investor"]), offeringId: uuid.optional(), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).startConversation(ctx(context), data));

export const replySupportConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, body: z.string().trim().min(1).max(5000), close: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).replyConversation(ctx(context), data));

// ---------------------------------------------------------------- one place for manager updates

export const getManagerUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid.optional(), limit: z.number().int().min(1).max(100).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await srv()).managerUpdates(ctx(context), data));

export const markManagerUpdatesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).markManagerUpdatesRead(ctx(context)));
