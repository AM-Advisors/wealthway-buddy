import { createHash, randomBytes } from "crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Harmonious CapTable — Phase 7: SPV exposure claims and verification.
 *
 * Outside funds, SPVs and advisers declare the position they believe they hold.
 * The company compares that claim against its own register and confirms,
 * adjusts or disputes it. Verifying a claim never issues or moves shares — the
 * register is only changed by a deliberate cap table action.
 */

export const CLAIM_STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "info_requested", label: "More information requested" },
  { value: "verified", label: "Verified" },
  { value: "partially_verified", label: "Partially verified" },
  { value: "disputed", label: "Disputed" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;

export const CLAIMANT_TYPES = [
  { value: "fund", label: "Fund" },
  { value: "spv", label: "SPV" },
  { value: "adviser", label: "Adviser" },
  { value: "nominee", label: "Nominee" },
  { value: "individual", label: "Individual" },
] as const;

export const HOLDING_ROUTES = [
  { value: "direct", label: "Direct purchase from the company" },
  { value: "secondary", label: "Secondary purchase" },
  { value: "spv_interest", label: "Interest in an SPV" },
  { value: "fund_position", label: "Position held through a fund" },
  { value: "other", label: "Other" },
] as const;

export const CASE_STATUSES = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hashClaimToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function assertView(context: any, companyId: string) {
  const { data } = await context.supabase.rpc("ct_can_view", { _company_id: companyId });
  if (!data) throw new Error("You do not have access to this cap table.");
}

async function assertManage(context: any, companyId: string) {
  const { data } = await context.supabase.rpc("ct_can_manage", { _company_id: companyId });
  if (!data) throw new Error("You do not have authority to review claims for this cap table.");
}

async function assertNotDemo(context: any, companyId: string) {
  const { data } = await context.supabase
    .from("ct_companies")
    .select("is_demo")
    .eq("id", companyId)
    .maybeSingle();
  if (data?.is_demo) throw new Error("Demo companies are read-only.");
}

async function recordEvent(
  context: any,
  entry: {
    companyId: string;
    action: string;
    entityType?: string;
    entityId?: string | null;
    previous?: unknown;
    next?: unknown;
    reason?: string | null;
  },
) {
  await context.supabase.from("ct_events").insert({
    company_id: entry.companyId,
    actor_id: context.userId ?? null,
    action: entry.action,
    entity_type: entry.entityType ?? "exposure_claim",
    entity_id: entry.entityId ?? null,
    previous_state: (entry.previous ?? null) as any,
    new_state: (entry.next ?? null) as any,
    reason: entry.reason ?? null,
  });
}

/** Match a claim to the register by stakeholder link, then email, then name. */
function matchStakeholder(
  claim: { claimant_stakeholder_id?: string | null; claimant_email?: string | null; claimant_name: string },
  stakeholders: any[],
) {
  if (claim.claimant_stakeholder_id) {
    const direct = stakeholders.find((s) => s.id === claim.claimant_stakeholder_id);
    if (direct) return direct;
  }
  const email = (claim.claimant_email ?? "").trim().toLowerCase();
  if (email) {
    const byEmail = stakeholders.find((s) => (s.email ?? "").trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = claim.claimant_name.trim().toLowerCase();
  return (
    stakeholders.find(
      (s) =>
        (s.name ?? "").trim().toLowerCase() === name ||
        (s.entity_name ?? "").trim().toLowerCase() === name,
    ) ?? null
  );
}

export const getCapExposure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) =>
    z.object({ companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertView(context, data.companyId);
    const supabase = context.supabase;

    const [company, claims, issuers, invites, cases, notes, stakeholders, securities, transactions, documents] =
      await Promise.all([
        supabase.from("ct_companies").select("id, name, is_demo").eq("id", data.companyId).maybeSingle(),
        supabase
          .from("ct_exposure_claims")
          .select("*")
          .eq("company_id", data.companyId)
          .order("submitted_at", { ascending: false })
          .limit(500),
        supabase.from("ct_issuers").select("*").eq("company_id", data.companyId).order("name"),
        supabase
          .from("ct_claim_invites")
          .select("id, claimant_name, claimant_email, expires_at, used_at, revoked_at, created_at")
          .eq("company_id", data.companyId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("ct_activity_cases")
          .select("*")
          .eq("company_id", data.companyId)
          .order("opened_at", { ascending: false })
          .limit(200),
        supabase
          .from("ct_case_notes")
          .select("id, case_id, note, created_at")
          .eq("company_id", data.companyId)
          .order("created_at", { ascending: true })
          .limit(500),
        supabase
          .from("ct_stakeholders")
          .select("id, name, email, entity_name, stakeholder_type")
          .eq("company_id", data.companyId),
        supabase
          .from("ct_securities")
          .select("id, stakeholder_id, security_type, label, quantity, status")
          .eq("company_id", data.companyId),
        supabase
          .from("ct_transactions")
          .select("security_id, quantity, status")
          .eq("company_id", data.companyId)
          .limit(5000),
        supabase
          .from("ct_claim_documents")
          .select("id, claim_id, title, storage_path, created_at")
          .eq("company_id", data.companyId)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

    const holders = (stakeholders.data ?? []) as any[];
    const secs = (securities.data ?? []) as any[];

    const balances = new Map<string, number>();
    for (const tx of ((transactions.data ?? []) as any[])) {
      if (!tx.security_id) continue;
      if (tx.status === "rejected" || tx.status === "pending") continue;
      balances.set(tx.security_id, (balances.get(tx.security_id) ?? 0) + n(tx.quantity));
    }

    const docsByClaim = new Map<string, { id: string; title: string; reference: string; createdAt: string }[]>();
    for (const doc of ((documents.data ?? []) as any[])) {
      const list = docsByClaim.get(doc.claim_id) ?? [];
      list.push({
        id: doc.id as string,
        title: doc.title as string,
        reference: doc.storage_path as string,
        createdAt: doc.created_at as string,
      });
      docsByClaim.set(doc.claim_id, list);
    }

    const rows = ((claims.data ?? []) as any[]).map((claim) => {
      const holder = matchStakeholder(claim, holders);
      const holderSecurities = holder
        ? secs
            .filter((s) => s.stakeholder_id === holder.id)
            .map((s) => ({
              id: s.id as string,
              securityType: s.security_type as string,
              label: (s.label as string | null) ?? null,
              quantity: balances.has(s.id) ? balances.get(s.id)! : n(s.quantity),
            }))
        : [];
      // The register figure we compare against: same security type where the
      // claimant named one, otherwise everything the matched holder owns.
      const comparable = holderSecurities.filter(
        (s) => !claim.security_type || s.securityType === claim.security_type,
      );
      const recordQuantity = (comparable.length ? comparable : holderSecurities).reduce(
        (sum, s) => sum + s.quantity,
        0,
      );
      const claimed = n(claim.claimed_quantity);
      const difference = claimed - recordQuantity;
      return {
        id: claim.id as string,
        issuerId: (claim.issuer_id as string | null) ?? null,
        claimantName: claim.claimant_name as string,
        claimantEmail: (claim.claimant_email as string | null) ?? null,
        claimantType: claim.claimant_type as string,
        claimantUserId: (claim.claimant_user_id as string | null) ?? null,
        securityType: claim.security_type as string,
        securityLabel: (claim.security_label as string | null) ?? null,
        claimedQuantity: claimed,
        verifiedQuantity: claim.verified_quantity === null ? null : n(claim.verified_quantity),
        holdingRoute: claim.holding_route as string,
        throughEntity: (claim.through_entity as string | null) ?? null,
        asOfDate: (claim.as_of_date as string | null) ?? null,
        status: claim.status as string,
        claimantNote: (claim.claimant_note as string | null) ?? null,
        reviewerNote: (claim.reviewer_note as string | null) ?? null,
        infoRequest: (claim.info_request as string | null) ?? null,
        submittedAt: claim.submitted_at as string,
        reviewedAt: (claim.reviewed_at as string | null) ?? null,
        source: claim.invite_id ? "invite link" : "portal account",
        matchedStakeholderId: holder?.id ?? null,
        matchedStakeholder: holder ? (holder.entity_name ?? holder.name) : null,
        recordQuantity,
        difference,
        matches: holder ? Math.abs(difference) < 0.000001 : false,
        recordSecurities: holderSecurities,
        documents: docsByClaim.get(claim.id) ?? [],
        // Where the position sits between the register and the end party.
        chain: [
          holder ? `${holder.entity_name ?? holder.name} (on the register)` : "No matching holder on the register",
          ...(claim.through_entity ? [String(claim.through_entity)] : []),
          `${claim.claimant_name} (claimant)`,
        ],
      };
    });

    const notesByCase = new Map<string, { id: string; note: string; createdAt: string }[]>();
    for (const note of ((notes.data ?? []) as any[])) {
      const list = notesByCase.get(note.case_id) ?? [];
      list.push({ id: note.id as string, note: note.note as string, createdAt: note.created_at as string });
      notesByCase.set(note.case_id, list);
    }

    const caseRows = ((cases.data ?? []) as any[]).map((row) => ({
      id: row.id as string,
      claimId: (row.claim_id as string | null) ?? null,
      title: row.title as string,
      caseType: row.case_type as string,
      status: row.status as string,
      severity: row.severity as string,
      claimedQuantity: row.claimed_quantity === null ? null : n(row.claimed_quantity),
      recordQuantity: row.record_quantity === null ? null : n(row.record_quantity),
      summary: (row.summary as string | null) ?? null,
      resolution: (row.resolution as string | null) ?? null,
      openedAt: row.opened_at as string,
      closedAt: (row.closed_at as string | null) ?? null,
      notes: notesByCase.get(row.id) ?? [],
    }));

    const issuerRows = ((issuers.data ?? []) as any[]).map((issuer) => {
      const mine = rows.filter((r) => r.issuerId === issuer.id || r.claimantName === issuer.name);
      const verified = mine
        .filter((r) => r.status === "verified" || r.status === "partially_verified")
        .reduce((sum, r) => sum + (r.verifiedQuantity ?? r.claimedQuantity), 0);
      const lastActivity = mine.reduce<string | null>(
        (latest, r) => (!latest || r.submittedAt > latest ? r.submittedAt : latest),
        null,
      );
      return {
        id: issuer.id as string,
        name: issuer.name as string,
        issuerType: issuer.issuerType ?? (issuer.issuer_type as string),
        contactEmail: (issuer.contact_email as string | null) ?? null,
        notes: (issuer.notes as string | null) ?? null,
        claimCount: mine.length,
        verifiedQuantity: verified,
        lastActivity,
      };
    });

    return {
      company: company.data
        ? {
            id: company.data.id as string,
            name: company.data.name as string,
            isDemo: Boolean(company.data.is_demo),
          }
        : null,
      claims: rows,
      issuers: issuerRows,
      invites: ((invites.data ?? []) as any[]).map((i) => ({
        id: i.id as string,
        claimantName: i.claimant_name as string,
        claimantEmail: i.claimant_email as string,
        expiresAt: i.expires_at as string,
        usedAt: (i.used_at as string | null) ?? null,
        revokedAt: (i.revoked_at as string | null) ?? null,
        createdAt: i.created_at as string,
      })),
      cases: caseRows,
      stakeholders: holders.map((s) => ({
        id: s.id as string,
        name: (s.entity_name ?? s.name) as string,
      })),
      summary: {
        total: rows.length,
        awaiting: rows.filter((r) => r.status === "submitted" || r.status === "under_review").length,
        infoRequested: rows.filter((r) => r.status === "info_requested").length,
        verified: rows.filter((r) => r.status === "verified" || r.status === "partially_verified").length,
        disputed: rows.filter((r) => r.status === "disputed").length,
        unmatched: rows.filter((r) => !r.matchedStakeholderId).length,
        openCases: caseRows.filter((c) => c.status === "open" || c.status === "investigating").length,
        claimedQuantity: rows.reduce((sum, r) => sum + r.claimedQuantity, 0),
        verifiedQuantity: rows.reduce((sum, r) => sum + (r.verifiedQuantity ?? 0), 0),
      },
    };
  });

export const createClaimInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    claimantName: string;
    claimantEmail: string;
    issuerId?: string | null;
    expiresInDays?: number;
  }) =>
    z
      .object({
        companyId: z.string().uuid(),
        claimantName: z.string().trim().min(2).max(160),
        claimantEmail: z.string().trim().email().max(200),
        issuerId: z.string().uuid().nullable().optional(),
        expiresInDays: z.number().int().min(1).max(90).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    await assertNotDemo(context, data.companyId);

    const token = randomBytes(24).toString("base64url");
    const days = data.expiresInDays ?? 21;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    const { data: row, error } = await context.supabase
      .from("ct_claim_invites")
      .insert({
        company_id: data.companyId,
        issuer_id: data.issuerId ?? null,
        claimant_name: data.claimantName,
        claimant_email: data.claimantEmail.toLowerCase(),
        token_hash: hashClaimToken(token),
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: "exposure_invite_created",
      entityType: "claim_invite",
      entityId: row.id,
      next: { claimant: data.claimantName, email: data.claimantEmail, expires_at: expiresAt },
    });

    return { id: row.id as string, token, path: `/cap-claim/${token}`, expiresAt };
  });

export const revokeClaimInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; inviteId: string }) =>
    z.object({ companyId: z.string().uuid(), inviteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { error } = await context.supabase
      .from("ct_claim_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.inviteId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "exposure_invite_revoked",
      entityType: "claim_invite",
      entityId: data.inviteId,
    });
    return { ok: true };
  });

export const saveCapIssuer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    id?: string | null;
    name: string;
    issuerType: string;
    contactEmail?: string | null;
    notes?: string | null;
  }) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(2).max(160),
        issuerType: z.string().trim().min(2).max(40),
        contactEmail: z.string().trim().email().max(200).nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    await assertNotDemo(context, data.companyId);
    const payload = {
      company_id: data.companyId,
      name: data.name,
      issuer_type: data.issuerType,
      contact_email: data.contactEmail ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("ct_issuers")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", data.companyId);
      if (error) throw new Error(error.message);
      await recordEvent(context, {
        companyId: data.companyId,
        action: "issuer_updated",
        entityType: "issuer",
        entityId: data.id,
        next: payload,
      });
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("ct_issuers")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "issuer_added",
      entityType: "issuer",
      entityId: row.id,
      next: payload,
    });
    return { id: row.id as string };
  });

export const reviewExposureClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    claimId: string;
    decision: "under_review" | "verify" | "verify_adjusted" | "info" | "dispute";
    verifiedQuantity?: number | null;
    note?: string | null;
  }) =>
    z
      .object({
        companyId: z.string().uuid(),
        claimId: z.string().uuid(),
        decision: z.enum(["under_review", "verify", "verify_adjusted", "info", "dispute"]),
        verifiedQuantity: z.number().min(0).nullable().optional(),
        note: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    await assertNotDemo(context, data.companyId);

    const { data: existing, error: readError } = await context.supabase
      .from("ct_exposure_claims")
      .select("*")
      .eq("id", data.claimId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("That claim no longer exists.");
    if (existing.status === "withdrawn") throw new Error("That claim was withdrawn by the claimant.");

    if (data.decision === "verify_adjusted" && (data.verifiedQuantity === null || data.verifiedQuantity === undefined)) {
      throw new Error("Enter the quantity you are confirming.");
    }
    if (data.decision === "info" && !data.note) {
      throw new Error("Say what you need from the claimant.");
    }
    if (data.decision === "dispute" && !data.note) {
      throw new Error("Record why the claim is disputed.");
    }

    const status =
      data.decision === "verify"
        ? "verified"
        : data.decision === "verify_adjusted"
          ? "partially_verified"
          : data.decision === "info"
            ? "info_requested"
            : data.decision === "dispute"
              ? "disputed"
              : "under_review";

    const patch = {
      status,
      reviewer_note: data.decision === "info" ? existing.reviewer_note : (data.note ?? existing.reviewer_note),
      info_request: data.decision === "info" ? data.note : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.userId,
      verified_quantity:
        data.decision === "verify"
          ? n(existing.claimed_quantity)
          : data.decision === "verify_adjusted"
            ? data.verifiedQuantity
            : null,
    };

    const { error } = await context.supabase
      .from("ct_exposure_claims")
      .update(patch as any)
      .eq("id", data.claimId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: `exposure_claim_${status}`,
      entityId: data.claimId,
      previous: { status: existing.status, verified_quantity: existing.verified_quantity },
      next: { status, verified_quantity: patch.verified_quantity },
      reason: data.note ?? null,
    });

    return { ok: true, status };
  });

export const openActivityCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    claimId?: string | null;
    title: string;
    caseType?: string;
    severity?: string;
    summary?: string | null;
    claimedQuantity?: number | null;
    recordQuantity?: number | null;
  }) =>
    z
      .object({
        companyId: z.string().uuid(),
        claimId: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(3).max(200),
        caseType: z.string().trim().max(60).optional(),
        severity: z.enum(["low", "medium", "high"]).optional(),
        summary: z.string().trim().max(4000).nullable().optional(),
        claimedQuantity: z.number().nullable().optional(),
        recordQuantity: z.number().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    await assertNotDemo(context, data.companyId);
    const { data: row, error } = await context.supabase
      .from("ct_activity_cases")
      .insert({
        company_id: data.companyId,
        claim_id: data.claimId ?? null,
        title: data.title,
        case_type: data.caseType ?? "unverified_claim",
        severity: data.severity ?? "medium",
        summary: data.summary ?? null,
        claimed_quantity: data.claimedQuantity ?? null,
        record_quantity: data.recordQuantity ?? null,
        opened_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "activity_case_opened",
      entityType: "activity_case",
      entityId: row.id,
      next: { title: data.title, severity: data.severity ?? "medium", claim_id: data.claimId ?? null },
    });
    return { id: row.id as string };
  });

export const updateActivityCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    caseId: string;
    status: "open" | "investigating" | "resolved" | "closed";
    resolution?: string | null;
  }) =>
    z
      .object({
        companyId: z.string().uuid(),
        caseId: z.string().uuid(),
        status: z.enum(["open", "investigating", "resolved", "closed"]),
        resolution: z.string().trim().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    await assertNotDemo(context, data.companyId);
    const closing = data.status === "resolved" || data.status === "closed";
    if (closing && !data.resolution) throw new Error("Record how the case was resolved before closing it.");
    const { error } = await context.supabase
      .from("ct_activity_cases")
      .update({
        status: data.status,
        resolution: data.resolution ?? null,
        closed_at: closing ? new Date().toISOString() : null,
        closed_by: closing ? context.userId : null,
      })
      .eq("id", data.caseId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: `activity_case_${data.status}`,
      entityType: "activity_case",
      entityId: data.caseId,
      next: { status: data.status },
      reason: data.resolution ?? null,
    });
    return { ok: true };
  });

export const addActivityCaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; caseId: string; note: string }) =>
    z
      .object({
        companyId: z.string().uuid(),
        caseId: z.string().uuid(),
        note: z.string().trim().min(2).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { error } = await context.supabase.from("ct_case_notes").insert({
      case_id: data.caseId,
      company_id: data.companyId,
      note: data.note,
      author_id: context.userId,
    });
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "activity_case_note_added",
      entityType: "activity_case",
      entityId: data.caseId,
      reason: data.note,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Claimant side — signed-in funds, SPVs and advisers                  */
/* ------------------------------------------------------------------ */

export const getMyExposureClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: claims } = await context.supabase
      .from("ct_exposure_claims")
      .select("*")
      .eq("claimant_user_id", context.userId)
      .order("submitted_at", { ascending: false })
      .limit(200);

    const rows = (claims ?? []) as any[];
    const companyIds = [...new Set(rows.map((r) => r.company_id))];
    const { data: companies } = companyIds.length
      ? await context.supabase.from("ct_companies").select("id, name").in("id", companyIds)
      : { data: [] as any[] };
    const nameById = new Map(((companies ?? []) as any[]).map((c) => [c.id, c.name as string]));

    return {
      claims: rows.map((claim) => ({
        id: claim.id as string,
        companyId: claim.company_id as string,
        companyName: nameById.get(claim.company_id) ?? "Company",
        securityType: claim.security_type as string,
        claimedQuantity: n(claim.claimed_quantity),
        verifiedQuantity: claim.verified_quantity === null ? null : n(claim.verified_quantity),
        holdingRoute: claim.holding_route as string,
        throughEntity: (claim.through_entity as string | null) ?? null,
        asOfDate: (claim.as_of_date as string | null) ?? null,
        status: claim.status as string,
        infoRequest: (claim.info_request as string | null) ?? null,
        reviewerNote: (claim.reviewer_note as string | null) ?? null,
        submittedAt: claim.submitted_at as string,
        reviewedAt: (claim.reviewed_at as string | null) ?? null,
      })),
    };
  });

export const submitExposureClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string;
    claimantName: string;
    claimantType: string;
    securityType: string;
    claimedQuantity: number;
    holdingRoute: string;
    throughEntity?: string | null;
    asOfDate?: string | null;
    claimantNote?: string | null;
  }) =>
    z
      .object({
        companyId: z.string().uuid(),
        claimantName: z.string().trim().min(2).max(160),
        claimantType: z.string().trim().min(2).max(40),
        securityType: z.string().trim().min(2).max(40),
        claimedQuantity: z.number().positive(),
        holdingRoute: z.string().trim().min(2).max(40),
        throughEntity: z.string().trim().max(160).nullable().optional(),
        asOfDate: z.string().trim().max(20).nullable().optional(),
        claimantNote: z.string().trim().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertNotDemo(context, data.companyId);
    const { data: row, error } = await context.supabase
      .from("ct_exposure_claims")
      .insert({
        company_id: data.companyId,
        claimant_user_id: context.userId,
        claimant_name: data.claimantName,
        claimant_email: (context.claims as any)?.email ?? null,
        claimant_type: data.claimantType,
        security_type: data.securityType,
        claimed_quantity: data.claimedQuantity,
        holding_route: data.holdingRoute,
        through_entity: data.throughEntity ?? null,
        as_of_date: data.asOfDate || null,
        claimant_note: data.claimantNote ?? null,
        status: "submitted",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "exposure_claim_submitted",
      entityId: row.id,
      next: { claimant: data.claimantName, quantity: data.claimedQuantity, route: data.holdingRoute },
    });
    return { id: row.id as string };
  });

export const withdrawMyExposureClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { claimId: string }) =>
    z.object({ claimId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("ct_exposure_claims")
      .select("id, company_id, status")
      .eq("id", data.claimId)
      .eq("claimant_user_id", context.userId)
      .maybeSingle();
    if (!existing) throw new Error("That claim is not yours to withdraw.");
    if (existing.status === "verified" || existing.status === "partially_verified") {
      throw new Error("A verified claim cannot be withdrawn — contact the company.");
    }
    const { error } = await context.supabase
      .from("ct_exposure_claims")
      .update({ status: "withdrawn" })
      .eq("id", data.claimId)
      .eq("claimant_user_id", context.userId);
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: existing.company_id as string,
      action: "exposure_claim_withdrawn",
      entityId: data.claimId,
    });
    return { ok: true };
  });

export const addExposureClaimDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; claimId: string; title: string; reference: string }) =>
    z
      .object({
        companyId: z.string().uuid(),
        claimId: z.string().uuid(),
        title: z.string().trim().min(2).max(200),
        reference: z.string().trim().min(2).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ct_claim_documents").insert({
      claim_id: data.claimId,
      company_id: data.companyId,
      title: data.title,
      storage_path: data.reference,
      uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "exposure_claim_document_added",
      entityId: data.claimId,
      next: { title: data.title },
    });
    return { ok: true };
  });
