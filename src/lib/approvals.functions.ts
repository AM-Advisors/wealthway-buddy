import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { APPROVAL_TYPE_KEYS } from "@/lib/approval-types";

const id = z.object({ id: z.string().uuid() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const S = () => import("@/lib/approvals.server");
const input = {
  fundId: z.string().uuid(), type: z.enum(APPROVAL_TYPE_KEYS as [string, ...string[]]), title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(), amount: z.number().min(0).max(1e13).nullable().optional(), effectiveDate: date, dueDate: date,
  summary: z.string().max(4000).nullable().optional(), calculation: z.array(z.object({ label: z.string().max(120), value: z.string().max(200) })).max(40).optional(),
  documents: z.array(z.object({ name: z.string().max(200), path: z.string().max(500).nullable().optional() })).max(20).optional(),
  internalNotes: z.string().max(4000).nullable().optional(), taskId: z.string().uuid().nullable().optional(), serviceRequestId: z.string().uuid().nullable().optional(),
};

export const listFundApprovals = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fundId: z.string().uuid() }).parse(d)).handler(async ({ context, data }) => (await S()).listApprovals(context.userId, data.fundId));
export const listAllApprovals = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await S()).listAllApprovals(context.userId));
export const getApproval = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((d) => id.parse(d)).handler(async ({ context, data }) => (await S()).getApproval(context.userId, data.id));
export const createApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => z.object(input).parse(d)).handler(async ({ context, data }) => (await S()).createApproval(context.userId, data));
export const submitApprovalForReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => id.parse(d)).handler(async ({ context, data }) => (await S()).submitForReview(context.userId, data.id));
export const completeApprovalReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().max(1000).nullable().optional() }).parse(d)).handler(async ({ context, data }) => (await S()).completeReview(context.userId, data.id, data.reason));
export const decideApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), decision: z.enum(["APPROVE", "REQUEST_CHANGES"]), certified: z.boolean(), confirmText: z.string().max(300).nullable().optional(), comment: z.string().max(4000).nullable().optional(), version: z.number().int().min(1) }).parse(d))
  .handler(async ({ context, data }) => (await S()).decide(context.userId, data));
export const reviseApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ...input, id: z.string().uuid(), reason: z.string().trim().min(5).max(1000) }).parse(d)).handler(async ({ context, data }) => (await S()).revise(context.userId, data));
export const withdrawApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(1000) }).parse(d)).handler(async ({ context, data }) => (await S()).withdraw(context.userId, data.id, data.reason));
export const completeApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d) => id.parse(d)).handler(async ({ context, data }) => (await S()).completeApproval(context.userId, data.id));
