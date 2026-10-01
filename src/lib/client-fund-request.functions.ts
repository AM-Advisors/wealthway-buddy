import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FundRequest } from "@/lib/fund-request-model";

const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];
const MAIN_CONTACT_ROLES = ["client_gp", "client_signatory", "client_finance", "client_legal", "client_compliance"];
const TEAM_EMAIL = "operations@harmonious.co";
const OPS_SITE = "https://ops.harmonious.co";
const KIND = "fund_request_v2";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** The caller's client memberships, re-read every call. */
async function memberships(context: any) {
  const { data } = await context.supabase
    .from("client_users")
    .select("client_id, client_role, can_approve")
    .eq("user_id", context.userId);
  return (data ?? []) as { client_id: string; client_role: string | null; can_approve: boolean | null }[];
}

async function requireMember(context: any, clientId: string, needSubmit = false) {
  const m = (await memberships(context)).find((r) => String(r.client_id) === clientId);
  if (!m) throw new Error("You aren't a member of this organisation.");
  if (needSubmit && !(m.can_approve || MAIN_CONTACT_ROLES.includes(String(m.client_role)))) {
    throw new Error("Only this organisation's main contacts can send a new fund request.");
  }
  return m;
}

const requestSchema = z.record(z.string(), z.any());

/** Create or update a draft request (kept in client_fund_intakes as status request_draft). */
export const saveFundRequestDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), draftId: z.string().uuid().nullable().optional(), request: requestSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireMember(context, data.clientId);
    const db = await admin();
    const details = { ...data.request, _kind: KIND };
    if (data.draftId) {
      const { data: row } = await db.from("client_fund_intakes").select("id, client_id, status").eq("id", data.draftId).maybeSingle();
      if (!row || String(row.client_id) !== data.clientId || row.status !== "request_draft") throw new Error("Draft not found.");
      await db.from("client_fund_intakes").update({ details }).eq("id", data.draftId);
      return { id: data.draftId };
    }
    const { data: ins, error } = await db
      .from("client_fund_intakes")
      .insert({ client_id: data.clientId, status: "request_draft", details, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(ins.id) };
  });

export const getFundRequestDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ draftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row } = await db.from("client_fund_intakes").select("id, client_id, status, details").eq("id", data.draftId).maybeSingle();
    if (!row || row.details?._kind !== KIND) throw new Error("Draft not found.");
    await requireMember(context, String(row.client_id));
    return { id: String(row.id), status: String(row.status), request: row.details as FundRequest };
  });

/** Upload a supporting document for a request (stored privately; Harmonious reviews before use). */
export const uploadFundRequestFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      kind: z.string().max(60),
      fileName: z.string().min(1).max(200),
      contentType: z.string().max(120),
      base64: z.string().max(14_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireMember(context, data.clientId);
    const allowed = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
    if (!allowed.includes(data.contentType)) throw new Error("Upload a PDF, Word document or image.");
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
    const safe = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `client/${data.clientId}/fund-requests/${crypto.randomUUID()}/${safe}`;
    const db = await admin();
    const { error } = await db.storage.from("client-contracts").upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error("Upload failed. Please try again.");
    return { kind: data.kind, fileName: data.fileName, path };
  });

/** Send the request: creates a closed Fund + pre-filled Fund Setup and tells Harmonious Operations. */
export const submitFundRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), draftId: z.string().uuid().nullable().optional(), request: requestSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const member = await requireMember(context, data.clientId, true);
    const { missingFields, offeringFieldsFor, setupPrefillFor, flatAnswers, isSpv } = await import("@/lib/fund-request-model");
    const r = data.request as FundRequest;
    const missing = missingFields(r);
    if (Object.keys(missing).length) throw new Error(`Still needed: ${Object.values(missing).flat().join(", ")}.`);
    const db = await admin();

    // Create the closed Fund. A likely duplicate name becomes a Harmonious review item instead.
    let offeringId: string | null = null;
    let duplicate = false;
    try {
      const { createClientRequestedOffering } = await import("@/lib/client-fund-creation.server");
      offeringId = (await createClientRequestedOffering({ clientId: data.clientId, actorId: context.userId, fields: offeringFieldsFor(r) })).offeringId;
    } catch (e: any) {
      if (/already|duplicate|unique|exists/i.test(String(e?.message))) duplicate = true;
      else throw e;
    }

    if (offeringId) {
      const prefill = setupPrefillFor(r);
      const { bootstrapFundSetup } = await import("@/lib/fund-setup.server");
      const setup = await bootstrapFundSetup(context.userId, {
        offeringId, clientId: data.clientId, structure: prefill.structure,
        legalFundName: prefill.legal_fund_name, displayName: prefill.display_name,
      });
      const { structure: _s, ...rest } = prefill;
      await db.from("fund_setups").update(rest).eq("id", (setup as any).id);
      // SS-4 answers prefill EIN & SS-4 for Operations review; also kept on the request. Never filed.
      const { ss4For } = await import("@/lib/fund-request-model");
      const ss4 = ss4For(r);
      if (ss4) {
        const { error } = await context.supabase.rpc("save_offering_entity_details", {
          p_offering_id: offeringId, p_has_ein: false, p_ein: "", p_ss4: ss4 as any,
        });
        if (error) console.warn("SS-4 prefill kept on request only:", error.message);
      }
    }

    const details = { ...r, _kind: KIND, duplicate_review: duplicate };
    const intakeRow = {
      client_id: data.clientId, offering_id: offeringId, details, status: "submitted",
      submitted_by: context.userId, submitted_at: new Date().toISOString(),
    };
    if (data.draftId) {
      await db.from("client_fund_intakes").update(intakeRow).eq("id", data.draftId).eq("client_id", data.clientId);
    } else {
      await db.from("client_fund_intakes").insert({ ...intakeRow, created_by: context.userId });
    }

    // Lands in the existing Operations requests queue, tagged as a new fund.
    await db.from("client_intake_requests").insert({
      client_id: data.clientId,
      intent: isSpv(r) ? "launch_spv" : "launch_fund",
      summary: `New ${isSpv(r) ? "SPV" : "fund"} request: ${r.fund_name}${duplicate ? " (possible duplicate name — review)" : ""}`,
      answers: { ...flatAnswers(r), new_fund_request: "yes", ...(offeringId ? { offering_id: offeringId } : {}) },
      requested_service_keys: r.service_keys ?? [],
      status: "submitted",
      requested_by: context.userId,
    });

    await db.from("contract_audit_events").insert({
      actor_id: context.userId, actor_role: String(member.client_role ?? "client"), client_id: data.clientId,
      offering_id: offeringId, area: "onboarding", action: "client submitted a new fund request",
      target: r.fund_name, new_value: { fund_id: offeringId, duplicate_review: duplicate }, source: "web",
    });

    // Tell the client's Operations and Account Manager owners (or the Operations inbox).
    try {
      const { loadClientTeam } = await import("@/lib/harmonious-team.server");
      const team = await loadClientTeam(data.clientId);
      const ids = team.filter((t) => t.team_role === "operations" || t.team_role === "account_manager").map((t) => t.user_id);
      let emails: string[] = [];
      if (ids.length) {
        const { data: profs } = await db.from("profiles").select("email").in("user_id", ids);
        emails = ((profs ?? []) as any[]).map((p) => p.email).filter(Boolean);
      }
      if (!emails.length) emails = [TEAM_EMAIL];
      const { data: client } = await db.from("clients").select("name").eq("id", data.clientId).maybeSingle();
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      for (const email of emails) {
        await sendTemplateEmail("ops-review-request", email, {
          templateData: {
            itemLabel: `New ${isSpv(r) ? "SPV" : "fund"} request`,
            fundName: r.fund_name,
            detail: `${client?.name ?? "A client"} asked Harmonious to set up a new ${isSpv(r) ? "SPV" : "fund"}.${duplicate ? " The name may match an existing fund — please review." : " Fund Setup is pre-filled from their answers."}`,
            raisedBy: client?.name ?? "Client",
            portalUrl: offeringId ? `${OPS_SITE}/ops/funds` : `${OPS_SITE}/admin/services`,
          },
          idempotencyKey: `new-fund-request-${offeringId ?? data.draftId ?? r.fund_name}-${email}`,
        });
      }
    } catch (err) {
      console.error("new fund request alert failed", err);
    }

    return { ok: true, offeringId, duplicate };
  });

/** Client Home: requests in flight, fund progress and money totals (funded = reconciled only). */
export const getClientHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const staff = ((roles ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role));
    if (!staff) await requireMember(context, data.clientId);
    const db = await admin();
    const { isReconciledFunding } = await import("@/lib/funding-status");

    const { data: offs } = await db.from("offerings").select("id, name, is_open").eq("client_id", data.clientId);
    const funds = (offs ?? []) as any[];
    const ids = funds.map((f) => f.id);
    const [{ data: setups }, { data: onbs }, { data: reqs }] = await Promise.all([
      ids.length ? db.from("fund_setups").select("id, offering_id, stage").in("offering_id", ids) : Promise.resolve({ data: [] }),
      ids.length
        ? db.from("investor_onboardings").select("offering_id, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, funded_amount_cents, funding_status, removed_at").in("offering_id", ids)
        : Promise.resolve({ data: [] }),
      db.from("client_fund_intakes").select("id, offering_id, status, details, submitted_at, updated_at").eq("client_id", data.clientId).in("status", ["request_draft", "submitted"]).order("updated_at", { ascending: false }).limit(20),
    ]);
    const setupIds = ((setups ?? []) as any[]).map((s) => s.id);
    const { data: tasks } = setupIds.length
      ? await db.from("fund_setup_tasks").select("setup_id, status, responsible_party").in("setup_id", setupIds)
      : { data: [] };
    const done = (s: string) => ["complete", "completed", "done", "not_applicable", "waived"].includes(String(s));
    const bySetup = new Map<string, { total: number; done: number; harmonious: number }>();
    for (const t of (tasks ?? []) as any[]) {
      const c = bySetup.get(t.setup_id) ?? { total: 0, done: 0, harmonious: 0 };
      c.total += 1;
      if (done(t.status)) c.done += 1;
      else if (!String(t.responsible_party ?? "").toLowerCase().includes("client")) c.harmonious += 1;
      bySetup.set(t.setup_id, c);
    }
    const setupFor = new Map(((setups ?? []) as any[]).map((s) => [s.offering_id, s]));
    let investors = 0, commit = 0, funded = 0;
    const perFund = new Map<string, number>();
    for (const o of (onbs ?? []) as any[]) {
      if (o.removed_at) continue;
      investors += 1;
      perFund.set(o.offering_id, (perFund.get(o.offering_id) ?? 0) + 1);
      commit += Number(o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents ?? 0);
      if (isReconciledFunding(o.funding_status)) funded += Number(o.funded_amount_cents ?? 0);
    }
    return {
      totals: { funds: funds.length, open: funds.filter((f) => f.is_open).length, investors, commitCents: commit, fundedCents: funded },
      funds: funds.map((f) => {
        const s = setupFor.get(f.id);
        const c = s ? bySetup.get(s.id) : undefined;
        return {
          id: String(f.id), name: String(f.name), isOpen: !!f.is_open, investors: perFund.get(f.id) ?? 0,
          percent: c && c.total ? Math.round((c.done / c.total) * 100) : null, harmoniousPending: c?.harmonious ?? 0,
        };
      }),
      requests: ((reqs ?? []) as any[])
        .filter((r) => r.details?._kind === KIND)
        .map((r) => ({
          id: String(r.id), offeringId: r.offering_id ? String(r.offering_id) : null, status: String(r.status),
          name: String(r.details?.fund_name || "Untitled fund"), duplicate: !!r.details?.duplicate_review,
          at: String(r.submitted_at ?? r.updated_at),
        })),
    };
  });
