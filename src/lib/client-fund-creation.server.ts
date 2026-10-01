/**
 * Shared server-only creation of a client-requested Fund (closed to investors).
 * Used by the first-fund intake and the "Launch a new fund or SPV" request.
 */
const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "fund";

export async function createClientRequestedOffering(input: {
  clientId: string;
  actorId: string;
  fields: Record<string, unknown> & { name: string };
}): Promise<{ offeringId: string; sowId: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const base = slugify(input.fields.name);
  let slug = base;
  for (let i = 2; i < 40; i += 1) {
    const { data: clash } = await db.from("offerings").select("id").eq("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${i}`;
  }

  // A signed and approved statement of work with no fund attached can cover this one.
  const { data: sows } = await db
    .from("client_sows")
    .select("id, status, signed_on, signed_by, approval_status, offering_id")
    .eq("client_id", input.clientId)
    .eq("status", "active")
    .is("offering_id", null);
  const eligibleSow = ((sows ?? []) as any[]).find((s) => s.signed_on && s.signed_by && s.approval_status === "approved");

  const { seedFundFeeColumns } = await import("@/lib/fee-rates.server");
  const seededFees = await seedFundFeeColumns(supabaseAdmin, input.clientId);

  const { data: inserted, error } = await db
    .from("offerings")
    .insert({ ...seededFees, ...input.fields, client_id: input.clientId, slug, is_open: false })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const offeringId = String(inserted.id);

  const { safeCreateSnapshot } = await import("@/lib/commercial-pricing.server");
  await safeCreateSnapshot({ offeringId, clientId: input.clientId, actorId: input.actorId, source: "client_fund_request" });

  if (eligibleSow) {
    await db.from("client_sows").update({ offering_id: offeringId }).eq("id", eligibleSow.id).is("offering_id", null);
  }
  return { offeringId, sowId: eligibleSow ? String(eligibleSow.id) : null };
}
