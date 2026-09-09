import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-investor visibility inside a fund's diligence room: who may see the cap
 * table, and which restricted documents each person is allowed to open.
 * Every read and write is gated on the caller managing the fund.
 */

async function assertManager(supabase: any, offeringId: string) {
  const { data, error } = await supabase.rpc("can_manage_diligence", {
    _offering_id: offeringId,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: you do not manage this fund.");
}

export type PermissionInvestor = {
  user_id: string;
  name: string | null;
  email: string | null;
  cap_table_visible: boolean;
  note: string | null;
  allowed_document_ids: string[];
};

export type PermissionDocument = {
  id: string;
  title: string;
  category: string;
  file_name: string;
  visibility: "all" | "restricted";
};

export const listInvestorPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertManager(supabase, data.offeringId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [access, apps, documents, permissions] = await Promise.all([
      supabaseAdmin
        .from("investor_fund_access")
        .select("user_id")
        .eq("offering_id", data.offeringId),
      supabaseAdmin
        .from("investor_applications")
        .select("user_id")
        .eq("offering_id", data.offeringId),
      supabaseAdmin
        .from("diligence_documents")
        .select("id, title, category, file_name, visibility")
        .eq("offering_id", data.offeringId)
        .order("uploaded_at", { ascending: false }),
      supabaseAdmin
        .from("diligence_investor_permissions")
        .select("investor_user_id, cap_table_visible, note")
        .eq("offering_id", data.offeringId),
    ]);

    const userIds = [
      ...new Set([
        ...(access.data ?? []).map((r: any) => r.user_id as string),
        ...(apps.data ?? []).map((r: any) => r.user_id as string),
      ]),
    ];

    const [profiles, docAccess, managers] = await Promise.all([
      userIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("user_id, legal_name, email")
            .in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      supabaseAdmin
        .from("diligence_document_access")
        .select("document_id, investor_user_id")
        .eq("offering_id", data.offeringId),
      supabaseAdmin.from("fund_managers").select("user_id").eq("offering_id", data.offeringId),
    ]);

    const managerIds = new Set((managers.data ?? []).map((m: any) => m.user_id as string));
    const profileMap = new Map((profiles.data ?? []).map((p: any) => [p.user_id, p]));
    const permMap = new Map(
      (permissions.data ?? []).map((p: any) => [p.investor_user_id, p]),
    );

    const investors: PermissionInvestor[] = userIds
      .filter((id) => !managerIds.has(id))
      .map((id) => ({
        user_id: id,
        name: profileMap.get(id)?.legal_name ?? null,
        email: profileMap.get(id)?.email ?? null,
        cap_table_visible: permMap.get(id)?.cap_table_visible ?? true,
        note: permMap.get(id)?.note ?? null,
        allowed_document_ids: (docAccess.data ?? [])
          .filter((a: any) => a.investor_user_id === id)
          .map((a: any) => a.document_id as string),
      }))
      .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));

    return {
      investors,
      documents: (documents.data ?? []).map((d: any) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        file_name: d.file_name,
        visibility: d.visibility === "restricted" ? "restricted" : "all",
      })) as PermissionDocument[],
    };
  });

export const setCapTableVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        investorUserId: z.string().uuid(),
        visible: z.boolean(),
        note: z.string().trim().max(400).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, data.offeringId);

    const { error } = await supabase.from("diligence_investor_permissions").upsert(
      {
        offering_id: data.offeringId,
        investor_user_id: data.investorUserId,
        cap_table_visible: data.visible,
        note: data.note ?? null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "offering_id,investor_user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDocumentVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        documentId: z.string().uuid(),
        visibility: z.enum(["all", "restricted"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertManager(supabase, data.offeringId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("diligence_documents")
      .update({ visibility: data.visibility })
      .eq("id", data.documentId)
      .eq("offering_id", data.offeringId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDocumentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        documentId: z.string().uuid(),
        investorUserId: z.string().uuid(),
        allowed: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, data.offeringId);

    if (data.allowed) {
      const { error } = await supabase.from("diligence_document_access").upsert(
        {
          document_id: data.documentId,
          offering_id: data.offeringId,
          investor_user_id: data.investorUserId,
          granted_by: userId,
        },
        { onConflict: "document_id,investor_user_id" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("diligence_document_access")
        .delete()
        .eq("document_id", data.documentId)
        .eq("investor_user_id", data.investorUserId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
