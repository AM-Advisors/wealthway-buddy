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
  .inputValidator((d) => z.object({ emails: z.array(z.string().max(320)).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    try { return await (await srv()).statusByEmail(context.userId, data.emails); } catch { return null; }
  });

export const revokeAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ...who, scope: z.enum(["global", "client", "offering"]), scopeId: z.string().uuid().nullish(), reason, archive: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).revoke(context.userId, data));

export const restoreAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ...who, stateId: z.string().uuid().nullish(), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).restore(context.userId, data));

export const cancelInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ table: inviteTable, id: z.string().uuid(), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).cancelInvite(context.userId, data.table, data.id, data.reason));

export const setTestDemoFlag = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.union([z.enum(["user", "client"]), inviteTable]), id: z.string().uuid(), value: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).setTestDemo(context.userId, data.kind, data.id, data.value));

export const setClientArchived = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid(), archive: z.boolean(), reason }).parse(d))
  .handler(async ({ data, context }) => (await srv()).archiveClient(context.userId, data.clientId, data.archive, data.reason));

export const getAccessHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ subjectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).accessHistory(context.userId, data.subjectId));
