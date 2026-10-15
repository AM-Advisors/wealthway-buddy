import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const S = () => import("@/lib/migration-requests.server");
const ops = async (context: any, action: "see" | "prepare" | "approve") => {
  const { requireOperations } = await import("@/lib/ops-access.functions");
  await requireOperations(context, "funds", action);
};

export const listMigrationRequests = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => { await ops(context, "see"); return (await S()).listRequests(); });

export const queueMigrationRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ source: z.enum(["wix", "drive"]), sourceRef: z.string().min(1).max(200), fundName: z.string().min(1).max(200), notes: z.string().max(4000).nullish() }).parse(d))
  .handler(async ({ data, context }) => { await ops(context, "prepare"); return (await S()).queueRequest(context.userId, data); });

/** Clients ask Harmonious to bring over a fund that already closed or onboarded investors elsewhere. */
export const requestClientMigration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), fundName: z.string().min(1).max(200), notes: z.string().max(4000).nullish(), recordsLink: z.string().max(500).nullish(), investorCount: z.number().int().min(0).max(100000).nullish() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: m } = await (context as any).supabase.from("client_users").select("client_id").eq("user_id", context.userId).eq("client_id", data.clientId).maybeSingle();
    if (!m) throw new Error("You aren't a member of this organisation.");
    return (await S()).queueRequest(context.userId, { source: "client", sourceRef: null, fundName: data.fundName, clientId: data.clientId, notes: data.notes ?? null, details: { recordsLink: data.recordsLink ?? null, investorCount: data.investorCount ?? null } });
  });

export const approveMigrationRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), note: z.string().max(2000).nullish() }).parse(d))
  .handler(async ({ data, context }) => { await ops(context, "approve"); return (await S()).approveRequest(context.userId, data); });

export const declineMigrationRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), note: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => { await ops(context, "approve"); return (await S()).declineRequest(context.userId, data); });
