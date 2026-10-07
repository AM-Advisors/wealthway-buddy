import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const fund = z.object({ fundId: z.string().uuid() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const party = z.enum(["HARMONIOUS_HANDLING", "CLIENT_APPROVAL_REQUIRED", "CLIENT_INFORMATION_REQUIRED", "WAITING_ON_INVESTOR", "WAITING_ON_THIRD_PARTY", "COMPLETED"]);
const category = z.enum(["ACCOUNTING", "NAV", "INVESTOR", "CAPITAL", "REPORTING", "TAX", "REGULATORY", "AUDIT", "ENTITY", "BANKING", "OTHER"]);

export const getCommandCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => fund.parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/fund-command-center.server")).commandCenter(context.userId, data.fundId));

export const getFundCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => fund.parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/fund-calendar.server")).listCalendar(context.userId, data.fundId));

export const getCalendarItemHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/fund-calendar.server")).calendarHistory(context.userId, data.id));

export const saveCalendarItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(), fundId: z.string().uuid(), title: z.string().trim().min(1).max(200), category, dueDate: date,
    startDate: date.nullable().optional(), responsibleParty: party, responsibleTeam: z.string().max(40).nullable().optional(),
    clientVisible: z.boolean(), status: z.enum(["SCHEDULED", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
    reportStatus: z.enum(["SCHEDULED", "PREPARING", "INTERNAL_REVIEW", "CLIENT_REVIEW", "FINAL", "RELEASED"]).nullable().optional(),
    notesInternal: z.string().max(2000).nullable().optional(), notesClient: z.string().max(2000).nullable().optional(),
    generateTask: z.boolean().optional(), taskLeadDays: z.number().int().min(0).max(120).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/fund-calendar.server")).saveItem(context.userId, data));

export const saveCalendarRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(), fundId: z.string().uuid(), cadence: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]),
    dueDayOffset: z.number().int().min(0).max(365), annualMonth: z.number().int().min(1).max(12).nullable().optional(),
    annualDay: z.number().int().min(1).max(31).nullable().optional(), generateTask: z.boolean(),
    taskLeadDays: z.number().int().min(0).max(120), active: z.boolean(), clientVisible: z.boolean(),
  }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/fund-calendar.server")).saveRule(context.userId, data));

export const generateFundSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => fund.parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/fund-calendar.server")).generateSchedule(context.userId, data.fundId));

export const generateFundDueTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => fund.parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/fund-calendar.server")).generateDueTasks(context.userId, data.fundId));

export const setFundAutoTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((d) => z.object({ fundId: z.string().uuid(), on: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/fund-calendar.server")).setAutoTasks(context.userId, data.fundId, data.on));
