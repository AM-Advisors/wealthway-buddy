/**
 * Funds → Migrations intake. Wix funds, Google Drive gaps and client requests queue here as
 * pending requests. Only a different staff member (or a Super Admin with a written reason)
 * approves; approval creates the fund as a closed draft and, for Wix, records each investor
 * as an earlier (off-platform) subscription that still needs second-person confirmation.
 * Nothing is sent, no money moves, no Wix data is changed.
 */
type Source = "wix" | "drive" | "client";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "fund";

export async function listRequests() {
  const db = await admin();
  const { data, error } = await db.from("fund_migration_requests").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const ids = [...new Set(((data ?? []) as any[]).flatMap((r) => [r.requested_by, r.decided_by]).filter(Boolean))];
  const clientIds = [...new Set(((data ?? []) as any[]).map((r) => r.client_id).filter(Boolean))];
  const [{ data: profs }, { data: clients }] = await Promise.all([
    ids.length ? db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] },
    clientIds.length ? db.from("clients").select("id, name").in("id", clientIds) : { data: [] },
  ]);
  const who = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
  const cname = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id as string, source: r.source as Source, sourceRef: r.source_ref as string | null, fundName: r.fund_name as string,
    clientName: r.client_id ? cname.get(r.client_id) ?? null : null, notes: r.notes as string | null, status: r.status as string,
    requestedBy: r.requested_by as string, requestedByName: who.get(r.requested_by) ?? "Unknown", createdAt: r.created_at as string,
    decidedByName: r.decided_by ? who.get(r.decided_by) ?? "Unknown" : null, decidedAt: r.decided_at as string | null,
    decisionNote: r.decision_note as string | null, offeringId: r.offering_id as string | null, importSummary: r.import_summary as any,
    details: (r.details ?? {}) as any,
  }));
}

export async function queueRequest(userId: string, input: { source: Source; sourceRef?: string | null | undefined; fundName: string; clientId?: string | null | undefined; notes?: string | null | undefined; details?: any }) {
  const db = await admin();
  const name = input.fundName.trim();
  if (!name) throw new Error("Add the fund name.");
  if (input.source === "wix") {
    const { data } = await db.from("wix_fund_staging").select("wix_id").eq("wix_id", input.sourceRef).maybeSingle();
    if (!data) throw new Error("That Wix fund wasn't found.");
  }
  const { data, error } = await db.from("fund_migration_requests").insert({
    source: input.source, source_ref: input.sourceRef ?? null, fund_name: name.slice(0, 200), client_id: input.clientId ?? null,
    notes: input.notes?.slice(0, 4000) ?? null, details: input.details ?? {}, requested_by: userId,
  }).select("id").single();
  if (error) throw new Error(error.code === "23505" ? "This fund is already in the Migrations queue." : error.message);
  return { id: data.id as string };
}

export async function declineRequest(userId: string, input: { id: string; note: string }) {
  if (!input.note.trim()) throw new Error("Give a reason for declining.");
  const db = await admin();
  const { error } = await db.from("fund_migration_requests").update({ status: "declined", decided_by: userId, decided_at: new Date().toISOString(), decision_note: input.note.trim() }).eq("id", input.id).eq("status", "pending");
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function approveRequest(userId: string, input: { id: string; note?: string | null | undefined }) {
  const db = await admin();
  const { data: r } = await db.from("fund_migration_requests").select("*").eq("id", input.id).maybeSingle();
  if (!r) throw new Error("Request not found.");
  if (r.status !== "pending") throw new Error("This request was already decided.");
  if (r.requested_by === userId) {
    const { data: sa } = await db.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!sa || !(input.note ?? "").trim()) throw new Error("A different staff member must approve this. Super Admins may approve their own with a written reason.");
  }

  // 1. Closed draft fund.
  let wixFund: any = null;
  if (r.source === "wix") {
    const { data } = await db.from("wix_fund_staging").select("wix_id, name, details").eq("wix_id", r.source_ref).maybeSingle();
    if (!data) throw new Error("The Wix fund is no longer in staging.");
    wixFund = data;
  }
  let offeringId: string;
  if (r.source === "client" && r.client_id) {
    const { createClientRequestedOffering } = await import("@/lib/client-fund-creation.server");
    offeringId = (await createClientRequestedOffering({ clientId: r.client_id, actorId: userId, fields: { name: r.fund_name } })).offeringId;
  } else {
    const base = slugify(r.fund_name);
    let slug = base;
    for (let i = 2; i < 40; i += 1) {
      const { data: clash } = await db.from("offerings").select("id").eq("slug", slug).maybeSingle();
      if (!clash) break;
      slug = `${base}-${i}`;
    }
    const regText = String(wixFund?.details?.offeringType ?? wixFund?.details?.typeOfRaise ?? "");
    const { data: ins, error } = await db.from("offerings").insert({ name: r.fund_name, slug, is_open: false, reg_type: /506\s*\(?c/i.test(regText) ? "506c" : "506b" }).select("id").single();
    if (error) throw new Error(error.message);
    offeringId = String(ins.id);
  }

  // 2. Wix investors → investor records + earlier subscriptions awaiting confirmation.
  const summary: { created: number; skipped: { name: string; reason: string }[] } = { created: 0, skipped: [] };
  if (wixFund) {
    const { data: invs } = await db.from("wix_investment_staging").select("wix_id, full_name, entity_name, email, committed_cents, received_cents, details").eq("wix_fund_id", wixFund.wix_id).limit(2000);
    const rec = await import("@/lib/investor-record.server");
    const prior = await import("@/lib/prior-subscription.server");
    for (const i of (invs ?? []) as any[]) {
      const d = i.details ?? {};
      const entityName = i.entity_name && i.entity_name !== "N/A" ? String(i.entity_name) : null;
      const label = entityName || i.full_name || "(unnamed)";
      try {
        const email = String(i.email || d.investorsEmail || "").trim();
        if (!email) throw new Error("No email in Wix");
        const commit = Number(i.committed_cents) || 0;
        if (commit <= 0) throw new Error("No committed amount");
        const parts = String(i.full_name || d.firstName || "").trim().split(/\s+/).filter(Boolean);
        const first = String(d.firstName || parts[0] || "Authorized");
        const last = String(d.lastName || parts.slice(1).join(" ") || "Signer");
        const trust = /\btrust\b/i.test(entityName ?? "");
        const created: any = await rec.createInvestor(userId, {
          offeringId,
          person: { firstName: first, lastName: last, email },
          profile: { type: entityName ? (trust ? "trust" : "entity") : "individual", ...(entityName && !trust ? { subType: "other_entity" } : {}), legalName: entityName || `${first} ${last}` } as any,
          investment: { amountCents: commit, commitmentCents: commit },
          allowPreLaunch: true, confirmedNew: true,
        } as any);
        const onboardingId: string | undefined = created?.onboardingId;
        if (!onboardingId) throw new Error("Investor record wasn't created");
        const signed = String(d._createdDate || new Date().toISOString()).slice(0, 10);
        await prior.recordPrior(userId, {
          offeringId, onboardingId, commitmentCents: commit, fundedCents: Math.min(commit, Number(i.received_cents) || 0),
          signedOn: signed, evidenceItemIds: [], reason: null,
        });
        summary.created += 1;
      } catch (e) {
        summary.skipped.push({ name: label, reason: (e as Error).message.slice(0, 200) });
      }
    }
  }

  const { error } = await db.from("fund_migration_requests").update({
    status: "approved", decided_by: userId, decided_at: new Date().toISOString(), decision_note: input.note?.trim() || null,
    offering_id: offeringId, import_summary: summary,
  }).eq("id", input.id).eq("status", "pending");
  if (error) throw new Error(error.message);
  return { offeringId, ...summary };
}
