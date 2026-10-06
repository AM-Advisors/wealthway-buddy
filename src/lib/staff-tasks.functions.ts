import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const status = z.enum(["open", "in_progress", "blocked", "done", "cancelled"]);
const priority = z.enum(["low", "normal", "high", "urgent"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

export const getTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("@/lib/staff-tasks.server")).listTasks(context.userId));

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    title: z.string().trim().min(1).max(300), description: z.string().max(8000).nullable().optional(), priority,
    team: z.string().max(40).nullable().optional(), assignee: z.string().uuid().nullable().optional(), dueDate: date,
  }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-tasks.server")).createTask(context.userId, data));

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(), status: status.optional(), priority: priority.optional(),
    assignee: z.string().uuid().nullable().optional(), dueDate: date, note: z.string().max(4000).nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-tasks.server")).updateTask(context.userId, data));

export const getTaskHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-tasks.server")).taskHistory(context.userId, data.id));
