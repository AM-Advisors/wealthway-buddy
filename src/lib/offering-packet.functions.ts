import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admins see every fund; fund managers only the funds assigned to them. */
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

async function assertFundAccess(supabase: any, userId: string, fundId: string) {
  const { isAdmin, offeringIds } = await reviewerScope(supabase, userId);
  if (!isAdmin && !offeringIds.includes(fundId)) {
    throw new Error("Forbidden: you do not manage this fund.");
  }
  return { isAdmin };
}

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Everything the private packet page shows for one fund. */
export const getOfferingPacket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFundAccess(supabase, userId, data.fundId);

    const { data: offering, error } = await supabase
      .from("offerings")
      .select("id, name, slug, summary, reg_type, min_investment_cents, target_raise_cents, is_open")
      .eq("id", data.fundId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!offering) throw new Error("That fund no longer exists.");

    const [{ data: documents }, { data: wireRow }, { data: links }] = await Promise.all([
      supabase
        .from("offering_documents")
        .select("id, title, doc_type, requires_signature, sort_order, updated_at")
        .eq("offering_id", data.fundId)
        .order("sort_order", { ascending: true }),
      supabase.rpc("get_wire_instructions", { p_offering_id: data.fundId }).maybeSingle(),
      supabase
        .from("offering_packet_links")
        .select(
          "id, token, label, include_wire, expires_at, revoked_at, download_count, last_downloaded_at, created_at",
        )
        .eq("offering_id", data.fundId)
        .order("created_at", { ascending: false }),
    ]);

    return {
      offering,
      documents: documents ?? [],
      wire: {
        details: ((wireRow as any)?.details ?? {}) as Record<string, string>,
        updatedAt: (wireRow as any)?.updated_at ?? null,
      },
      links: links ?? [],
    };
  });

/** Creates a shareable link that always serves the current packet PDF. */
export const createPacketLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: z.string().uuid(),
        label: z.string().trim().min(2, "Give the link a name").max(120),
        include_wire: z.boolean().default(true),
        expires_in_days: z.number().int().min(1).max(365).nullable().default(30),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFundAccess(supabase, userId, data.fundId);

    const expiresAt = data.expires_in_days
      ? new Date(Date.now() + data.expires_in_days * 86400000).toISOString()
      : null;

    const { data: row, error } = await supabase
      .from("offering_packet_links")
      .insert({
        offering_id: data.fundId,
        token: newToken(),
        label: data.label,
        include_wire: data.include_wire,
        expires_at: expiresAt,
        created_by: userId,
      })
      .select("id, token, label, include_wire, expires_at, revoked_at, download_count, last_downloaded_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { link: row };
  });

/** Turns a shared link off immediately. */
export const revokePacketLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ linkId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: link, error: readError } = await supabase
      .from("offering_packet_links")
      .select("id, offering_id")
      .eq("id", data.linkId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!link) throw new Error("That link no longer exists.");
    await assertFundAccess(supabase, userId, link.offering_id);

    const { error } = await supabase
      .from("offering_packet_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.linkId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
