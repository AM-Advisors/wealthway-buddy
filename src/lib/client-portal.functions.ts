import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Everything a client contact can see about their own engagement: the funds
 *  Harmonious administers for them, their statements of work and what those
 *  cover, their invoices and the payments already approved.
 *
 *  All reads run as the signed-in person, so the database only returns the
 *  client records they are attached to. Harmonious staff areas stay separate. */
export const getClientPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: memberships } = await context.supabase
      .from("client_users")
      .select("client_id, role")
      .eq("user_id", context.userId);

    const clientIds = [...new Set((memberships ?? []).map((m: any) => String(m.client_id)))];
    if (clientIds.length === 0) {
      return { clients: [], client: null } as const;
    }

    const { data: clientRows } = await context.supabase
      .from("clients")
      .select("id, name, status, entity_type, primary_contact_name, primary_contact_email")
      .in("id", clientIds)
      .order("name");

    const clients = clientRows ?? [];
    const selectedId =
      data.clientId && clientIds.includes(data.clientId)
        ? data.clientId
        : (clients[0]?.id as string | undefined) ?? clientIds[0]!;

    const [
      { data: client },
      { data: funds },
      { data: sows },
      { data: entitlements },
      { data: catalog },
      { data: invoices },
      { data: payments },
    ] = await Promise.all([
      context.supabase.from("clients").select("*").eq("id", selectedId).maybeSingle(),
      context.supabase
        .from("offerings")
        .select("id, name, slug, reg_type, is_open, target_raise_cents, legal_entity_name, created_at")
        .eq("client_id", selectedId)
        .order("name"),
      context.supabase
        .from("client_sows")
        .select("*")
        .eq("client_id", selectedId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("service_entitlements")
        .select("service_key, status, offering_id, sow_id, effective_date, termination_date, note")
        .eq("client_id", selectedId),
      context.supabase
        .from("service_catalog")
        .select("key, name, category, description")
        .eq("active", true)
        .order("sort_order"),
      context.supabase
        .from("invoices")
        .select("*")
        .eq("client_id", selectedId)
        .neq("status", "draft")
        .order("issue_date", { ascending: false })
        .limit(50),
      context.supabase
        .from("payment_instructions")
        .select(
          "id, offering_id, direction, purpose, amount_cents, beneficiary_name, status, invoice_id, requested_at, updated_at, authorization_reference",
        )
        .eq("client_id", selectedId)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    const catalogByKey = new Map((catalog ?? []).map((c: any) => [c.key, c]));
    const included = (entitlements ?? [])
      .filter((e: any) => e.status === "included")
      .map((e: any) => ({
        key: e.service_key as string,
        name: (catalogByKey.get(e.service_key) as any)?.name ?? e.service_key,
        category: (catalogByKey.get(e.service_key) as any)?.category ?? null,
        description: (catalogByKey.get(e.service_key) as any)?.description ?? null,
        offeringId: e.offering_id as string | null,
        sowId: e.sow_id as string | null,
        effectiveDate: e.effective_date as string | null,
        terminationDate: e.termination_date as string | null,
        note: e.note as string | null,
      }));

    const fundNameById = new Map((funds ?? []).map((f: any) => [f.id, f.name]));
    const today = new Date().toISOString().slice(0, 10);

    return {
      clients,
      client: client ?? null,
      role: (memberships ?? []).find((m: any) => m.client_id === selectedId)?.role ?? null,
      funds: funds ?? [],
      sows: sows ?? [],
      services: included,
      invoices: (invoices ?? []).map((inv: any) => ({
        ...inv,
        overdue: inv.status === "issued" && !!inv.due_date && inv.due_date < today,
      })),
      payments: (payments ?? []).map((p: any) => ({
        ...p,
        fundName: p.offering_id ? fundNameById.get(p.offering_id) ?? null : null,
      })),
    };
  });
