import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canApprove,
  canPropose,
  expiryStatus,
  mfnCandidates,
  MFN_DECISIONS,
  TERM_CATEGORIES,
  type ActorKind,
  type SideLetterSnapshot,
} from "@/lib/side-letter-model";

/**
 * Side Letter Registry server functions. Every call re-resolves the caller's
 * relationship to the exact Fund on the server. All writes use the service
 * client after that check; history tables are append-only in the database.
 * Nothing here touches economics, capital accounts, distributions or email.
 */

const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function actorKind(db: any, userId: string, fundId: string): Promise<ActorKind> {
  const [{ data: roles }, { data: mgr }, { data: grant }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("fund_managers").select("id").eq("user_id", userId).eq("offering_id", fundId).maybeSingle(),
    db
      .from("fund_team_grants")
      .select("role, expires_at, granted_by")
      .eq("grantee_user_id", userId)
      .eq("offering_id", fundId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (((roles ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role))) return "staff";
  if (mgr) return "manager";
  if (grant && (!grant.expires_at || new Date(grant.expires_at) > new Date())) {
    const { data: granter } = await db
      .from("fund_managers")
      .select("id")
      .eq("user_id", grant.granted_by)
      .eq("offering_id", fundId)
      .maybeSingle();
    if (granter) return grant.role === "fund_assistant" ? "assistant" : "viewer";
  }
  return "none";
}

const termSchema = z.object({
  id: z.string().min(1).max(64),
  category: z.enum(TERM_CATEGORIES.map((t) => t.key) as [string, ...string[]]),
  description: z.string().trim().min(1).max(2000),
  value: z.string().max(200).nullable().optional(),
  applicability: z.string().max(500).nullable().optional(),
});
const dateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const snapshotSchema = z.object({
  investorLabel: z.string().trim().min(1).max(200),
  mfnEnabled: z.boolean(),
  mfnScope: z.enum(["all_investors", "same_class", "commitment_at_or_below"]).nullable(),
  effectiveDate: dateOrNull,
  expiryDate: dateOrNull,
  renewalNote: z.string().max(1000).nullable(),
  documentReference: z.string().max(500).nullable(),
  terms: z.array(termSchema).max(50),
});

function toSnapshot(row: any): SideLetterSnapshot {
  return {
    investorLabel: row.investor_label,
    mfnEnabled: row.mfn_enabled,
    mfnScope: row.mfn_scope,
    effectiveDate: row.effective_date,
    expiryDate: row.expiry_date,
    renewalNote: row.renewal_note,
    documentReference: row.document_reference,
    terms: row.terms ?? [],
  };
}

export const listSideLetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const kind = await actorKind(db, context.userId, data.fundId);
    if (kind === "none") throw new Error("Forbidden: you do not have access to this fund.");

    const [{ data: letters }, { data: requests }, { data: reviews }, { data: events }, { data: onboardings }] =
      await Promise.all([
        db.from("side_letters").select("*").eq("offering_id", data.fundId).order("created_at"),
        db
          .from("side_letter_change_requests")
          .select("*")
          .eq("offering_id", data.fundId)
          .order("created_at", { ascending: false }),
        db.from("side_letter_mfn_reviews").select("*").eq("offering_id", data.fundId),
        db
          .from("side_letter_events")
          .select("id, side_letter_id, event, actor_id, detail, created_at")
          .eq("offering_id", data.fundId)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("investor_onboardings")
          .select(
            "id, person_id, offering_class_key, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, removed_at, persons(legal_first_name, legal_last_name, preferred_name)",
          )
          .eq("offering_id", data.fundId)
          .is("removed_at", null),
      ]);

    const obMap = new Map<string, any>(((onboardings ?? []) as any[]).map((o) => [o.id, o]));
    const commitment = (o: any) =>
      o ? (o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents ?? null) : null;

    const rows = ((letters ?? []) as any[]).map((l) => {
      const ob = l.onboarding_id ? obMap.get(l.onboarding_id) : null;
      const snap = toSnapshot(l);
      return {
        id: l.id as string,
        onboardingId: l.onboarding_id as string | null,
        status: l.status as string,
        version: l.current_version as number,
        snapshot: snap,
        expiry: expiryStatus(snap),
        classKey: (ob?.offering_class_key ?? null) as string | null,
        commitmentCents: commitment(ob) as number | null,
      };
    });

    const holders = rows.map((r) => ({
      sideLetterId: r.id,
      classKey: r.classKey,
      commitmentCents: r.commitmentCents,
      mfnEnabled: r.snapshot.mfnEnabled,
      mfnScope: r.snapshot.mfnScope,
      active: r.status === "active" && r.expiry !== "expired",
    }));
    const decided = new Set(
      ((reviews ?? []) as any[]).map((v) => `${v.source_side_letter_id}|${v.source_term_id}|${v.holder_side_letter_id}`),
    );
    const mfnQueue: { sourceId: string; termId: string; holderId: string }[] = [];
    for (const r of rows) {
      if (r.status !== "active") continue;
      const cands = mfnCandidates({ sideLetterId: r.id, classKey: r.classKey, commitmentCents: r.commitmentCents }, holders);
      for (const t of r.snapshot.terms) {
        if (t.category === "mfn") continue;
        for (const h of cands) if (!decided.has(`${r.id}|${t.id}|${h}`)) mfnQueue.push({ sourceId: r.id, termId: t.id, holderId: h });
      }
    }

    const nameOf = (o: any) => {
      const p = o.persons;
      const n = p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "";
      return n || "Unnamed investor";
    };

    return {
      userId: context.userId,
      actorKind: kind,
      canPropose: canPropose(kind),
      letters: rows,
      requests: ((requests ?? []) as any[]).map((r) => ({
        id: r.id as string,
        sideLetterId: r.side_letter_id as string,
        kind: r.kind as string,
        before: r.before_snapshot as SideLetterSnapshot | null,
        after: r.after_snapshot as SideLetterSnapshot,
        reason: r.reason as string,
        proposedBy: r.proposed_by as string,
        proposerKind: r.proposer_kind as string,
        status: r.status as string,
        decidedBy: r.decided_by as string | null,
        decidedAt: r.decided_at as string | null,
        decisionReason: r.decision_reason as string | null,
        createdAt: r.created_at as string,
        canDecide: r.status === "pending" && canApprove({ actorId: context.userId, actorKind: kind, proposedBy: r.proposed_by }),
      })),
      mfnQueue,
      mfnReviews: ((reviews ?? []) as any[]).map((v) => ({
        id: v.id as string,
        sourceId: v.source_side_letter_id as string,
        termId: v.source_term_id as string,
        holderId: v.holder_side_letter_id as string,
        decision: v.decision as string,
        reason: v.reason as string,
        createdAt: v.created_at as string,
      })),
      events: ((events ?? []) as any[]).map((e) => ({
        id: e.id as string,
        sideLetterId: e.side_letter_id as string | null,
        event: e.event as string,
        createdAt: e.created_at as string,
        reason: typeof e.detail?.reason === "string" ? (e.detail.reason as string) : null,
      })),
      investors: ((onboardings ?? []) as any[]).map((o) => ({ onboardingId: o.id as string, label: nameOf(o) })),
    };
  });

export const proposeSideLetterChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fundId: z.string().uuid(),
        sideLetterId: z.string().uuid().nullable(),
        onboardingId: z.string().uuid().nullable(),
        kind: z.enum(["create", "amend", "terminate"]),
        snapshot: snapshotSchema,
        reason: z.string().trim().min(3).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const kind = await actorKind(db, context.userId, data.fundId);
    if (!canPropose(kind)) throw new Error("Forbidden: you cannot propose side letter changes on this fund.");
    if (data.snapshot.mfnEnabled && !data.snapshot.mfnScope) throw new Error("Choose an MFN scope.");
    if (data.snapshot.expiryDate && data.snapshot.effectiveDate && data.snapshot.expiryDate < data.snapshot.effectiveDate)
      throw new Error("Expiry date must be after the effective date.");

    let letterId = data.sideLetterId;
    let before: SideLetterSnapshot | null = null;
    if (data.kind === "create") {
      let personId: string | null = null;
      if (data.onboardingId) {
        const { data: ob } = await db
          .from("investor_onboardings")
          .select("id, person_id, offering_id")
          .eq("id", data.onboardingId)
          .maybeSingle();
        if (!ob || ob.offering_id !== data.fundId) throw new Error("That investor is not on this fund.");
        personId = ob.person_id;
      }
      const { data: created, error } = await db
        .from("side_letters")
        .insert({
          offering_id: data.fundId,
          onboarding_id: data.onboardingId,
          person_id: personId,
          investor_label: data.snapshot.investorLabel,
          status: "proposed",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error("Could not create the side letter.");
      letterId = created.id;
    } else {
      if (!letterId) throw new Error("Choose a side letter.");
      const { data: row } = await db.from("side_letters").select("*").eq("id", letterId).maybeSingle();
      if (!row || row.offering_id !== data.fundId) throw new Error("Side letter not found.");
      if (row.status !== "active") throw new Error("Only active side letters can be amended or terminated.");
      before = toSnapshot(row);
      const { data: open } = await db
        .from("side_letter_change_requests")
        .select("id")
        .eq("side_letter_id", letterId)
        .eq("status", "pending")
        .limit(1);
      if ((open ?? []).length) throw new Error("This side letter already has a pending change.");
    }

    const { data: req, error } = await db
      .from("side_letter_change_requests")
      .insert({
        side_letter_id: letterId,
        offering_id: data.fundId,
        kind: data.kind,
        before_snapshot: before,
        after_snapshot: data.snapshot,
        reason: data.reason,
        proposed_by: context.userId,
        proposer_kind: kind,
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not record the proposal.");
    await db.from("side_letter_events").insert({
      offering_id: data.fundId,
      side_letter_id: letterId,
      event: `proposed_${data.kind}`,
      actor_id: context.userId,
      detail: { change_request_id: req.id, reason: data.reason },
    });
    return { ok: true, requestId: req.id as string };
  });

export const decideSideLetterChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "declined", "withdrawn"]),
        reason: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: req } = await db.from("side_letter_change_requests").select("*").eq("id", data.requestId).maybeSingle();
    if (!req || req.status !== "pending") throw new Error("That proposal is no longer pending.");
    const kind = await actorKind(db, context.userId, req.offering_id);

    if (data.decision === "withdrawn") {
      if (req.proposed_by !== context.userId) throw new Error("Only the proposer can withdraw.");
    } else {
      if (!canApprove({ actorId: context.userId, actorKind: kind, proposedBy: req.proposed_by }))
        throw new Error("You cannot decide this proposal. A different eligible person must approve it.");
      if (data.decision === "declined" && !data.reason?.trim()) throw new Error("A decline reason is required.");
    }

    const { error } = await db
      .from("side_letter_change_requests")
      .update({
        status: data.decision,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        decision_reason: data.reason?.trim() || null,
      })
      .eq("id", req.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message.includes("proposer") ? "You cannot decide your own proposal." : "Could not record the decision.");

    const { data: letter } = await db.from("side_letters").select("*").eq("id", req.side_letter_id).single();
    if (data.decision === "approved") {
      const s = req.after_snapshot as SideLetterSnapshot;
      const version = (letter.current_version ?? 0) + 1;
      await db.from("side_letter_versions").insert({
        side_letter_id: letter.id,
        version,
        snapshot: s,
        change_request_id: req.id,
      });
      await db
        .from("side_letters")
        .update({
          status: req.kind === "terminate" ? "terminated" : "active",
          investor_label: s.investorLabel,
          mfn_enabled: s.mfnEnabled,
          mfn_scope: s.mfnEnabled ? s.mfnScope : null,
          effective_date: s.effectiveDate,
          expiry_date: s.expiryDate,
          renewal_note: s.renewalNote,
          document_reference: s.documentReference,
          terms: s.terms,
          current_version: version,
          updated_at: new Date().toISOString(),
        })
        .eq("id", letter.id);
    } else if (req.kind === "create") {
      await db.from("side_letters").update({ status: "declined", updated_at: new Date().toISOString() }).eq("id", letter.id);
    }
    await db.from("side_letter_events").insert({
      offering_id: req.offering_id,
      side_letter_id: letter.id,
      event: `${data.decision}_${req.kind}`,
      actor_id: context.userId,
      detail: { change_request_id: req.id, reason: data.reason ?? null },
    });
    return { ok: true };
  });

export const recordMfnDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fundId: z.string().uuid(),
        sourceId: z.string().uuid(),
        termId: z.string().min(1).max(64),
        holderId: z.string().uuid(),
        decision: z.enum(MFN_DECISIONS),
        reason: z.string().trim().min(3).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const kind = await actorKind(db, context.userId, data.fundId);
    if (kind !== "staff" && kind !== "manager") throw new Error("Only Harmonious staff or fund managers record MFN decisions.");
    const { data: both } = await db.from("side_letters").select("id, offering_id").in("id", [data.sourceId, data.holderId]);
    if ((both ?? []).length !== 2 || (both as any[]).some((b) => b.offering_id !== data.fundId))
      throw new Error("Side letters not found on this fund.");
    await db.from("side_letter_mfn_reviews").insert({
      offering_id: data.fundId,
      source_side_letter_id: data.sourceId,
      source_term_id: data.termId,
      holder_side_letter_id: data.holderId,
      decision: data.decision,
      reason: data.reason,
      decided_by: context.userId,
    });
    await db.from("side_letter_events").insert({
      offering_id: data.fundId,
      side_letter_id: data.holderId,
      event: `mfn_${data.decision}`,
      actor_id: context.userId,
      detail: { source_side_letter_id: data.sourceId, term_id: data.termId, reason: data.reason },
    });
    return { ok: true };
  });

/** Read-only: side letters attached to one investor onboarding on a Fund. */
export const listInvestorSideLetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid(), onboardingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const kind = await actorKind(db, context.userId, data.fundId);
    if (kind === "none") throw new Error("Forbidden: you do not have access to this fund.");
    const { data: letters } = await db
      .from("side_letters")
      .select("*")
      .eq("offering_id", data.fundId)
      .eq("onboarding_id", data.onboardingId)
      .order("created_at");
    return ((letters ?? []) as any[]).map((l) => {
      const snap = toSnapshot(l);
      return {
        id: l.id as string,
        status: l.status as string,
        version: l.current_version as number,
        snapshot: snap,
        expiry: expiryStatus(snap),
      };
    });
  });
