import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/user-access.server");
const reason = z.string().trim().min(3, "Add a reason.").max(500);
const who = { userId: z.string().uuid().nullish(), email: z.string().email().nullish() };
const inviteTable = z.enum(["staff_invitations", "client_invitations", "fund_invitations"]);

export const getPeopleDirectory = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).directory(context.userId));

export const getAccessStatusByEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ emails: z.array(z.string().max(320)).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    try { return await (await srv()).statusByEmail(context.userId, data.emails); } catch { return null; }
  });

export const revokeAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ ...who, scope: z.enum(["global", "client", "offering"]), scopeId: z.string().uuid().nullish(), reason, archive: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).revoke(context.userId, data));

export const restoreAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ ...who, stateId: z.string().uuid().nullish(), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).restore(context.userId, data));

export const cancelInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ table: inviteTable, id: z.string().uuid(), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).cancelInvite(context.userId, data.table, data.id, data.reason));

export const resendInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ table: inviteTable, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).resendInvite(context.userId, data.table, data.id));

export const sendPasswordReset = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).resetUserPassword(context.userId, data.userId));

export const createInviteLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).copyInviteLink(context.userId, data.userId));

export const setTestDemoFlag = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ kind: z.union([z.enum(["user", "client"]), inviteTable]), id: z.string().uuid(), value: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).setTestDemo(context.userId, data.kind, data.id, data.value));

export const setClientArchived = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ clientId: z.string().uuid(), archive: z.boolean(), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).archiveClient(context.userId, data.clientId, data.archive, data.reason));

export const getAccessHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ subjectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).accessHistory(context.userId, data.subjectId));

export const getPersonActivity = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ userId: z.string().uuid(), before: z.string().datetime().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).personActivity(context.userId, data.userId, data));

export const getUserInsights = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ email: z.string().trim().email().max(320) }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/user-insights.server")).personInsights(context.userId, data.email));

export const getInvitationInsight = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), source: z.enum(["staff_invitations", "client_invitations", "fund_invitations", "client_contacts"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await (await srv()).requireAccessViewer(context.userId);
    const { data: row, error } = await db.from(data.source).select("email").eq("id", data.id).maybeSingle();
    if (error || !row) throw new Error("Invitation not found.");
    return { email: String(row.email), name: "" };
  });
