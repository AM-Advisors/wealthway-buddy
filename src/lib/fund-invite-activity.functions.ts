import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/fund-invite-activity.server");

export const fundInviteActivityFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).fundInviteActivity(context.userId, data.offeringId));

/** Public by design: records that an invitation page was opened; returns nothing about it. */
export const noteInvitationOpenedFn = createServerFn({ method: "POST" })
  .validator(z.object({ reference: z.string().regex(/^[A-Za-z0-9]{16,64}$/) }).parse)
  .handler(async ({ data }) => { try { await (await srv()).noteInvitationOpened(data.reference); } catch { /* never blocks the page */ } return { ok: true }; });
