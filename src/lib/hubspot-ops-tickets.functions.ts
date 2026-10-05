import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/hubspot-ops-tickets.server");

export const getOpsTickets = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listOpsTickets(context));

export const importOpsTickets = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).importOpsTickets(context.userId));

export const resolveOpsTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(), action: z.enum(["create", "link", "dismiss"]),
    clientId: z.string().uuid().optional(), offeringId: z.string().uuid().optional(), name: z.string().max(180).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).resolveOpsTicket(context.userId, data));

export const searchFundsForTicket = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).searchFundsForLink(context.userId, data.q));
