import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const STAFF = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];

/** Archived documents + earlier versions with the investors each still applies to. Staff or this fund's managers only. Read-only. */
export const listArchivedFundDocumentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = context.userId;
    const [roles, mgr] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", uid),
      db.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", data.fundId),
    ]);
    if (roles.error || mgr.error) throw new Error("Access could not be checked.");
    const staff = ((roles.data ?? []) as any[]).some((r) => STAFF.includes(r.role));
    if (!staff && !(mgr.data ?? []).length) throw new Error("Only Harmonious or this fund's managers can see archived documents.");

    const [docsR, obsR, slR] = await Promise.all([
      db.from("offering_documents").select("id, title, active_version, removed_at, removed_reason, removed_by").eq("offering_id", data.fundId),
      db.from("investor_onboardings").select("id, application_id, persons(legal_first_name, legal_last_name, preferred_name), investment_profiles(legal_name)").eq("offering_id", data.fundId),
      db.from("side_letters").select("id, onboarding_id, investor_label, status, effective_date, current_version, created_at").eq("offering_id", data.fundId),
    ]);
    if (docsR.error || obsR.error) throw new Error("Archived documents couldn't be loaded.");
    const docs = (docsR.data ?? []) as any[];
    const obs = (obsR.data ?? []) as any[];
    const names: Record<string, string> = {};
    const appToOb: Record<string, string> = {};
    for (const o of obs) {
      const p = o.persons;
      const n = p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "";
      names[o.id] = o.investment_profiles?.legal_name ? `${n || "Investor"} (${o.investment_profiles.legal_name})` : n || "Unnamed investor";
      if (o.application_id) appToOb[o.application_id] = o.id;
    }
    const docIds = docs.map((d) => d.id);
    const obIds = obs.map((o) => o.id);
    const none = Promise.resolve({ data: [] as any[] });
    const [versR, ackR, sigR, prior2]: any[] = await Promise.all([
      docIds.length ? db.from("offering_document_versions").select("offering_document_id, version, file_name, created_at, superseded_at").in("offering_document_id", docIds) : none,
      docIds.length ? db.from("investment_document_acknowledgments").select("offering_document_id, version, onboarding_id, acknowledged_at").in("offering_document_id", docIds) : none,
      docIds.length ? db.from("document_signatures").select("offering_document_id, application_id, signature_template_version, signed_at").in("offering_document_id", docIds).is("cancelled_at", null).not("signed_at", "is", null) : none,
      obIds.length ? db.from("prior_signed_documents").select("onboarding_id, title, document_kind, signed_on").in("onboarding_id", obIds) : none,
    ]);
    const removerIds = [...new Set(docs.map((d) => d.removed_by).filter(Boolean))];
    const { data: profs } = removerIds.length ? await db.from("profiles").select("id, email").in("id", removerIds) : { data: [] };
    const who = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.email || null]));

    const evidence = [
      ...((ackR.data ?? []) as any[]).map((a) => ({ offering_document_id: a.offering_document_id, version: a.version, onboarding_id: a.onboarding_id, at: a.acknowledged_at, kind: "acknowledged" as const })),
      ...((sigR.data ?? []) as any[]).filter((s) => appToOb[s.application_id]).map((s) => ({ offering_document_id: s.offering_document_id, version: s.signature_template_version, onboarding_id: appToOb[s.application_id], at: s.signed_at, kind: "signed" as const })),
    ].filter((e) => names[e.onboarding_id]);

    const { archivedApplicability } = await import("@/lib/archived-document-applicability");
    const items = archivedApplicability(docs.map((d) => ({ ...d, removed_by_name: d.removed_by ? who.get(d.removed_by) ?? null : null })), (versR.data ?? []) as any[], evidence, names);

    const sideLetters = ((slR.data ?? []) as any[]).filter((s) => ["terminated", "withdrawn", "expired"].includes(String(s.status))).map((s) => ({
      id: s.id, status: s.status, version: s.current_version, onboardingId: s.onboarding_id, investor: s.onboarding_id ? names[s.onboarding_id] ?? s.investor_label : s.investor_label,
    }));
    const priorSigned = ((prior2.data ?? []) as any[]).map((p) => ({ onboardingId: p.onboarding_id, investor: names[p.onboarding_id] ?? "Unnamed investor", title: p.title, signedOn: p.signed_on }));
    return { items, sideLetters, priorSigned };
  });
