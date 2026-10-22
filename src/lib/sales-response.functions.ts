import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "./require-auth";
import { responseDraft, responseKind } from "./sales-response-model";
const record = z.object({ kind: responseKind, id: z.string().uuid() });
const S = () => import("./sales-response.server");
export const getSalesResponses = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => record.parse(d)).handler(async ({ data, context }) => (await S()).staffResponses(context.userId, data.kind, data.id));
export const saveSalesResponseInstructions = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => record.extend({ instructions: z.string().trim().max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await S()).saveInstructions(context.userId, data.kind, data.id, data.instructions));
export const sendSalesResponse = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => record.merge(responseDraft).parse(d))
  .handler(async ({ data, context }) => (await S()).sendResponse(context.userId, data.kind, data.id, data));