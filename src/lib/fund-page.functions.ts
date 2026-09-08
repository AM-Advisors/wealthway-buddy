import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Reviewers are admins (all funds) and fund managers (their assigned funds). */
async function reviewerScope(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (roles.length === 0) throw new Error("Forbidden: reviewer access required.");

  const isAdmin = roles.includes("admin");
  let offeringIds: string[] = [];
  if (!isAdmin) {
    const { data: assignments } = await supabase
      .from("fund_managers")
      .select("offering_id")
      .eq("user_id", userId);
    offeringIds = (assignments ?? []).map((a: any) => a.offering_id as string);
  }
  return { isAdmin, offeringIds };
}

/** Funds the signed-in reviewer can open a page for. */
export const listFundPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin, offeringIds } = await reviewerScope(context.supabase, context.userId);

    let query = context.supabase
      .from("offerings")
      .select("id, slug, name, summary, reg_type, min_investment_cents, target_raise_cents, is_open")
      .order("name", { ascending: true });
    if (!isAdmin) query = query.in("id", offeringIds.length ? offeringIds : ["00000000-0000-0000-0000-000000000000"]);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { isAdmin, offerings: data ?? [] };
  });

/** Everything one fund page shows: description, documents and funding details. */
export const getFundPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin, offeringIds } = await reviewerScope(supabase, userId);
    if (!isAdmin && !offeringIds.includes(data.fundId)) {
      throw new Error("Forbidden: you do not manage this fund.");
    }

    const { data: offering, error } = await supabase
      .from("offerings")
      .select("*")
      .eq("id", data.fundId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!offering) throw new Error("That fund no longer exists.");

    const [{ data: documents }, { data: wireRow }, { data: applications }, { data: access }, { data: managers }] =
      await Promise.all([
        supabase
          .from("offering_documents")
          .select("id, title, doc_type, requires_signature, sort_order, body, created_at")
          .eq("offering_id", data.fundId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("offering_wire_instructions")
          .select("details, updated_at")
          .eq("offering_id", data.fundId)
          .maybeSingle(),
        supabase
          .from("investor_applications")
          .select("id, status, funding_status, commitment_cents")
          .eq("offering_id", data.fundId),
        supabase.from("investor_fund_access").select("id").eq("offering_id", data.fundId),
        supabase.from("fund_managers").select("user_id").eq("offering_id", data.fundId),
      ]);

    const apps = applications ?? [];
    const settledCents = apps
      .filter((a: any) => a.funding_status === "settled")
      .reduce((sum: number, a: any) => sum + Number(a.commitment_cents ?? 0), 0);
    const committedCents = apps.reduce((sum: number, a: any) => sum + Number(a.commitment_cents ?? 0), 0);

    return {
      isAdmin,
      offering,
      documents: (documents ?? []).map((d: any) => ({
        ...d,
        // Keep the payload light; the full text is fetched on demand.
        preview: typeof d.body === "string" ? d.body.slice(0, 400) : "",
        length: typeof d.body === "string" ? d.body.length : 0,
        body: undefined,
      })),
      wire: {
        details: ((wireRow as any)?.details ?? {}) as Record<string, string>,
        updatedAt: (wireRow as any)?.updated_at ?? null,
      },
      stats: {
        applications: apps.length,
        funded: apps.filter((a: any) => a.funding_status === "settled").length,
        investorsWithAccess: (access ?? []).length,
        managers: (managers ?? []).length,
        committedCents,
        settledCents,
      },
    };
  });

/** Full text of one fund document, for reading on the fund page. */
export const getFundDocumentBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin, offeringIds } = await reviewerScope(supabase, userId);

    const { data: doc, error } = await supabase
      .from("offering_documents")
      .select("id, offering_id, title, doc_type, body, requires_signature")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("That document no longer exists.");
    if (!isAdmin && !offeringIds.includes(doc.offering_id)) {
      throw new Error("Forbidden: you do not manage this fund.");
    }
    return { document: doc };
  });
