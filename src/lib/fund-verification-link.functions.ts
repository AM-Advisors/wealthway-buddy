import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/fund-verification-link.server");
const uuid = z.string().uuid();

export const fundLinkSessionsFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await srv()).fundLinkSessions(context.userId, data.offeringId));

export const addLinkSessionInvestorFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid, sessionId: uuid, profileType: z.enum(["individual", "trust", "entity"]), legalName: z.string().trim().max(200).nullable().optional() }).parse)
  .handler(async ({ data, context }) => (await srv()).addLinkSessionInvestor(context.userId, data));

export const setLinkSessionDismissedFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: uuid, sessionId: uuid, dismissed: z.boolean(), reason: z.string().trim().min(3).max(500) }).parse)
  .handler(async ({ data, context }) => (await srv()).setLinkSessionDismissed(context.userId, data));
