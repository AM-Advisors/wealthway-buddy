/**
 * Signed-SOW hand-off: when a quote's SOW is signed, make sure the Client has a
 * draft (in-setup, never open/public) Fund linked to the SOW and notify
 * Operations via the Inbox (which also surfaces in the work queue).
 * Idempotent via sales_quotes.onboarded_at. Never moves money, files or launches.
 */
import { structureForFundType } from "@/lib/fund-setup-canonical";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function handoffSignedQuote(quoteId: string) {
  const db = await admin();
  const { data: q } = await db.from("sales_quotes").select("id, quote_number, title, client_id, sow_id, owner_user_id, status, onboarded_at, total_cents, deal_id").eq("id", quoteId).maybeSingle();
  if (!q || q.status !== "signed" || q.onboarded_at || !q.client_id || !q.sow_id) return;
  // Claim first so concurrent page loads can't create two funds.
  const { data: claimed } = await db.from("sales_quotes").update({ onboarded_at: new Date().toISOString() }).eq("id", q.id).is("onboarded_at", null).select("id");
  if (!claimed?.length) return;
  try {
    const [{ data: client }, { data: sow }, { data: links }] = await Promise.all([
      db.from("clients").select("id, legal_name").eq("id", q.client_id).maybeSingle(),
      db.from("client_sows").select("id, title, sow_type, fund_scope, offering_id").eq("id", q.sow_id).maybeSingle(),
      db.from("client_sow_funds").select("offering_id").eq("sow_id", q.sow_id).eq("status", "active"),
    ]);
    if (!client || !sow) throw new Error("Client or SOW not found.");
    let offeringId: string | null = sow.offering_id ?? (links ?? [])[0]?.offering_id ?? null;
    let created = false;
    if (!offeringId) {
      const fundType = sow.sow_type === "spv" ? "SPV" : "Venture Capital";
      const base = (sow.fund_scope?.trim() || `${client.legal_name} Fund`).slice(0, 140);
      const name = `${base} (Q-${q.quote_number})`;
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55) || "fund"}-${crypto.randomUUID().slice(0, 8)}`;
      const { seedFundFeeColumns } = await import("@/lib/fee-rates.server");
      const fees = await seedFundFeeColumns(db, client.id);
      // Preliminary 506(b) placeholder; Operations confirms the route during setup. Not a filing decision.
      const { data: off, error } = await db.from("offerings").insert({
        name, slug, client_id: client.id, fund_type: fundType, reg_type: "506b", is_open: false, public_page_enabled: false, ...fees,
      }).select("id").single();
      if (error || !off) throw new Error(error?.message ?? "Unable to create draft fund.");
      offeringId = off.id as string;
      created = true;
      await db.from("client_sow_funds").insert({ sow_id: sow.id, offering_id: offeringId, client_id: client.id, added_by: q.owner_user_id, reason: "Created from signed sales quote" });
      const { safeCreateSnapshot } = await import("@/lib/commercial-pricing.server");
      const { data: cfg } = await db.from("client_service_configurations").select("config").eq("client_id", client.id).is("superseded_at", null).maybeSingle();
      await safeCreateSnapshot({ offeringId, clientId: client.id, actorId: q.owner_user_id, source: "fund_setup", serviceConfig: cfg?.config ?? null });
      const { bootstrapFundSetup } = await import("@/lib/fund-setup.server");
      await bootstrapFundSetup(q.owner_user_id, { offeringId, clientId: client.id, structure: structureForFundType(fundType), displayName: name });
      await db.from("offering_audit_events").insert({
        offering_id: offeringId, actor_id: q.owner_user_id, event_type: "offering_created",
        changes: [{ field: "name", from: null, to: name }], summary: `Draft fund created from signed quote Q-${q.quote_number}`,
      });
    }
    await db.from("sales_quotes").update({ onboarded_offering_id: offeringId, onboarding_error: null }).eq("id", q.id);
    const total = `$${(Number(q.total_cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    const body = [
      `${client.legal_name} signed "${sow.title ?? q.title}" (quote Q-${q.quote_number}, ${total}).`,
      created ? "A draft fund was created in setup and linked to the SOW. Please confirm the fund type and regulatory route (506(b) is a placeholder) and begin onboarding."
        : "The SOW is already linked to an existing fund. Please begin onboarding.",
    ].join("\n\n");
    const { data: t } = await db.from("inbox_threads").insert({
      client_id: client.id, channel: "operations", rep_user_id: null, created_by: q.owner_user_id, started_side: "harmonious",
      subject: `New client signed: ${client.legal_name}`,
    }).select("id").single();
    if (t) await db.from("inbox_messages").insert({ thread_id: t.id, sender_id: q.owner_user_id, sender_side: "harmonious", body });
    await (await import("@/lib/email-flows.server")).onClientSigned(client.id, (q as any).deal_id ?? null);
    await db.from("sales_quote_events").insert({ quote_id: q.id, event: "handed_off", actor_id: null, note: created ? "Draft fund created; Operations notified" : "Operations notified" });
  } catch (e) {
    // Release the claim so the next load retries; record why.
    await db.from("sales_quotes").update({ onboarded_at: null, onboarding_error: String((e as Error).message).slice(0, 500) }).eq("id", q.id);
    console.error("sales handoff failed", q.id, e);
  }
}
