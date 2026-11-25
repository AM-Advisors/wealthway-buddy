import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { FUND_OPERATIONS_ROLES } from "@/lib/staff-roles";
import { canFinalizeCloseRequest, closeStatusForIntent } from "@/lib/fund-close-request-model";
import { estimateCloseFilingCosts, stateCode } from "@/lib/blue-sky-fees";
import { closeInvestorTerms, closeManagementFee } from "@/lib/close-investor-terms";
import { missingCloseAttachments } from "@/lib/close-attachments";

async function filedBlueSkyStates(db: any, fundId: string): Promise<string[]> {
  const { data } = await db.from("fund_regulatory_filings").select("state").eq("offering_id", fundId).eq("filing_type", "blue_sky").is("removed_at", null);
  return ((data ?? []) as any[]).map((r) => stateCode(r.state)).filter(Boolean) as string[];
}

async function investorStatesFor(db: any, fundId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data } = await db.from("investor_onboardings").select("id, persons(region), investment_profiles(region)").eq("offering_id", fundId).in("id", ids);
  return ((data ?? []) as any[]).map((o) => stateCode(o.investment_profiles?.region) ?? stateCode(o.persons?.region)).filter(Boolean) as string[];
}

const STAFF_ROLES: readonly string[] = FUND_OPERATIONS_ROLES;

async function isStaff(db: any, uid: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role));
}

async function canViewFund(db: any, uid: string, fundId: string) {
  // Shared fund check: fund operations staff, this fund's managers or active members of its client.
  const { fundAccessAllows } = await import("@/lib/fund-access.server");
  return fundAccessAllows(db, uid, fundId, "manage");
}

async function sideLetterPricing(db: any, fundId: string, onboardingIds: string[]) {
  const { data: letters, error } = await db.from("side_letters").select("id, offering_id, onboarding_id, status, fee_payment_id, terms, effective_date, expiry_date, current_version, document_reference").eq("offering_id", fundId);
  if (error) throw new Error("Side letters couldn't be counted.");
  const payIds = [...new Set(((letters ?? []) as any[]).map((l) => l.fee_payment_id).filter(Boolean))];
  const { data: pays } = payIds.length ? await db.from("fund_payments").select("id, status").in("id", payIds).in("status", ["paid", "used"]) : { data: [] };
  const { closeSideLetterPricing } = await import("@/lib/close-side-letter-pricing");
  return { ...closeSideLetterPricing(onboardingIds, (letters ?? []) as any[], ((pays ?? []) as any[]).map((p) => p.id)), letters: (letters ?? []) as any[] };
}

async function closeTermRows(db: any, fundId: string, ids: string[], letters: any[]) {
  if (!ids.length) return [];
  const { data: obs, error } = await db.from("investor_onboardings").select("id, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, persons(legal_first_name, legal_last_name, preferred_name), investment_profiles(legal_name)").eq("offering_id", fundId).in("id", ids);
  if (error) throw new Error("Investor close terms couldn't be loaded.");
  return ((obs ?? []) as any[]).map(o => ({ id: o.id as string, name: o.investment_profiles?.legal_name || [o.persons?.legal_first_name, o.persons?.legal_last_name].filter(Boolean).join(" ") || "Unnamed investor", amountCents: (o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents ?? null) as number | null, terms: closeInvestorTerms(fundId, o.id, letters) }));
}

const fundInput = (d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d);

const closeDetailsSchema = z.object({
  assetMode: z.enum(["existing", "new"]),
  existingAsset: z.string().max(200).default(""),
  asset: z.object({ name: z.string().max(200), issuer: z.string().max(200), type: z.string().max(100), amountCents: z.number().int().min(0).max(1e13).nullable(), notes: z.string().max(2000) }),
  purchaseAgreement: z.object({ fileName: z.string().max(200), contentType: z.string().max(120), base64: z.string().max(28_000_000) }).nullable(),
  purchaseAgreementSigned: z.boolean().optional().default(false),
  wireInstructions: z.object({ fileName: z.string().min(1).max(200), contentType: z.string().max(120), base64: z.string().min(1).max(28_000_000) }).nullable().optional().default(null),
  managementFeePct: z.number().min(0).max(100).nullable(),
  managementFeeCents: z.number().int().min(0).max(1e13).nullable(),
  feeConfirmed: z.boolean(),
  wire: z.object({ method: z.enum(["wire", "ach"]), beneficiary: z.string().max(200), bankName: z.string().max(200), routingLast4: z.string().max(4), accountLast4: z.string().max(4), reference: z.string().max(200), amountCents: z.number().int().min(0).max(1e13).nullable() }),
  investorStates: z.array(z.string().max(40)).max(60),
  legalFeesCents: z.number().int().min(0).max(1e13).nullable(),
  legalFeesDetail: z.string().max(1000),
  brokerDealerFeesCents: z.number().int().min(0).max(1e13).nullable(),
  brokerDealerDetail: z.string().max(1000),
  closeAmountCents: z.number().int().min(0).max(1e13).nullable().optional(),
  feeBankName: z.string().max(200).optional(),
  feeAddress: z.string().max(500).optional(),
  legalOn: z.boolean().optional(),
  legalPayee: z.string().max(200).optional(),
  legalDueDate: z.string().max(10).optional(),
  brokerDealerOn: z.boolean().optional(),
  brokerDealerPayee: z.string().max(200).optional(),
  brokerDealerName: z.string().max(200).optional(),
  brokerDealerDueDate: z.string().max(10).optional(),
  wireAddress: z.string().max(500).optional(),
}).optional();

/** Read-only, informational tabs: Banking, Taxes, Assets. Nothing here needs approval. */
export const getFundTabsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(fundInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await canViewFund(db, context.userId, data.fundId))) throw new Error("You don't have access to this Fund.");
    const [{ data: banks }, { data: taxDocs }] = await Promise.all([
      db.from("bank_accounts").select("id, institution_name, account_name, account_mask, status, last_synced_at").eq("offering_id", data.fundId),
      db.from("fund_tax_documents").select("id, doc_type, tax_year, file_name, review_status, created_at").eq("offering_id", data.fundId).is("investor_user_id", null).order("tax_year", { ascending: false }),
    ]);
    return {
      banks: ((banks ?? []) as any[]).map((b) => ({
        id: b.id, institution: b.institution_name, name: b.account_name,
        mask: b.account_mask ? `••••${String(b.account_mask).slice(-4)}` : null, status: b.status, lastSynced: b.last_synced_at,
      })),
      taxDocs: (taxDocs ?? []) as any[],
      assets: await (await import("@/lib/fund-books.server")).assetsWithMarks(data.fundId),
    };
  });

/** Investors who could be in a close, with readiness from open readiness tasks. */
export const getCloseCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(fundInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await canViewFund(db, context.userId, data.fundId))) throw new Error("You don't have access to this Fund.");
    const [{ data: obs }, { data: tasks }] = await Promise.all([
      db.from("investor_onboardings")
        .select("id, stage, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, removed_at, persons(legal_first_name, legal_last_name, preferred_name, region), investment_profiles(legal_name, region)")
        .eq("offering_id", data.fundId).is("removed_at", null),
      db.from("investment_readiness_tasks").select("onboarding_id, title").eq("offering_id", data.fundId).is("resolved_at", null),
    ]);
    const open: Record<string, string[]> = {};
    for (const t of (tasks ?? []) as any[]) (open[t.onboarding_id] ??= []).push(t.title);
    const sl = await sideLetterPricing(db, data.fundId, ((obs ?? []) as any[]).map((o) => o.id));
    const filedStates = await filedBlueSkyStates(db, data.fundId);
    const investors = ((obs ?? []) as any[]).map((o) => {
      const p = o.persons;
      const name = p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "";
      return {
        id: o.id as string,
        name: name || "Unnamed investor",
        profileName: o.investment_profiles?.legal_name ?? null,
        amountCents: o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents ?? null,
        openItems: open[o.id] ?? [],
        sideLetters: sl.perInvestor[o.id] ?? 0,
        terms: closeInvestorTerms(data.fundId, o.id, sl.letters),
        state: stateCode(o.investment_profiles?.region) ?? stateCode(o.persons?.region),
      };
    });
    return { investors, filedStates };
  });

export const listFundCloseRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(fundInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await canViewFund(db, context.userId, data.fundId))) throw new Error("You don't have access to this Fund.");
    const { data: rows } = await db.from("fund_close_requests")
      .select("id, offering_id, target_date, notes, onboarding_ids, status, staff_note, created_at, updated_at, details")
      .eq("offering_id", data.fundId).order("created_at", { ascending: false });
    const requests = (rows ?? []) as any[];
    const ids = [...new Set(requests.flatMap(r => r.onboarding_ids ?? []))] as string[];
    const sl = await sideLetterPricing(db, data.fundId, ids);
    const terms = await closeTermRows(db, data.fundId, ids, sl.letters);
    return requests.map(r => ({ ...r, investorTerms: r.status !== "draft" && Array.isArray(r.details?.investorTerms) ? r.details.investorTerms : terms.filter(i => (r.onboarding_ids ?? []).includes(i.id)) }));
  });

export const createFundCloseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    id: z.string().uuid().optional(),
    fundId: z.string().uuid(),
    intent: z.enum(["draft", "submit"]).default("submit"),
    onboardingIds: z.array(z.string().uuid()).max(500),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    notes: z.string().max(2000).optional().default(""),
    details: closeDetailsSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = context.userId;
    if (!(await canViewFund(db, uid, data.fundId))) throw new Error("You don't have access to this Fund.");
    const onboardingIds = [...new Set(data.onboardingIds)];
    const nextStatus = closeStatusForIntent(data.intent);
    if (data.intent === "submit" && !onboardingIds.length) throw new Error("Pick at least one investor before sending for review.");
    if (data.intent === "submit" && data.details && !data.details.feeConfirmed) throw new Error("Confirm the management fee before sending for review.");
    if (data.intent === "submit" && data.details?.assetMode === "new" && data.details.asset.name.trim().length < 2) throw new Error("Add the asset name before sending for review.");
    if (onboardingIds.length) {
      const { data: obs } = await db.from("investor_onboardings").select("id").eq("offering_id", data.fundId).is("removed_at", null).in("id", onboardingIds);
      if ((obs ?? []).length !== onboardingIds.length) throw new Error("Some selected investors aren't in this fund.");
    }

    const sl = await sideLetterPricing(db, data.fundId, onboardingIds);
    const investorTerms = await closeTermRows(db, data.fundId, onboardingIds, sl.letters);
    if (data.intent === "submit" && investorTerms.some(i => i.terms.error)) throw new Error("Review the selected investors' conflicting side-letter terms before sending.");
    const managementFeeCents = data.details ? closeManagementFee(investorTerms, data.details.managementFeePct) : null;

    let rowId = data.id ?? null;
    let previousStatus: string | null = null;
    let previousDetails: Record<string, any> = {};
    if (rowId) {
      const { data: existing } = await db.from("fund_close_requests").select("id, status, offering_id, details").eq("id", rowId).eq("offering_id", data.fundId).maybeSingle();
      if (!existing) throw new Error("Close details not found.");
      if (existing.status !== "draft") throw new Error("Only draft close details can be changed or sent for review.");
      previousStatus = existing.status;
      previousDetails = existing.details && typeof existing.details === "object" ? existing.details : {};
      if (data.intent === "submit") {
        const missing = missingCloseAttachments({ hasPurchaseAgreement: !!(data.details?.purchaseAgreement || previousDetails["purchaseAgreementPath"]), purchaseAgreementSigned: data.details?.purchaseAgreementSigned === true, hasWireInstructions: !!(data.details?.wireInstructions || previousDetails["wireInstructionsPath"]) });
        if (missing.length) throw new Error(missing.join(" "));
      }
      const { data: updated, error } = await db.from("fund_close_requests").update({
        target_date: data.targetDate, notes: data.notes.trim() || null,
        onboarding_ids: onboardingIds, updated_at: new Date().toISOString(),
      }).eq("id", rowId).eq("status", "draft").select("id");
      if (error || !updated?.length) throw new Error("These close details changed. Refresh and try again.");
    } else {
      if (data.intent === "submit") {
        const missing = missingCloseAttachments({ hasPurchaseAgreement: !!data.details?.purchaseAgreement, purchaseAgreementSigned: data.details?.purchaseAgreementSigned === true, hasWireInstructions: !!data.details?.wireInstructions });
        if (missing.length) throw new Error(missing.join(" "));
      }
      const { data: off } = await db.from("offerings").select("client_id").eq("id", data.fundId).maybeSingle();
      const { data: row, error } = await db.from("fund_close_requests").insert({
        offering_id: data.fundId, client_id: off?.client_id ?? null, requested_by: uid, status: "draft",
        target_date: data.targetDate, notes: data.notes.trim() || null, onboarding_ids: onboardingIds,
      }).select("id").single();
      if (error) throw new Error(data.intent === "draft" ? "Couldn't save the close details." : "Couldn't submit the close request.");
      rowId = row.id as string;
    }

    // Server-recomputed side-letter estimate; client totals are never trusted.
    const sideLetterDetails = { sideLetterCount: sl.count, sideLetterPaidCount: sl.paidCount, sideLetterFeeCents: sl.feeCents, sideLetterUnitCents: sl.unitCents, investorTerms };
    if (data.details) {
      const det = data.details;
      let paPath: string | null = typeof previousDetails["purchaseAgreementPath"] === "string" ? previousDetails["purchaseAgreementPath"] : null;
      let paName: string | null = typeof previousDetails["purchaseAgreementName"] === "string" ? previousDetails["purchaseAgreementName"] : null;
      let wirePath: string | null = typeof previousDetails["wireInstructionsPath"] === "string" ? previousDetails["wireInstructionsPath"] : null;
      let wireName: string | null = typeof previousDetails["wireInstructionsName"] === "string" ? previousDetails["wireInstructionsName"] : null;
      if (det.purchaseAgreement) {
        const bytes = Buffer.from(det.purchaseAgreement.base64, "base64");
        if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error("The purchase agreement must be a nonempty file, 20 MB or smaller.");
        paPath = `close-requests/${data.fundId}/${rowId}/${Date.now()}-${det.purchaseAgreement.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
        const { error: upErr } = await db.storage.from("manager-uploads").upload(paPath, bytes, { contentType: det.purchaseAgreement.contentType || "application/pdf", upsert: false });
        if (upErr) throw new Error("The purchase agreement couldn't be saved. Please try again.");
        paName = det.purchaseAgreement.fileName;
      }
      if (det.wireInstructions) {
        const bytes = Buffer.from(det.wireInstructions.base64, "base64");
        if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error("The wire instructions must be a nonempty file, 20 MB or smaller.");
        wirePath = `close-requests/${data.fundId}/${rowId}/wire-${Date.now()}-${det.wireInstructions.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
        const { error } = await db.storage.from("manager-uploads").upload(wirePath, bytes, { contentType: det.wireInstructions.contentType || "application/pdf", upsert: false });
        if (error) throw new Error("The wire instructions couldn't be saved. Please try again.");
        wireName = det.wireInstructions.fileName;
      }
      if (data.intent === "submit") {
        const missing = missingCloseAttachments({ hasPurchaseAgreement: !!paPath, purchaseAgreementSigned: det.purchaseAgreementSigned, hasWireInstructions: !!wirePath });
        if (missing.length) throw new Error(missing.join(" "));
        for (const path of [paPath, wirePath]) {
          if (!path || !path.startsWith(`close-requests/${data.fundId}/${rowId}/`)) throw new Error("Close attachments must belong to this close request.");
          const { data: signed, error } = await db.storage.from("manager-uploads").createSignedUrl(path, 60);
          if (error || !signed?.signedUrl) throw new Error("A required close attachment is unavailable. Upload it again before sending.");
        }
      }
      // A proposed asset is created only on explicit submission, never by saving draft details.
      if (data.intent === "submit" && det.assetMode === "new" && det.asset.name.trim()) {
        const { error: assetError } = await db.from("fund_proposed_assets").insert({
          offering_id: data.fundId, close_request_id: rowId, asset_name: det.asset.name.trim(), issuer_name: det.asset.issuer || null,
          asset_type: det.asset.type || null, amount_cents: det.asset.amountCents, purchase_agreement_path: paPath,
          purchase_agreement_name: paName, details: { notes: det.asset.notes }, created_by: uid,
        });
        if (assetError) throw new Error("The asset details couldn't be saved. Please try again.");
      }
      // Only the last four digits of bank numbers are kept here; full instructions are verified by Harmonious.
      const { purchaseAgreement: _pa, wireInstructions: _wi, ...rest } = det;
      // Blue Sky states come from investor addresses and the fund's Compliance filings, recomputed here.
      const filing = estimateCloseFilingCosts({ investorStates: await investorStatesFor(db, data.fundId, onboardingIds), filedStates: await filedBlueSkyStates(db, data.fundId) });
      rest.investorStates = filing.lines.map((l) => l.state);
      const { error: detailsError } = await db.from("fund_close_requests").update({
        details: { ...rest, managementFeeCents, purchaseAgreementPath: paPath, purchaseAgreementName: paName, purchaseAgreementSignedConfirmedBy: det.purchaseAgreementSigned && paPath ? uid : null, purchaseAgreementSignedConfirmedAt: det.purchaseAgreementSigned && paPath ? new Date().toISOString() : null, wireInstructionsPath: wirePath, wireInstructionsName: wireName, formDFeeCents: filing.formDCents, blueSkyLines: filing.lines, filingTotalCents: filing.totalCents, ...sideLetterDetails, feesAreEstimate: true },
      }).eq("id", rowId);
      if (detailsError) throw new Error("The close details couldn't be saved. Please try again.");
    } else {
      await db.from("fund_close_requests").update({ details: { ...sideLetterDetails, feesAreEstimate: true } }).eq("id", rowId);
    }

    const { data: finalizedSave, error: statusError } = await db.from("fund_close_requests")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", rowId).eq("status", "draft").select("id");
    if (statusError || !finalizedSave?.length) throw new Error("These close details changed. Refresh and try again.");
    await db.from("fund_close_request_events").insert({
      close_request_id: rowId, actor_id: uid, from_status: previousStatus, to_status: nextStatus,
      note: data.intent === "draft" ? "Close details saved without submission." : null,
    });
    if (data.intent === "submit") {
      await (await import("@/lib/ops-slack-notify.server")).notifySubmission({ kind: "close_request", title: "Fund close request submitted", offeringId: data.fundId, submittedBy: uid, ref: rowId, path: "/ops/close-requests" });
    }
    return { id: rowId as string, status: nextStatus };
  });

/** Exact-close authorized private document reader; never accepts arbitrary storage paths. */
export const openCloseAttachment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), kind: z.enum(["purchase_agreement", "wire_instructions"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: row } = await db.from("fund_close_requests").select("offering_id, details").eq("id", data.id).maybeSingle();
    if (!row || !(await canViewFund(db, context.userId, row.offering_id))) throw new Error("You don't have access to this close.");
    const path = data.kind === "purchase_agreement" ? row.details?.purchaseAgreementPath : row.details?.wireInstructionsPath;
    if (typeof path !== "string" || !path.startsWith(`close-requests/${row.offering_id}/${data.id}/`)) throw new Error("Attachment not found for this close.");
    const { data: result, error } = await db.storage.from("manager-uploads").createSignedUrl(path, 300);
    if (error || !result?.signedUrl) throw new Error("Couldn't open the close attachment.");
    return { url: result.signedUrl as string };
  });

/** Operations queue (staff only). */
export const listAllCloseRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await isStaff(db, context.userId))) throw new Error("Harmonious staff only.");
    const { data: rows } = await db.from("fund_close_requests")
      .select("id, offering_id, target_date, notes, onboarding_ids, status, staff_note, created_at, details, offerings(name)")
      .order("created_at", { ascending: false }).limit(500);
    return (rows ?? []) as any[];
  });

export const updateFundCloseRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["in_review", "completed", "returned"]),
    note: z.string().max(1000).optional().default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (!(await isStaff(db, context.userId))) throw new Error("Harmonious staff only.");
    if (data.status === "returned" && data.note.trim().length < 3) throw new Error("Add a note explaining why it's returned.");
    const { data: cur } = await db.from("fund_close_requests").select("status").eq("id", data.id).maybeSingle();
    if (!cur) throw new Error("Close request not found.");
    if (cur.status === "completed") throw new Error("Completed close requests can't be changed.");
    if (data.status === "completed") {
      if (cur.status !== "approved") throw new Error("Approve the close and record its filings before completing it.");
      const { data: fl } = await db.from("fund_close_filings").select("status").eq("close_request_id", data.id);
      const rows = (fl ?? []) as any[];
      if (!rows.length) throw new Error("Generate the Form D and state filings first.");
      if (rows.some((f) => f.status === "prepared")) throw new Error("Every filing must be recorded as filed or not required before completing.");
      if (!canFinalizeCloseRequest({ isStaff: true, status: cur.status, filingStatuses: rows.map((f) => f.status) })) throw new Error("This close isn't ready to complete.");
    }
    if (cur.status === "approved" && data.status === "in_review") throw new Error("Approved close requests can't go back to review; return it instead.");
    const note = data.note.trim() || null;
    await db.from("fund_close_requests").update({ status: data.status, staff_note: note ?? undefined, updated_at: new Date().toISOString() }).eq("id", data.id);
    await db.from("fund_close_request_events").insert({ close_request_id: data.id, actor_id: context.userId, from_status: cur.status, to_status: data.status, note });
    return { ok: true };
  });
