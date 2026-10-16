import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/billing-records.server");
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const note = z.string().trim().max(1000).nullable().optional();

export const clientServicesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clientId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).clientServices(context.userId, data.clientId));

export const saveClientServiceFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clientId: uuid, id: uuid.optional(), serviceKey: z.string().max(120), cadence: z.enum(["annual", "quarterly", "one_time"]), amountCents: z.number().int().min(0).max(1_000_000_000), startDate: date, cardAutopay: z.boolean(), offeringId: uuid.nullable().optional() }).parse)
  .handler(async ({ data, context }) => (await srv()).saveClientService(context.userId, data));

export const decideClientServiceFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, action: z.enum(["approve", "end", "decline"]), note }).parse)
  .handler(async ({ data, context }) => (await srv()).decideClientService(context.userId, data.id, data.action, data.note ?? null));

export const requestMenuSwitchFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clientId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).requestMenuSwitch(context.userId, data.clientId));

export const decideMenuSwitchFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ requestId: uuid, approve: z.boolean(), note }).parse)
  .handler(async ({ data, context }) => (await srv()).decideMenuSwitch(context.userId, data.requestId, data.approve, data.note ?? null));

export const fundMigrationPaymentsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).fundMigrationPayments(context.userId, data.offeringId));

export const recordMigrationPaymentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid, amountCents: z.number().int().min(0).max(10_000_000_000), paidOn: date, method: z.enum(["wire", "ach", "card", "check", "other"]), periodStart: date.nullable(), periodEnd: date.nullable(), serviceKeys: z.array(z.string().max(120)).max(40), note }).parse)
  .handler(async ({ data, context }) => (await srv()).recordMigrationPayment(context.userId, { ...data, note: data.note ?? null }));

export const decideMigrationPaymentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, confirm: z.boolean(), note }).parse)
  .handler(async ({ data, context }) => (await srv()).decideMigrationPayment(context.userId, data.id, data.confirm, data.note ?? null));

export const paymentRemindersFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).paymentReminders(context.userId));

export const sendPaymentReminderFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ recordId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).sendPaymentReminderNow(context.userId, data.recordId));

export const pauseRemindersFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ recordId: uuid, paused: z.boolean(), reason: note }).parse)
  .handler(async ({ data, context }) => (await srv()).setRemindersPaused(context.userId, data.recordId, data.paused, data.reason ?? null));

export const navGrantsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).navGrantsFor(context.userId, data.userId));

export const grantNavItemFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: uuid, url: z.string().max(300), reason: z.string().trim().min(3).max(500) }).parse)
  .handler(async ({ data, context }) => (await srv()).grantNavItem(context.userId, data.userId, data.url, data.reason));

export const revokeNavItemFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ grantId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).revokeNavItem(context.userId, data.grantId));
