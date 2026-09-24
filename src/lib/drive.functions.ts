import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOperations } from "@/lib/ops-access.functions";

const folderUrl = (id?: string | null) => (id ? `https://drive.google.com/drive/folders/${id}` : null);

export const getFundDriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { capabilities } = await requireOperations(context, "documents", "see");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: offering }, { data: mappings }, { data: events }] = await Promise.all([
      db.from("offerings").select("drive_sync_enabled").eq("id", data.offeringId).maybeSingle(),
      db.from("drive_folder_mappings").select("id,entity_kind,folder_id,folder_name,status,last_error,last_synced_at").eq("offering_id", data.offeringId),
      db.from("drive_sync_events").select("event,created_at,actor").eq("offering_id", data.offeringId).order("created_at", { ascending: false }).limit(8),
    ]);
    const fund = (mappings ?? []).find((m: any) => m.entity_kind === "fund") ?? null;
    const investors = (mappings ?? []).filter((m: any) => m.entity_kind === "investor");
    return {
      enabled: Boolean(offering?.drive_sync_enabled),
      canSync: capabilities.includes("documents:prepare"),
      fund: fund ? { ...fund, url: folderUrl(fund.folder_id) } : null,
      investors: investors.map((m: any) => ({ id: m.id, name: m.folder_name, status: m.status, error: m.last_error, url: folderUrl(m.folder_id) })),
      events: events ?? [],
    };
  });

export const syncFundDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ offeringId: z.string().uuid(), linkFolderId: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOperations(context, "documents", "prepare");
    const userId = (context as any).userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Syncing one fund by hand turns on automatic filing for that fund only.
    await (supabaseAdmin as any).from("offerings").update({ drive_sync_enabled: true }).eq("id", data.offeringId);
    const drive = await import("@/lib/drive.server");
    const mapping = data.linkFolderId
      ? await drive.linkExistingFundFolder(data.offeringId, data.linkFolderId, { userId })
      : await drive.ensureFundStructure(data.offeringId, { userId });
    return { status: mapping.status as string, error: (mapping.last_error as string | null) ?? null };
  });
