import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const uuid = z.string().uuid();
const newPerson = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
});

export const getFundInitialContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/fund-initial-contact.server")).getInitialContact(context.userId, data.offeringId));

export const setFundInitialContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid, contactId: uuid.optional().nullable(), newPerson: newPerson.optional().nullable(), confirmSeparate: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/fund-initial-contact.server")).setInitialContact(context.userId, data));

export const clearFundInitialContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/fund-initial-contact.server")).clearInitialContact(context.userId, data.offeringId));
