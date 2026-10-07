import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { REQUEST_TYPE_KEYS, REQUEST_STATUSES } from "@/lib/service-request-types";

const S = () => import("@/lib/fund-requests.server");
const file = z.object({ name: z.string().min(1).max(200), base64: z.string().max(14_500_000), category: z.string().max(60).optional() });

export const listFundRequests = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fundId: z.string().uuid() }).parse(d)).handler(async ({ context, data }) => (await S()).listRequests(context.userId, data.fundId));
export const listAllFundRequests = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await S()).listAllRequests(context.userId));
export const getFundRequest = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ context, data }) => (await S()).getRequest(context.userId, data.id));
export const createFundRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    fundId: z.string().uuid(), type: z.enum(REQUEST_TYPE_KEYS as [string, ...string[]]), details: z.record(z.string(), z.string().max(4000)),
    priority: z.enum(["normal", "high", "urgent"]), urgentReason: z.string().max(1000).nullable().optional(), confirmDuplicate: z.boolean().optional(), files: z.array(file).max(5).optional(),
  }).parse(d)).handler(async ({ context, data }) => (await S()).createRequest(context.userId, data));
export const postFundRequestMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), body: z.string().max(8000), internal: z.boolean().optional(), file: file.nullable().optional() }).parse(d))
  .handler(async ({ context, data }) => (await S()).postMessage(context.userId, data));
export const updateFundRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(), status: z.enum(REQUEST_STATUSES).optional(), stage: z.number().int().min(0).max(20).optional(), assignedTo: z.string().uuid().nullable().optional(),
    assignedTeam: z.string().max(60).optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), clientNotes: z.string().max(2000).nullable().optional(),
    internalNotes: z.string().max(4000).nullable().optional(), reason: z.string().max(2000).nullable().optional(),
  }).parse(d)).handler(async ({ context, data }) => (await S()).updateRequest(context.userId, data));
export const cancelFundRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(1000) }).parse(d)).handler(async ({ context, data }) => (await S()).requestCancellation(context.userId, data.id, data.reason));
export const getFundRequestFileUrl = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ context, data }) => (await S()).fileUrl(context.userId, data.id));
