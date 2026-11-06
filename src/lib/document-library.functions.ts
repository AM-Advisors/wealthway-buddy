import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { autoTags, cleanCheck, normalizeTag, sectionFor, type DocSource, type LibraryDoc } from "@/lib/document-sections";

const scopeSchema = z.object({ investorUserId: z.string().uuid().optional(), offeringId: z.string().uuid().optional() })
  .refine((v) => !!v.investorUserId !== !!v.offeringId, "Choose an investor or a fund.");

async function staffCheck(context: any) {
  const { data } = await context.supabase.rpc("is_any_staff");
  return data === true;
}

/** One document library for Investor 360 (staff) and the fund Documents page (staff or that fund's team). Read-only. */
export const getDocumentLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scopeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const staff = await staffCheck(context);
    if (data.investorUserId && !staff) throw new Error("Investor 360 documents are for Harmonious staff.");
    if (data.offeringId) {
      const { assertFund } = await import("@/lib/fund-tabs.server");
      await assertFund(context.userId, data.offeringId);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const by = (q: any) => (data.investorUserId ? q.eq(q.__col ?? "", "") : q);
    void by;

    const obQ = db.from("investor_onboardings").select("id, application_id, investor_user_id, offering_id").is("removed_at", null);
    const { data: obs } = data.investorUserId ? await obQ.eq("investor_user_id", data.investorUserId) : await obQ.eq("offering_id", data.offeringId);
    const onboardings = (obs ?? []) as any[];
    const obById = new Map(onboardings.map((o) => [o.id, o]));
    const obByApp = new Map(onboardings.filter((o) => o.application_id).map((o) => [o.application_id, o]));
    const appIds = [...obByApp.keys()];

    const scope = (q: any, userCol: string) => (data.investorUserId ? q.eq(userCol, data.investorUserId) : q.eq("offering_id", data.offeringId));
    const [idocs, tdocs, k1s, sigs] = await Promise.all([
      scope(db.from("investor_documents").select("id, user_id, offering_id, onboarding_id, doc_kind, file_name, review_status, uploaded_at"), "user_id").order("uploaded_at", { ascending: false }).limit(500),
      scope(db.from("fund_tax_documents").select("id, investor_user_id, offering_id, doc_type, tax_year, file_name, review_status, created_at"), "investor_user_id").limit(500),
      scope(db.from("k1_forms").select("id, investor_user_id, offering_id, investment_profile_id, tax_year, status, version, supersedes_id, delivered_at, created_at"), "investor_user_id").limit(500),
      appIds.length ? db.from("document_signatures").select("id, application_id, offering_document_id, template_version_id, provider_status, signed_at, executed_at, cancelled_at, superseded_by, provider_sent_at").in("application_id", appIds) : { data: [] },
    ]);
    const sigRows = (sigs.data ?? []) as any[];
    const odIds = [...new Set(sigRows.map((s) => s.offering_document_id).filter(Boolean))];
    const { data: ods } = odIds.length ? await db.from("offering_documents").select("id, title, doc_type").in("id", odIds) : { data: [] };
    const odById = new Map(((ods ?? []) as any[]).map((o) => [o.id, o]));
    const { sealedIds } = await import("@/lib/sealed-records.server");
    const sealed = await sealedIds(db, "document_template_versions");

    const docs: LibraryDoc[] = [];
    for (const d of (idocs.data ?? []) as any[]) {
      const ob = d.onboarding_id ? obById.get(d.onboarding_id) : null;
      const st = String(d.review_status ?? "");
      docs.push({ source: "investor_document", id: d.id, title: d.file_name ?? d.doc_kind ?? "Document", kind: d.doc_kind ?? "", investorUserId: d.user_id, offeringId: d.offering_id, onboardingId: d.onboarding_id,
        linkedInvestorUserId: ob?.investor_user_id ?? null, linkedOfferingId: ob?.offering_id ?? null, taxYear: null, date: d.uploaded_at, status: st || null,
        signed: false, replaced: /supersed|replaced|rejected/.test(st) });
    }
    for (const d of (tdocs.data ?? []) as any[]) {
      const st = String(d.review_status ?? "");
      const replaced = /supersed|replaced|rejected/.test(st);
      docs.push({ source: "tax_document", id: d.id, title: d.file_name ?? d.doc_type ?? "Tax document", kind: d.doc_type ?? "", investorUserId: d.investor_user_id, offeringId: d.offering_id, onboardingId: null,
        taxYear: d.tax_year ?? null, date: d.created_at, status: st || null, signed: false, replaced,
        slotKey: d.investor_user_id ? `tax|${d.investor_user_id}|${d.offering_id}|${String(d.doc_type).toLowerCase()}|${d.tax_year ?? ""}` : null });
    }
    const k1Rows = (k1s.data ?? []) as any[];
    const supersededK1 = new Set(k1Rows.map((k) => k.supersedes_id).filter(Boolean));
    for (const k of k1Rows) {
      docs.push({ source: "k1", id: k.id, title: `K-1 ${k.tax_year}${k.version ? ` v${k.version}` : ""}`, kind: "k1", investorUserId: k.investor_user_id, offeringId: k.offering_id, onboardingId: null,
        taxYear: k.tax_year ?? null, date: k.delivered_at ?? k.created_at, status: k.status, signed: false, replaced: supersededK1.has(k.id) || /supersed|void/.test(String(k.status)),
        slotKey: `k1|${k.investor_user_id}|${k.offering_id}|${k.investment_profile_id}|${k.tax_year}` });
    }
    for (const s of sigRows) {
      if (s.template_version_id && sealed.has(s.template_version_id)) continue;
      const ob = obByApp.get(s.application_id);
      const od = odById.get(s.offering_document_id);
      docs.push({ source: "signature", id: s.id, title: od?.title ?? "Signed document", kind: od?.doc_type ?? "signature", investorUserId: ob?.investor_user_id ?? null, offeringId: ob?.offering_id ?? null, onboardingId: ob?.id ?? null,
        taxYear: null, date: s.executed_at ?? s.signed_at ?? s.provider_sent_at, status: s.provider_status,
        signed: !!(s.signed_at || s.executed_at), replaced: !!(s.cancelled_at || s.superseded_by),
        slotKey: `sig|${s.application_id}|${s.offering_document_id}` });
    }

    let tags: Record<string, { id: string; tag: string }[]> = {};
    if (staff && docs.length) {
      const { data: t } = await db.from("document_staff_tags").select("id, doc_id, doc_source, tag").is("removed_at", null).in("doc_id", docs.map((d) => d.id));
      for (const r of (t ?? []) as any[]) (tags[`${r.doc_source}:${r.doc_id}`] ??= []).push({ id: r.id, tag: r.tag });
    }
    const year = new Date().getUTCFullYear();
    return {
      staff,
      docs: docs.map((d) => ({ ...d, section: sectionFor(d.source, d.kind, d.title), autoTags: autoTags(d, year) as string[], staffTags: tags[`${d.source}:${d.id}`] ?? [] })),
      issues: cleanCheck(docs),
    };
  });

const tagSchema = z.object({ source: z.enum(["investor_document", "tax_document", "k1", "signature"]), docId: z.string().uuid(), tag: z.string() });

export const addDocumentTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tagSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await staffCheck(context))) throw new Error("Only Harmonious staff can tag documents.");
    const tag = normalizeTag(data.tag);
    if (!tag) throw new Error("Tags need 1 to 40 characters.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("document_staff_tags").insert({ doc_source: data.source as DocSource, doc_id: data.docId, tag, created_by: context.userId });
    if (error && !/duplicate/i.test(error.message)) throw new Error("The tag could not be saved.");
    return { ok: true };
  });

export const removeDocumentTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tagId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await staffCheck(context))) throw new Error("Only Harmonious staff can tag documents.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("document_staff_tags").update({ removed_at: new Date().toISOString(), removed_by: context.userId }).eq("id", data.tagId).is("removed_at", null);
    if (error) throw new Error("The tag could not be removed.");
    return { ok: true };
  });
