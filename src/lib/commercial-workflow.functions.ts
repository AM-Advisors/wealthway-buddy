import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "./require-auth";
export const getCommercialWorkflow = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await import("./commercial-workflow.server")).loadCommercialWorkflow(context));
export const qualifyCommercialInquiry = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ leadId: z.string().uuid(), contactId: z.string().uuid().optional(), ownerId: z.string().uuid() }))
  .handler(async ({ context, data }) => (await import("./commercial-workflow.server")).qualifyInquiry(context, data));