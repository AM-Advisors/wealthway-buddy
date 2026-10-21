import { invoiceRateLines, invoiceRateCheck } from "@/lib/invoice-pricing";

const rows = (result: any) => {
  if (result.error) throw new Error("Invoice pricing couldn't be loaded. Please retry.");
  return result.data ?? [];
};

/** Called only after the invoice endpoint checks existing staff authority. */
export async function collectInvoiceRates(db: any, data: { clientId: string; periodStart: string; periodEnd: string; offeringId?: string | null; sowId?: string | null }) {
  const [pricing, entitlements, sows, versions, billed] = await Promise.all([
    db.from("client_pricing").select("*").eq("client_id", data.clientId),
    db.from("service_entitlements").select("*").eq("client_id", data.clientId),
    db.from("client_sows").select("*").eq("client_id", data.clientId),
    db.from("pricing_versions").select("id").eq("status", "published").lte("effective_date", data.periodStart).order("effective_date", { ascending: false }).limit(1),
    db.from("invoice_lines").select("source_ref, invoices!inner(client_id)").eq("invoices.client_id", data.clientId).not("source_ref", "is", null),
  ]);
  const prices = rows(pricing); const scopes = rows(entitlements);
  const approvers = [...new Set(prices.map((p: any) => p.approved_by).filter(Boolean))];
  const fundIds = [...new Set([data.offeringId, ...scopes.map((e: any) => e.offering_id)].filter(Boolean))];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  if (data.offeringId) {
    const funds = rows(await db.from("offerings").select("id").eq("id", data.offeringId).eq("client_id", data.clientId));
    if (!funds.length) throw new Error("Choose a fund belonging to this client.");
  }
  const [catalog, roles, snapshots, schedules] = await Promise.all([
    rows(versions)[0] ? db.from("pricing_items").select("*").eq("version_id", rows(versions)[0].id) : { data: [] },
    approvers.length ? db.from("user_roles").select("user_id, role").in("user_id", approvers) : { data: [] },
    fundIds.length ? admin.from("fund_pricing_snapshots").select("*").in("offering_id", fundIds).eq("client_id", data.clientId).is("superseded_at", null) : { data: [] },
    admin.from("invoice_schedules").select("*").eq("client_id", data.clientId),
  ]);
  const snaps = rows(snapshots);
  const snapshotLines = snaps.length ? rows(await admin.from("fund_pricing_snapshot_lines").select("*").in("snapshot_id", snaps.map((s: any) => s.id))) : [];
  return invoiceRateLines({ ...data, pricing: prices, entitlements: scopes, sows: rows(sows), catalog: rows(catalog),
    snapshots: snaps, snapshotLines, schedules: rows(schedules), approverRoles: rows(roles), billedRefs: rows(billed).map((l: any) => l.source_ref) });
}

export async function checkInvoiceRates(db: any, invoiceId: string, clientId: string) {
  const lines = rows(await db.from("invoice_lines").select("*").eq("invoice_id", invoiceId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const [pricing, sows, schedules, snapshots] = await Promise.all([
    db.from("client_pricing").select("*").eq("client_id", clientId),
    db.from("client_sows").select("*").eq("client_id", clientId),
    admin.from("invoice_schedules").select("*").eq("client_id", clientId),
    admin.from("fund_pricing_snapshots").select("id").eq("client_id", clientId),
  ]);
  const snapIds = rows(snapshots).map((s: any) => s.id);
  const frozen = snapIds.length ? rows(await admin.from("fund_pricing_snapshot_lines").select("*").in("snapshot_id", snapIds)) : [];
  const items = lines.filter((l: any) => l.source !== "expense").map((l: any) => {
    const [kind, id, index] = String(l.source_ref ?? "").split(":");
    let cents: number | null = null;
    if (kind === "schedule") {
      const amount = rows(schedules).find((s: any) => s.id === id)?.amount_cents;
      cents = amount == null ? null : Number(amount) / Number(l.quantity ?? 1);
    }
    else if (kind === "snapshot") cents = frozen.find((s: any) => s.id === id)?.final_cents ?? null;
    else if (kind === "sow") {
      const sow = rows(sows).find((s: any) => s.id === id);
      const term = sow?.generated_lines?.[Number(index)];
      if (term) cents = Number(term.unit_cents ?? Number(term.amount_cents) / Number(term.quantity ?? 1));
    } else if (kind === "card") {
      cents = null;
    } else if (l.source === "fund_fee" && l.offering_id) {
      // Same application override and fund columns used on the investment balance page.
      cents = null;
    } else if (l.pricing_id) {
      const price = rows(pricing).find((p: any) => p.id === l.pricing_id);
      if (price) cents = Number(price.contracted_cents ?? price.standard_cents);
    }
    return { line: l, cents };
  });
  const checks = [];
  for (const { line, cents: resolved } of items) {
    let cents = resolved;
    if (String(line.source_ref ?? "").startsWith("card:")) {
      const itemId = String(line.source_ref).split(":")[1];
      const item = rows(await db.from("pricing_items").select("amount_cents").eq("id", itemId))[0];
      if (item) cents = Number(item.amount_cents);
    }
    if (line.source === "fund_fee" && line.offering_id) {
      const fund = rows(await db.from("offerings").select("wire_fee_cents, closing_cost_cents, share_price_cents")
        .eq("id", line.offering_id).eq("client_id", clientId))[0];
      if (fund && line.service_key === "closing_cost") cents = fund.closing_cost_cents;
      if (fund && line.service_key === "wire_fee") {
        const applicationId = String(line.source_ref ?? "").split(":")[1];
        const app = rows(await db.from("investor_applications").select("wire_fee_cents").eq("id", applicationId).eq("offering_id", line.offering_id))[0];
        if (app) cents = app.wire_fee_cents ?? fund.wire_fee_cents;
      }
      if (fund && line.service_key === "subscription") cents = Number(fund.share_price_cents) > 0 ? Number(fund.share_price_cents) : Number(line.unit_cents);
    }
    checks.push(invoiceRateCheck(line, cents === null || cents === undefined ? null : Number(cents)));
  }
  return { items: checks, varianceCents: checks.reduce((sum, i) => sum + Math.max(0, i.varianceCents), 0) };
}