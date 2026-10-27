import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
export const getFundHandoffs = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid() }).parse)
  .handler(async ({ context, data }) => (await import("./sales-operations-handoff.server")).loadFundHandoffs(context, data.fundId));
export const saveFundHandoff = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid(), quoteId: z.string().uuid(), action: z.enum(["assign", "acknowledge", "complete"]), ownerId: z.string().uuid().optional(), dueDate: z.iso.date().optional() }).parse)
  .handler(async ({ context, data }) => (await import("./sales-operations-handoff.server")).saveFundHandoff(context, data));