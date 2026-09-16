import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Harmonious CapTable — Phase 6: compliance and audit history.
 *
 * The audit trail is read only. Every change already writes a dated event with
 * the actor, the entity it touched and the before/after state; nothing here
 * edits or deletes those rows, it only reads and filters them. Documents and
 * ledger transactions are folded into the same timeline so a company can show
 * an auditor one continuous record.
 */

/** A short, readable before/after line for the trail — the raw state stays in the database. */
function describeChange(previous: unknown, next: unknown) {
  const before = (previous ?? null) as Record<string, unknown> | null;
  const after = (next ?? null) as Record<string, unknown> | null;
  if (!after && !before) return null;
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const parts: string[] = [];
  for (const key of keys) {
    const from = before ? before[key] : undefined;
    const to = after ? after[key] : undefined;
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    const label = key.replace(/_/g, " ");
    const fromText = from === undefined || from === null ? "" : String(JSON.stringify(from)).slice(0, 60);
    const toText = to === undefined || to === null ? "—" : String(JSON.stringify(to)).slice(0, 60);
    parts.push(fromText ? `${label}: ${fromText} → ${toText}` : `${label}: ${toText}`);
  }
  return parts.length ? parts.slice(0, 6).join(" · ").replace(/"/g, "") : null;
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const getCapAuditHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        stakeholderId: z.string().uuid().optional().nullable(),
        entityType: z.string().trim().max(40).optional().nullable(),
        from: z.string().trim().max(20).optional().nullable(),
        to: z.string().trim().max(20).optional().nullable(),
        limit: z.number().int().min(50).max(1000).default(400),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = data.companyId;

    const [
      { data: company },
      { data: stakeholders },
      { data: securities },
      { data: documents },
      { data: classes },
    ] = await Promise.all([
      supabase
        .from("ct_companies")
        .select("id, name, legal_name, is_demo")
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("ct_stakeholders")
        .select("id, name, email, stakeholder_type")
        .eq("company_id", companyId)
        .order("name"),
      supabase
        .from("ct_securities")
        .select("id, stakeholder_id, security_type, label, quantity, status, verification_status, issue_date")
        .eq("company_id", companyId),
      supabase
        .from("ct_documents")
        .select("id, title, doc_type, linked_type, linked_id, status, created_at, updated_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase.from("ct_security_classes").select("id, name").eq("company_id", companyId),
    ]);

    if (!company) {
      return { company: null, stakeholders: [], entries: [], documents: [], summary: null };
    }

    let eventQuery = supabase
      .from("ct_events")
      .select("id, action, entity_type, entity_id, actor_id, previous_state, new_state, reason, occurred_at")
      .eq("company_id", companyId)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.entityType) eventQuery = eventQuery.eq("entity_type", data.entityType);
    if (data.from) eventQuery = eventQuery.gte("occurred_at", `${data.from}T00:00:00Z`);
    if (data.to) eventQuery = eventQuery.lte("occurred_at", `${data.to}T23:59:59Z`);

    let txQuery = supabase
      .from("ct_transactions")
      .select(
        "id, kind, quantity, amount, effective_date, status, reason, stakeholder_id, counterparty_stakeholder_id, security_id, created_at",
      )
      .eq("company_id", companyId)
      .order("effective_date", { ascending: false })
      .limit(data.limit);
    if (data.stakeholderId) txQuery = txQuery.eq("stakeholder_id", data.stakeholderId);
    if (data.from) txQuery = txQuery.gte("effective_date", data.from);
    if (data.to) txQuery = txQuery.lte("effective_date", data.to);

    const [{ data: events }, { data: transactions }] = await Promise.all([eventQuery, txQuery]);

    const holderById = new Map(((stakeholders ?? []) as any[]).map((s) => [s.id, s]));
    const securityById = new Map(((securities ?? []) as any[]).map((s) => [s.id, s]));
    const classById = new Map(((classes ?? []) as any[]).map((c) => [c.id, c]));

    function describeEntity(entityType: string | null, entityId: string | null) {
      if (!entityId) return null;
      if (entityType === "stakeholder") return holderById.get(entityId)?.name ?? null;
      if (entityType === "security") {
        const s = securityById.get(entityId);
        if (!s) return null;
        const holder = holderById.get(s.stakeholder_id);
        return `${holder?.name ?? "Holder"} · ${s.label ?? s.security_type}`;
      }
      if (entityType === "class") return classById.get(entityId)?.name ?? null;
      return null;
    }

    function stakeholderForEvent(entityType: string | null, entityId: string | null) {
      if (!entityId) return null;
      if (entityType === "stakeholder") return entityId;
      if (entityType === "security") return securityById.get(entityId)?.stakeholder_id ?? null;
      return null;
    }

    type Entry = {
      id: string;
      source: "event" | "transaction" | "document";
      occurredAt: string;
      action: string;
      entityType: string | null;
      entityLabel: string | null;
      stakeholderId: string | null;
      stakeholder: string | null;
      detail: string | null;
      reason: string | null;
      change: string | null;
      status: string | null;
    };

    const entries: Entry[] = [];

    for (const e of ((events ?? []) as any[])) {
      const stakeholderId = stakeholderForEvent(e.entity_type, e.entity_id);
      if (data.stakeholderId && stakeholderId !== data.stakeholderId) continue;
      entries.push({
        id: `event:${e.id}`,
        source: "event",
        occurredAt: e.occurred_at as string,
        action: e.action as string,
        entityType: (e.entity_type as string | null) ?? null,
        entityLabel: describeEntity(e.entity_type, e.entity_id),
        stakeholderId,
        stakeholder: stakeholderId ? (holderById.get(stakeholderId)?.name ?? null) : null,
        detail: null,
        reason: (e.reason as string | null) ?? null,
        change: describeChange(e.previous_state, e.new_state),
        status: null,
      });
    }

    for (const t of ((transactions ?? []) as any[])) {
      const holder = t.stakeholder_id ? holderById.get(t.stakeholder_id) : null;
      const counterparty = t.counterparty_stakeholder_id
        ? holderById.get(t.counterparty_stakeholder_id)
        : null;
      entries.push({
        id: `tx:${t.id}`,
        source: "transaction",
        occurredAt: (t.created_at as string) ?? `${t.effective_date}T00:00:00Z`,
        action: `ledger.${t.kind}`,
        entityType: "transaction",
        entityLabel: t.security_id ? describeEntity("security", t.security_id) : null,
        stakeholderId: (t.stakeholder_id as string | null) ?? null,
        stakeholder: holder?.name ?? null,
        detail: [
          `${n(t.quantity).toLocaleString()} units`,
          t.amount === null ? null : `${n(t.amount).toLocaleString()} value`,
          counterparty ? `counterparty ${counterparty.name}` : null,
          `effective ${t.effective_date}`,
        ]
          .filter(Boolean)
          .join(" · "),
        reason: (t.reason as string | null) ?? null,
        change: null,
        status: (t.status as string) ?? null,
      });
    }

    const docRows = ((documents ?? []) as any[])
      .map((d) => {
        const linkedSecurity = d.linked_type === "security" ? securityById.get(d.linked_id) : null;
        const stakeholderId =
          d.linked_type === "stakeholder"
            ? (d.linked_id as string)
            : (linkedSecurity?.stakeholder_id ?? null);
        return {
          id: d.id as string,
          title: d.title as string,
          docType: (d.doc_type as string | null) ?? null,
          linkedType: (d.linked_type as string | null) ?? null,
          linkedLabel: describeEntity(d.linked_type, d.linked_id),
          stakeholderId,
          stakeholder: stakeholderId ? (holderById.get(stakeholderId)?.name ?? null) : null,
          status: (d.status as string) ?? "recorded",
          createdAt: d.created_at as string,
        };
      })
      .filter((d) => (data.stakeholderId ? d.stakeholderId === data.stakeholderId : true))
      .filter((d) => (data.from ? d.createdAt >= `${data.from}T00:00:00Z` : true))
      .filter((d) => (data.to ? d.createdAt <= `${data.to}T23:59:59Z` : true));

    for (const d of docRows) {
      entries.push({
        id: `doc:${d.id}`,
        source: "document",
        occurredAt: d.createdAt,
        action: "document.filed",
        entityType: "document",
        entityLabel: d.linkedLabel,
        stakeholderId: d.stakeholderId,
        stakeholder: d.stakeholder,
        detail: [d.title, d.docType].filter(Boolean).join(" · "),
        reason: null,
        change: null,
        status: d.status,
      });
    }

    entries.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    const securityRows = ((securities ?? []) as any[]).filter((s) =>
      data.stakeholderId ? s.stakeholder_id === data.stakeholderId : true,
    );
    const documentedSecurityIds = new Set(
      ((documents ?? []) as any[])
        .filter((d) => d.linked_type === "security")
        .map((d) => d.linked_id as string),
    );

    const summary = {
      totalEntries: entries.length,
      events: entries.filter((e) => e.source === "event").length,
      ledgerEntries: entries.filter((e) => e.source === "transaction").length,
      documents: docRows.length,
      securities: securityRows.length,
      verified: securityRows.filter(
        (s) => s.verification_status === "verified" || s.verification_status === "verified_direct",
      ).length,
      unverified: securityRows.filter(
        (s) => s.verification_status !== "verified" && s.verification_status !== "verified_direct",
      ).length,
      pendingTransactions: ((transactions ?? []) as any[]).filter((t) => t.status === "pending").length,
      securitiesWithoutDocuments: securityRows.filter((s) => !documentedSecurityIds.has(s.id)).length,
      firstEntry: entries.length ? entries[entries.length - 1]!.occurredAt : null,
      lastEntry: entries.length ? entries[0]!.occurredAt : null,
    };

    return {
      company: {
        id: company.id as string,
        name: company.name as string,
        legalName: (company.legal_name as string | null) ?? null,
        isDemo: Boolean(company.is_demo),
      },
      stakeholders: ((stakeholders ?? []) as any[]).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        type: s.stakeholder_type as string,
      })),
      entries,
      documents: docRows,
      summary,
    };
  });
