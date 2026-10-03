import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const getEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("@/lib/staff-directory.server")).listEmployees(context.userId));

export const getEmployeeActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-directory.server")).employeeActivity(context.userId, data.userId));

export const assignManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), managerId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-directory.server")).setManager(context.userId, data.userId, data.managerId));

export const recordStaffActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["page", "action"]), path: z.string().max(300), label: z.string().max(200).nullable() }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-directory.server")).logActivity(context.userId, data.kind, data.path, data.label));

export const getTeamDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ team: z.enum(["operations", "finance", "compliance", "leadership"]) }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-directory.server")).teamDashboard(context.userId, data.team));
