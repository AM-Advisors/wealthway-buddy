import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/person-accounts.server");

export const personAccountsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).personAccounts(context.userId, data.userId));

export const linkPersonAccountFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; email: string; note?: string | null }) => z.object({ userId: z.string().uuid(), email: z.string().trim().email(), note: z.string().max(500).nullish() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).linkPersonAccount(context.userId, data.userId, data.email, data.note ?? null));

export const unlinkPersonAccountFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).unlinkPersonAccount(context.userId, data.userId));

export const fundPersonAccountsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { offeringId: string }) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).fundPersonAccounts(context.userId, data.offeringId));
