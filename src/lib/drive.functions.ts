import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOperations } from "@/lib/ops-access.functions";
import { DRIVE_ID_PATTERN } from "@/lib/drive-policy";

const folderUrl = (id?: string | null) => (id ? `https://drive.google.com/drive/folders/${id}` : null);
const linkSchema = z.string().regex(DRIVE_ID_PATTERN, "That is not a valid Drive folder ID.");

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export const getFundDriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { capabilities } = await requireOperations(context, "documents", "see");
    const s = await db();
    const [{ data: offering }, { data: mappings }] = await Promise.all([
      s.from("offerings").select("drive_sync_enabled").eq("id", data.offeringId).maybeSingle(),
      s.from("drive_folder_mappings").select("id,entity_kind,folder_id,folder_name,status,last_error,last_synced_at").eq("offering_id", data.offeringId),
    ]);
    const fund = (mappings ?? []).find((m: any) => m.entity_kind === "fund") ?? null;
    const investors = (mappings ?? []).filter((m: any) => m.entity_kind === "investor");
    return {
      enabled: Boolean(offering?.drive_sync_enabled),
      canSync: capabilities.includes("documents:prepare"),
      fund: fund ? { ...fund, url: folderUrl(fund.folder_id) } : null,
      investors: investors.map((m: any) => ({ id: m.id, name: m.folder_name, status: m.status })),
    };
  });

export const syncFundDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ offeringId: z.string().uuid(), linkFolderId: linkSchema.optional(), reason: z.string().max(300).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOperations(context, "documents", "prepare");
    const userId = (context as any).userId as string;
    const s = await db();
    await s.from("offerings").update({ drive_sync_enabled: true }).eq("id", data.offeringId);
    const drive = await import("@/lib/drive.server");
    const mapping = data.linkFolderId
      ? await drive.linkExistingFolder({ offeringId: data.offeringId, folderId: data.linkFolderId, reason: data.reason }, { userId })
      : await drive.ensureFundStructure(data.offeringId, { userId });
    return { status: String(mapping?.status ?? "needs_attention"), error: (mapping?.last_error as string | null) ?? null };
  });

/** Investor 360: one row per fund + profile, resolved from stored mappings only. */
export const getInvestorDrive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ investorUserId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { capabilities } = await requireOperations(context, "documents", "see");
    const s = await db();
    const { data: onboardings } = await s
      .from("investor_onboardings")
      .select("offering_id,investment_profile_id")
      .eq("investor_user_id", data.investorUserId)
      .not("investment_profile_id", "is", null);
    const pairs = new Map<string, { offeringId: string; profileId: string }>();
    for (const o of onboardings ?? []) pairs.set(`${o.offering_id}:${o.investment_profile_id}`, { offeringId: o.offering_id, profileId: o.investment_profile_id });
    const offeringIds = [...new Set([...pairs.values()].map((p) => p.offeringId))];
    const profileIds = [...new Set([...pairs.values()].map((p) => p.profileId))];
    const [{ data: offerings }, { data: profiles }, { data: mappings }] = await Promise.all([
      offeringIds.length ? s.from("offerings").select("id,name,drive_sync_enabled").in("id", offeringIds) : { data: [] },
      profileIds.length ? s.from("investment_profiles").select("id,display_label,legal_name,profile_type").in("id", profileIds) : { data: [] },
      offeringIds.length ? s.from("drive_folder_mappings").select("offering_id,investment_profile_id,entity_kind,folder_id,status,last_error").in("offering_id", offeringIds) : { data: [] },
    ]);
    const rows = [...pairs.values()].map(({ offeringId, profileId }) => {
      const m = (mappings ?? []).find((x: any) => x.entity_kind === "investor" && x.offering_id === offeringId && x.investment_profile_id === profileId);
      const fund = (mappings ?? []).find((x: any) => x.entity_kind === "fund" && x.offering_id === offeringId);
      const p = (profiles ?? []).find((x: any) => x.id === profileId);
      return {
        offeringId,
        profileId,
        fundName: (offerings ?? []).find((x: any) => x.id === offeringId)?.name ?? "Fund",
        profileLabel: p?.display_label ?? p?.legal_name ?? "Profile",
        fundReady: fund?.status === "active",
        status: (m?.status as string) ?? "not_created",
        error: (m?.last_error as string | null) ?? null,
        url: m?.status === "active" ? folderUrl(m.folder_id) : null,
      };
    });
    return { canSync: capabilities.includes("documents:prepare"), rows };
  });

export const syncInvestorDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ offeringId: z.string().uuid(), profileId: z.string().uuid(), linkFolderId: linkSchema.optional(), reason: z.string().max(300).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOperations(context, "documents", "prepare");
    const userId = (context as any).userId as string;
    const s = await db();
    // The profile must really be invested in this fund.
    const { data: ob } = await s.from("investor_onboardings").select("id").eq("offering_id", data.offeringId).eq("investment_profile_id", data.profileId).limit(1);
    if (!ob?.length) throw new Error("That profile has no investment in this fund.");
    const drive = await import("@/lib/drive.server");
    const mapping = data.linkFolderId
      ? await drive.linkExistingFolder({ offeringId: data.offeringId, profileId: data.profileId, folderId: data.linkFolderId, reason: data.reason }, { userId })
      : await drive.ensureInvestorStructure(data.offeringId, data.profileId, { userId });
    if (!mapping) return { status: "needs_attention", error: "Create the fund's Google Drive folder first." };
    return { status: String(mapping.status), error: (mapping.last_error as string | null) ?? null };
  });

export const listDriveExceptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ includeResolved: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { capabilities } = await requireOperations(context, "documents", "see");
    const s = await db();
    let q = s.from("drive_exceptions").select("id,issue_type,offering_id,investment_profile_id,detail,last_action,attempts,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(200);
    if (!data.includeResolved) q = q.eq("status", "open");
    const { data: rows } = await q;
    const oIds = [...new Set((rows ?? []).map((r: any) => r.offering_id).filter(Boolean))];
    const pIds = [...new Set((rows ?? []).map((r: any) => r.investment_profile_id).filter(Boolean))];
    const [{ data: offerings }, { data: profiles }] = await Promise.all([
      oIds.length ? s.from("offerings").select("id,name").in("id", oIds) : { data: [] },
      pIds.length ? s.from("investment_profiles").select("id,display_label,legal_name").in("id", pIds) : { data: [] },
    ]);
    return {
      canAct: capabilities.includes("documents:prepare"),
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        fundName: (offerings ?? []).find((o: any) => o.id === r.offering_id)?.name ?? null,
        profileLabel: (() => {
          const p = (profiles ?? []).find((x: any) => x.id === r.investment_profile_id);
          return p ? p.display_label ?? p.legal_name : null;
        })(),
      })),
    };
  });

export const retryDriveException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOperations(context, "documents", "prepare");
    const userId = (context as any).userId as string;
    const s = await db();
    const { data: ex } = await s.from("drive_exceptions").select("*").eq("id", data.id).eq("status", "open").maybeSingle();
    if (!ex) throw new Error("That exception is already resolved.");
    const drive = await import("@/lib/drive.server");
    if (ex.source_table === "document_signatures" && ex.source_id) {
      const res = await drive.fileExecutedSignature(ex.source_id);
      return { ok: res.filed > 0, message: (res as any).withheld ?? (res as any).error ?? null };
    }
    if (ex.investment_profile_id && ex.offering_id) {
      const m = await drive.ensureInvestorStructure(ex.offering_id, ex.investment_profile_id, { userId });
      return { ok: m?.status === "active", message: m?.last_error ?? null };
    }
    if (ex.offering_id) {
      const m = await drive.ensureFundStructure(ex.offering_id, { userId });
      return { ok: m.status === "active", message: m.last_error ?? null };
    }
    return { ok: false, message: "Nothing to retry." };
  });
