import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { canViewCommercial } from "@/lib/commercial-pricing";
import { isReconciledFunding } from "@/lib/funding-status";

export type PipelineStage = "invited" | "started" | "signed" | "funded";

/**
 * Sales Overview: capital raised, commercial totals, investor pipeline and
 * recent sales activity. Read-only. Pipeline shows investor name, stage and
 * amounts only - never emails, tax, identity, KYC, bank or compliance data.
 * Funded = reconciled money only (funding-status.ts).
 */
export const getSalesPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: r } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const roles = ((r ?? []) as any[]).map((x) => String(x.role));
    if (!canViewCommercial(roles)) throw new Error("Forbidden: the Sales area is for Harmonious commercial staff.");
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

    const [funds, clients, onb, invs, snaps, reqs] = await Promise.all([
      db.from("offerings").select("id, name, client_id, created_at"),
      db.from("clients").select("id, legal_name, created_at"),
      db.from("investor_onboardings").select("id, offering_id, person_id, invitation_id, signature_id, funding_status, commitment_amount_cents, requested_amount_cents, funded_amount_cents, created_at, updated_at"),
      db.from("fund_invitations").select("id, offering_id, invited_name, status, intended_amount_cents, created_at"),
      db.from("fund_pricing_snapshots").select("offering_id, status, final_total_cents, created_at, superseded_at"),
      db.from("pricing_approval_requests").select("id, offering_id, status, created_at, decided_at"),
    ]);
    const onboardings = (onb.data ?? []) as any[];
    const personIds = [...new Set(onboardings.map((o) => o.person_id).filter(Boolean))];
    const people = personIds.length
      ? ((await db.from("persons").select("id, preferred_name, legal_first_name, legal_last_name").in("id", personIds)).data ?? []) as any[]
      : [];
    const personName = new Map(people.map((p) => [p.id, p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || "Unnamed investor"]));
    const fundRows = (funds.data ?? []) as any[];
    const fundName = new Map(fundRows.map((f) => [f.id, f.name]));
    const clientName = new Map(((clients.data ?? []) as any[]).map((c) => [c.id, c.legal_name]));
    const current = new Map(((snaps.data ?? []) as any[]).filter((s) => !s.superseded_at).map((s) => [s.offering_id, s]));

    const stageOf = (o: any): PipelineStage => (isReconciledFunding(o.funding_status) ? "funded" : o.signature_id ? "signed" : "started");
    const claimedInvites = new Set(onboardings.map((o) => o.invitation_id).filter(Boolean));
    const openInvites = ((invs.data ?? []) as any[]).filter((i) => !claimedInvites.has(i.id) && !["revoked", "expired", "declined"].includes(String(i.status)));

    const pipeline = [
      ...openInvites.map((i) => ({ id: `inv-${i.id}`, name: i.invited_name || "Invited investor", fundId: i.offering_id, stage: "invited" as PipelineStage, amountCents: i.intended_amount_cents ?? null, updatedAt: i.created_at })),
      ...onboardings.map((o) => ({ id: o.id, name: personName.get(o.person_id) ?? "Unnamed investor", fundId: o.offering_id, stage: stageOf(o), amountCents: o.commitment_amount_cents ?? o.requested_amount_cents ?? null, updatedAt: o.updated_at ?? o.created_at })),
    ].map((p) => ({ ...p, fundName: fundName.get(p.fundId) ?? "Unknown fund" }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

    const performance = fundRows.map((f) => {
      const rows = onboardings.filter((o) => o.offering_id === f.id);
      const funded = rows.filter((o) => isReconciledFunding(o.funding_status));
      const snap = current.get(f.id);
      return {
        id: f.id, name: f.name, clientName: clientName.get(f.client_id) ?? null,
        investors: rows.length + openInvites.filter((i) => i.offering_id === f.id).length,
        committedCents: rows.reduce((n, o) => n + Number(o.commitment_amount_cents ?? 0), 0),
        fundedCents: funded.reduce((n, o) => n + Number(o.funded_amount_cents ?? o.commitment_amount_cents ?? 0), 0),
        fundedInvestors: funded.length,
        pricingStatus: (snap?.status ?? "legacy_review") as string,
        feeCents: snap?.final_total_cents ?? null,
      };
    }).sort((a, b) => b.committedCents - a.committedCents || a.name.localeCompare(b.name));

    const activity = [
      ...((clients.data ?? []) as any[]).map((c) => ({ at: c.created_at, text: `New client: ${c.legal_name}` })),
      ...fundRows.map((f) => ({ at: f.created_at, text: `Fund created: ${f.name}` })),
      ...((snaps.data ?? []) as any[]).map((s) => ({ at: s.created_at, text: `Pricing recorded for ${fundName.get(s.offering_id) ?? "a fund"}` })),
      ...((reqs.data ?? []) as any[]).flatMap((q) => [
        { at: q.created_at, text: `Discount sent for approval: ${fundName.get(q.offering_id) ?? "a fund"}` },
        ...(q.decided_at ? [{ at: q.decided_at, text: `Discount ${q.status}: ${fundName.get(q.offering_id) ?? "a fund"}` }] : []),
      ]),
      ...onboardings.filter((o) => isReconciledFunding(o.funding_status)).map((o) => ({ at: o.updated_at, text: `Funding reconciled: ${personName.get(o.person_id) ?? "Investor"} in ${fundName.get(o.offering_id) ?? "a fund"}` })),
    ].filter((a) => a.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 25);

    const count = (s: PipelineStage) => pipeline.filter((p) => p.stage === s).length;
    return {
      totals: {
        funds: fundRows.length,
        committedCents: performance.reduce((n, f) => n + f.committedCents, 0),
        fundedCents: performance.reduce((n, f) => n + f.fundedCents, 0),
        feeCents: performance.reduce((n, f) => n + Number(f.feeCents ?? 0), 0),
        pendingApprovals: ((reqs.data ?? []) as any[]).filter((q) => q.status === "pending").length,
      },
      stages: { invited: count("invited"), started: count("started"), signed: count("signed"), funded: count("funded") },
      performance, pipeline: pipeline.slice(0, 100), activity,
    };
  });
