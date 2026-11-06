import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

/** Reference basics shown in every fund's deal room. Readable by that fund's investors, team and Harmonious staff. Read-only. */
export const getFundDealRoomBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let allowed = false;
    try { const { assertFund } = await import("@/lib/fund-tabs.server"); await assertFund(context.userId, data.offeringId); allowed = true; } catch { /* check investor below */ }
    if (!allowed) {
      const { data: ob } = await db.from("investor_onboardings").select("id").eq("offering_id", data.offeringId).eq("investor_user_id", context.userId).is("removed_at", null).limit(1);
      allowed = (ob ?? []).length > 0;
    }
    if (!allowed) throw new Error("You don't have access to this fund's deal room.");

    const [{ data: f }, { data: mgrs }, { data: docs }] = await Promise.all([
      db.from("offerings").select("name, legal_entity_name, fund_type, fund_type_other, entity_type, reg_type, state_formed, gp_entity_name, public_summary, summary, min_investment_cents, target_raise_cents, max_offering_cents, offering_open_date, offering_close_date, signatory_entity_name, signatory_title, fund_signatory_person_id").eq("id", data.offeringId).maybeSingle(),
      db.from("fund_managers").select("user_id").eq("offering_id", data.offeringId),
      db.from("offering_documents").select("id, title, doc_type").eq("offering_id", data.offeringId).is("removed_at", null).not("active_version", "is", null).order("sort_order"),
    ]);
    if (!f) throw new Error("Fund not found.");
    const ids = ((mgrs ?? []) as any[]).map((m) => m.user_id);
    const { data: profs } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
    const minimum = (f.min_investment_cents ?? null) as number | null;
    return {
      name: f.name as string,
      legalName: (f.legal_entity_name ?? null) as string | null,
      fundType: (f.fund_type === "other" ? f.fund_type_other : f.fund_type) as string | null,
      entityType: (f.entity_type ?? null) as string | null,
      regType: (f.reg_type ?? null) as string | null,
      stateFormed: (f.state_formed ?? null) as string | null,
      gp: (f.gp_entity_name ?? f.signatory_entity_name ?? null) as string | null,
      summary: (f.public_summary ?? f.summary ?? null) as string | null,
      minimumCents: minimum,
      targetRaiseCents: (f.target_raise_cents ?? f.max_offering_cents ?? null) as number | null,
      opens: (f.offering_open_date ?? null) as string | null,
      closes: (f.offering_close_date ?? null) as string | null,
      contacts: ((profs ?? []) as any[]).map((p) => ({ name: (p.legal_name ?? p.email ?? "Fund manager") as string, email: (p.email ?? null) as string | null, role: "Fund manager" })),
      documents: ((docs ?? []) as any[]).map((d) => ({ id: d.id as string, title: (d.title ?? d.doc_type ?? "Document") as string })),
    };
  });
