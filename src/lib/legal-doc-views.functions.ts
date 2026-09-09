import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const offeringInput = (data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data);

async function canManage(supabase: any, userId: string, offeringId: string) {
  const { data: admin } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return true;
  const { data } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Manager/admin report: which investors opened each of the fund's legal
 * documents, how often, and who has not opened anything yet.
 */
export const getLegalDocumentReadership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, userId, data.offering_id))) {
      throw new Error("You do not have permission to see this fund's reading activity.");
    }

    const [{ data: documents }, { data: events }, { data: applications }, { data: access }] =
      await Promise.all([
        supabase
          .from("offering_documents")
          .select("id, title, doc_type, requires_signature, sort_order")
          .eq("offering_id", data.offering_id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("diligence_activity")
          .select("actor_id, actor_name, actor_email, event_type, metadata, created_at")
          .eq("offering_id", data.offering_id)
          .in("event_type", ["legal_document_viewed", "legal_document_downloaded"])
          .order("created_at", { ascending: true })
          .limit(5000),
        supabase
          .from("investor_applications")
          .select("user_id")
          .eq("offering_id", data.offering_id),
        supabase
          .from("investor_fund_access")
          .select("user_id")
          .eq("offering_id", data.offering_id),
      ]);

    // Everyone on the fund team is flagged so their own opens don't read as investor interest.
    const [{ data: managerRows }, { data: adminRows }] = await Promise.all([
      supabase.from("fund_managers").select("user_id").eq("offering_id", data.offering_id),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]);
    const teamIds = new Set<string>([
      ...((managerRows ?? []) as any[]).map((r) => r.user_id as string),
      ...((adminRows ?? []) as any[]).map((r) => r.user_id as string),
    ]);

    const investorIds = Array.from(
      new Set(
        [...((applications ?? []) as any[]), ...((access ?? []) as any[])]
          .map((r) => r.user_id as string)
          .filter((id) => !teamIds.has(id)),
      ),
    );

    const { data: profiles } = investorIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, legal_name, email")
          .in("user_id", investorIds)
      : ({ data: [] } as any);
    const profileById = new Map<string, any>(
      ((profiles ?? []) as any[]).map((p) => [p.user_id as string, p]),
    );

    type Reader = {
      actor_id: string;
      name: string | null;
      email: string | null;
      isTeam: boolean;
      opens: number;
      downloads: number;
      firstOpened: string;
      lastOpened: string;
    };

    const byDocument = new Map<string, Map<string, Reader>>();
    const seenByInvestor = new Map<string, string>(); // actor -> last activity

    for (const e of (events ?? []) as any[]) {
      const meta = (e.metadata ?? {}) as any;
      const docId = meta.offering_document_id as string | undefined;
      if (!docId) continue;
      const readers = byDocument.get(docId) ?? new Map<string, Reader>();
      byDocument.set(docId, readers);

      const existing = readers.get(e.actor_id) ?? {
        actor_id: e.actor_id as string,
        name: (e.actor_name as string) ?? profileById.get(e.actor_id)?.legal_name ?? null,
        email: (e.actor_email as string) ?? profileById.get(e.actor_id)?.email ?? null,
        isTeam: teamIds.has(e.actor_id),
        opens: 0,
        downloads: 0,
        firstOpened: e.created_at as string,
        lastOpened: e.created_at as string,
      };
      existing.lastOpened = e.created_at as string;
      if (e.event_type === "legal_document_downloaded") existing.downloads += 1;
      else existing.opens += 1;
      readers.set(e.actor_id, existing);

      if (!teamIds.has(e.actor_id)) seenByInvestor.set(e.actor_id, e.created_at as string);
    }

    const documentRows = ((documents ?? []) as any[]).map((doc) => {
      const readers = [...(byDocument.get(doc.id) ?? new Map<string, Reader>()).values()].sort(
        (a, b) => b.lastOpened.localeCompare(a.lastOpened),
      );
      const investors = readers.filter((r) => !r.isTeam);
      return {
        id: doc.id as string,
        title: doc.title as string,
        doc_type: (doc.doc_type as string) ?? "document",
        requires_signature: Boolean(doc.requires_signature),
        readers,
        investorCount: investors.length,
        investorOpens: investors.reduce((sum, r) => sum + r.opens + r.downloads, 0),
        lastInvestorAt: investors[0]?.lastOpened ?? null,
      };
    });

    const neverOpened = investorIds
      .filter((id) => !seenByInvestor.has(id))
      .map((id) => ({
        user_id: id,
        name: (profileById.get(id)?.legal_name as string) ?? null,
        email: (profileById.get(id)?.email as string) ?? null,
      }));

    return {
      documents: documentRows,
      totalDocuments: documentRows.length,
      investorCount: investorIds.length,
      readerCount: seenByInvestor.size,
      neverOpened,
    };
  });
