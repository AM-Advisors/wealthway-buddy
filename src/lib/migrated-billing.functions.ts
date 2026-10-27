import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const M = () => import("@/lib/migrated-billing.server");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lines = z.array(z.object({ label: z.string().trim().min(1).max(200), amountCents: z.number().int().min(1).max(1e11) })).min(1).max(50);

export const getMigratedBilling = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await M()).overview(context.userId, data.fundId));
export const recordMigratedInvoice = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ fundId: z.string().uuid(), lines, issueDate: date, paidOn: date.nullish(), reference: z.string().max(120).nullish(), note: z.string().max(500).nullish(), sowId: z.string().uuid().nullish() }).parse(d))
  .handler(async ({ data, context }) => (await M()).recordInvoice(context.userId, data));
export const recordMigratedPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ invoiceId: z.string().uuid(), paidOn: date, reference: z.string().max(120).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await M()).recordPayment(context.userId, data));
export const generateMigratedSow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ fundId: z.string().uuid(), title: z.string().max(200), lines, invoiceId: z.string().uuid().nullish() }).parse(d))
  .handler(async ({ data, context }) => (await M()).generateSow(context.userId, data));
export const uploadMigratedSow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ fundId: z.string().uuid(), title: z.string().max(200), signedOn: date, signedBy: z.string().max(200).nullish(), fileName: z.string().max(255), base64: z.string().max(30_000_000), invoiceId: z.string().uuid().nullish() }).parse(d))
  .handler(async ({ data, context }) => (await M()).uploadSow(context.userId, data));
export const pushMigratedToCommissions = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ invoiceId: z.string().uuid(), repUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await M()).pushToCommissions(context.userId, data));
