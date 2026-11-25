/**
 * Fund Compliance tab extras: SEC CIK/CCC, accession numbers, filing prep,
 * links and files. Record and prepare only; nothing is filed or paid.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { normalizeCik, isAccession, isCcc, prepareFiling, edgarFilingUrl, ALL_FORMS } from "@/lib/sec-form-model";

const srv = () => import("@/lib/fund-tabs.server");
const fund = z.object({ fundId: z.string().uuid() });

export const fundComplianceFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(fund.parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const [{ data: ids }, { data: o }, { data: filings }, { data: items }] = await Promise.all([
      d.from("fund_sec_identifiers").select("cik, ccc_last2, updated_at").eq("offering_id", data.fundId).maybeSingle(),
      d.from("offerings").select("legal_entity_name, name, reg_type, principal_address, state_formed, entity_type, date_formed, max_offering_cents, target_raise_cents, first_sale_on, signatory_entity_name, fund_signatory_person_id").eq("id", data.fundId).maybeSingle(),
      d.from("fund_regulatory_filings").select("id, form_type, filing_type, filing_kind, filing_date, accession_number, edgar_url, notes").eq("offering_id", data.fundId).is("removed_at", null).order("filing_date", { ascending: false, nullsFirst: false }),
      d.from("fund_compliance_links").select("id, kind, label, url, file_name, created_at").eq("offering_id", data.fundId).is("removed_at", null).order("created_at", { ascending: false }),
    ]);
    const sec = ((filings ?? []) as any[]).filter((f) => f.form_type || /form/i.test(f.filing_type ?? ""));
    const prep = prepareFiling({
      name: o?.legal_entity_name || o?.name, cik: ids?.cik, address: o?.principal_address, state: o?.state_formed, entityType: o?.entity_type, dateFormed: o?.date_formed,
      regType: o?.reg_type, maxOfferingCents: o?.max_offering_cents ?? o?.target_raise_cents, firstSaleOn: o?.first_sale_on, signer: o?.fund_signatory_person_id || o?.signatory_entity_name, soldCents: 0, investors: 0, accredited: 0,
    }, sec.map((f) => f.form_type || "Form D"));
    return { staff: a.staff, cik: ids?.cik ?? null, cccLast2: ids?.ccc_last2 ?? null, regType: o?.reg_type ?? null, filings: sec, items: (items ?? []) as any[], prep,
      draft: { name: o?.legal_entity_name || o?.name, address: o?.principal_address, state: o?.state_formed, entityType: o?.entity_type, dateFormed: o?.date_formed, maxOfferingCents: o?.max_offering_cents ?? o?.target_raise_cents, firstSaleOn: o?.first_sale_on } };
  });

export const saveSecIdentifiersFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ cik: z.string().max(20), ccc: z.string().max(20), reason: z.string().max(300) }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const cik = data.cik.trim() ? normalizeCik(data.cik) : null;
    if (data.cik.trim() && !cik) throw new Error("CIK must be up to 10 digits.");
    const ccc = data.ccc.trim();
    if (ccc && !isCcc(ccc)) throw new Error("CCC must be 8 characters.");
    const { data: cur } = await d.from("fund_sec_identifiers").select("cik, ccc_last2").eq("offering_id", data.fundId).maybeSingle();
    const changing = (cur?.cik && cik !== cur.cik) || (cur?.ccc_last2 && ccc);
    if (changing && data.reason.trim().length < 3) throw new Error("Give a reason for changing a saved number.");
    const row: any = { offering_id: data.fundId, cik: cik ?? cur?.cik ?? null, ccc_last2: ccc ? ccc.slice(-2) : cur?.ccc_last2 ?? null, updated_by: context.userId, updated_at: new Date().toISOString() };
    const { error } = await d.from("fund_sec_identifiers").upsert(row); if (error) throw new Error("Couldn't save.");
    if (ccc) await d.from("fund_sec_ccc_private").upsert({ offering_id: data.fundId, ccc, updated_at: row.updated_at });
    await d.from("fund_sec_identifier_events").insert({ offering_id: data.fundId, actor: context.userId, action: ccc ? "saved_cik_ccc" : "saved_cik", reason: data.reason || null, old_cik: cur?.cik ?? null, new_cik: row.cik });
    return { ok: true };
  });

export const revealCccFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ reason: z.string().trim().min(3).max(300) }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); const a = await s.assertFund(context.userId, data.fundId);
    if (!a.staff) throw new Error("Only Harmonious staff can view the CCC.");
    const d = await s.db();
    const { data: r } = await d.from("fund_sec_ccc_private").select("ccc").eq("offering_id", data.fundId).maybeSingle();
    if (!r) throw new Error("No CCC saved.");
    await d.from("fund_sec_identifier_events").insert({ offering_id: data.fundId, actor: context.userId, action: "revealed_ccc", reason: data.reason });
    return { ccc: r.ccc as string };
  });

export const saveSecFilingFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ formType: z.enum(ALL_FORMS as [string, ...string[]]), filedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), accession: z.string().max(30), notes: z.string().max(500) }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const acc = data.accession.trim();
    if (acc && !isAccession(acc)) throw new Error("Accession number looks like 0001234567-26-000123.");
    const { data: ids } = await d.from("fund_sec_identifiers").select("cik").eq("offering_id", data.fundId).maybeSingle();
    const { error } = await d.from("fund_regulatory_filings").insert({ offering_id: data.fundId, filing_type: data.formType === "Form D" || data.formType === "Form D/A" ? "form_d" : data.formType, form_type: data.formType,
      filing_kind: /\/A$/.test(data.formType) ? "amendment" : "initial", filing_date: data.filedOn, accession_number: acc || null,
      edgar_url: acc && ids?.cik ? edgarFilingUrl(ids.cik, acc) : null, notes: data.notes || null, recorded_by: context.userId });
    if (error) throw new Error("Couldn't save.");
    return { ok: true };
  });

export const saveComplianceLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ label: z.string().trim().min(1).max(120), url: z.string().url().max(1000) }).parse)
  .handler(async ({ data, context }) => {
    if (!/^https?:\/\//i.test(data.url)) throw new Error("Use a web link starting with https://");
    const s = await srv(); await s.assertFund(context.userId, data.fundId);
    const { error } = await (await s.db()).from("fund_compliance_links").insert({ offering_id: data.fundId, kind: "link", label: data.label, url: data.url, created_by: context.userId });
    if (error) throw new Error("Couldn't save."); return { ok: true };
  });

export const uploadComplianceFileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(fund.extend({ label: z.string().trim().min(1).max(120), fileName: z.string().min(1).max(200), contentType: z.string().max(100), base64: z.string().max(36_000_000) }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const safe = data.fileName.replace(/[^\w.\-]+/g, "_");
    const path = `${data.fundId}/${crypto.randomUUID()}-${safe}`;
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const up = await d.storage.from("fund-compliance").upload(path, bytes, { contentType: data.contentType || "application/octet-stream" });
    if (up.error) throw new Error("Upload failed.");
    const { error } = await d.from("fund_compliance_links").insert({ offering_id: data.fundId, kind: "file", label: data.label, file_path: path, file_name: data.fileName, created_by: context.userId });
    if (error) throw new Error("Couldn't save."); return { ok: true };
  });

export const openComplianceFileFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(fund.extend({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId); const d = await s.db();
    const { data: r } = await d.from("fund_compliance_links").select("file_path").eq("id", data.id).eq("offering_id", data.fundId).is("removed_at", null).maybeSingle();
    if (!r?.file_path) throw new Error("File not found.");
    const { data: u } = await d.storage.from("fund-compliance").createSignedUrl(r.file_path, 300);
    return { url: u?.signedUrl as string };
  });

export const removeComplianceItemFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(fund.extend({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const s = await srv(); await s.assertFund(context.userId, data.fundId);
    await (await s.db()).from("fund_compliance_links").update({ removed_at: new Date().toISOString(), removed_by: context.userId }).eq("id", data.id).eq("offering_id", data.fundId);
    return { ok: true };
  });
