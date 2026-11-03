import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const text = (max: number) => z.string().trim().min(3).max(max);

export const getSoftwareIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ openOnly: z.boolean().default(true), issue: z.string().optional() }).default({ openOnly: true }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/software-issues.server")).listIssues(context.userId, data));

export const reportSoftwareIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    title: text(200), expected: text(4000), actual: text(4000), steps: text(4000), impact: text(2000),
    page: z.string().max(300).optional(), occurredAt: z.string().max(40).optional(), recordRef: z.string().max(300).optional(),
    owner: z.string().uuid(), retester: z.string().uuid(), priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/software-issues.server")).reportIssue(context.userId, data));

export const moveSoftwareIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    id: z.string().uuid(), to: z.enum(["reported", "in_progress", "fixed", "deployed", "retest_passed", "retest_failed", "resolved"]), note: z.string().max(4000).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/software-issues.server")).moveIssue(context.userId, data));
