/**
 * Form SS-4 signature requests. Harmonious staff prefill every SS-4 line from the
 * fund record and send it to one of the fund's managers, who reviews, adds the
 * Responsible Party SSN/ITIN (encrypted vault only) and signs electronically.
 * Nothing is filed with the IRS automatically: staff file the signed form by hand.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { parseAddressParts } from "@/lib/address";

const SITE = "https://app.harmonious.co";
const TEAM_EMAIL = "operations@harmonious.co";

const formSchema = z.record(z.string(), z.union([z.string().max(200), z.boolean()]));

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}


function strip(ss4: Record<string, unknown>) {
  const { responsible_party_tin: _a, responsible_party_tin_last4: _b, ...rest } = (ss4 ?? {}) as any;
  return rest as Record<string, string | boolean>;
}

function usDate(iso: string | null | undefined) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

function splitAddress(addr: string | null | undefined): [string, string] {
  const p = parseAddressParts(addr);
  const street = [p.addressLine1, p.addressLine2].map((x) => x.trim()).filter(Boolean).join(", ");
  const cityStateZip = [
    p.addressCity.trim(),
    [p.addressState.trim(), p.addressZip.trim()].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  return [street, cityStateZip];
}

/** Staff, or a manager of this exact fund. */
async function requireStaffOrManager(userId: string, offeringId: string) {
  const { setupActor } = await import("@/lib/fund-setup.server");
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) throw new Error("Forbidden: you do not manage that fund.");
}

/** Possible SS-4 signers: the fund's managers plus the chosen fund signatory (if they have a login). */
async function managersOf(db: any, offeringId: string) {
  const [{ data: fm }, { data: o }] = await Promise.all([
    db.from("fund_managers").select("user_id").eq("offering_id", offeringId),
    db.from("offerings").select("fund_signatory_person_id").eq("id", offeringId).maybeSingle(),
  ]);
  const sigUser = o?.fund_signatory_person_id ? (await db.from("persons").select("user_id").eq("id", o.fund_signatory_person_id).maybeSingle()).data?.user_id : null;
  const ids = [...new Set([sigUser, ...((fm ?? []) as any[]).map((r) => r.user_id)].filter(Boolean))];
  if (!ids.length) return [] as { userId: string; name: string; email: string | null; phone: string | null }[];
  const { data: profs } = await db.from("profiles").select("user_id, legal_name, email, phone").in("user_id", ids);
  const byId = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p]));
  return ids.map((id) => {
    const p: any = byId.get(id) ?? {};
    return { userId: id as string, name: (p.legal_name || p.email || "Fund manager") as string, email: (p.email ?? null) as string | null, phone: (p.phone ?? null) as string | null };
  });
}

/** Build the SS-4 from the fund record; values already saved on the fund win. */
async function prefill(context: any, offeringId: string, signer?: { name: string; phone: string | null }) {
  const db = await admin();
  const { data: o } = await db.from("offerings").select("name, legal_entity_name, entity_type, state_formed, date_formed, principal_address, signatory_title, gp_entity_name").eq("id", offeringId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  const { data: detail } = await context.supabase.rpc("get_offering_entity_details", { p_offering_id: offeringId }).maybeSingle();
  const saved = strip((detail as any)?.ss4 ?? {});
  const [street, cityStateZip] = splitAddress(o.principal_address);
  const entity = String(o.entity_type ?? "");
  const isLlc = /llc/i.test(entity) || /llc/i.test(String(o.legal_entity_name ?? o.name ?? ""));
  const title = (o.signatory_title as string | null) || (isLlc ? "Managing Member" : "General Partner");
  const base: Record<string, string | boolean> = {
    legal_name: (o.legal_entity_name || o.name || "") as string,
    mailing_street: street,
    mailing_city_state_zip: cityStateZip,
    street_address: street,
    street_city_state_zip: cityStateZip,
    county_state: "",
    responsible_party_name: signer?.name ?? "",
    is_llc: isLlc,
    llc_members: "",
    llc_us_organized: true,
    entity_kind: "partnership",
    entity_detail: "",
    state_incorporated: (o.state_formed ?? "") as string,
    reason: "started_business",
    reason_detail: "Investment fund",
    date_started: usDate(o.date_formed),
    closing_month: "December",
    employees_agricultural: "0",
    employees_household: "0",
    employees_other: "0",
    first_wages_date: "N/A",
    principal_activity: "finance_insurance",
    principal_activity_other: "",
    principal_line: "Pooled investment fund (private investment vehicle)",
    previous_ein_applied: false,
    applicant_name_title: signer ? `${signer.name}, ${title}` : "",
    applicant_phone: signer?.phone ?? "",
  };
  const merged: Record<string, string | boolean> = { ...base };
  for (const [k, v] of Object.entries(saved)) {
    if (typeof v === "boolean" || String(v ?? "").trim()) merged[k] = v as any;
  }
  return merged;
}

export const ss4RequestContextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid(), signerUserId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireStaffOrManager(context.userId, data.offeringId);
    const db = await admin();
    const managers = await managersOf(db, data.offeringId);
    const signer = managers.find((m) => m.userId === data.signerUserId) ?? managers[0];
    const form = await prefill(context, data.offeringId, signer ? { name: signer.name, phone: signer.phone } : undefined);
    const { data: reqs } = await db.from("ss4_signature_requests").select("id, signer_user_id, status, created_at, signed_at, signer_name, signer_title, signed_pdf_path").eq("offering_id", data.offeringId).order("created_at", { ascending: false });
    const names = new Map(managers.map((m) => [m.userId, m.name]));
    return {
      managers: managers.map((m) => ({ userId: m.userId, name: m.name, email: m.email })),
      signerUserId: signer?.userId ?? null,
      form,
      requests: ((reqs ?? []) as any[]).map((r) => ({ id: r.id as string, signer: (names.get(r.signer_user_id) ?? "Former manager") as string, status: r.status as string, createdAt: r.created_at as string, signedAt: (r.signed_at ?? null) as string | null, signedBy: r.signer_name ? `${r.signer_name}${r.signer_title ? `, ${r.signer_title}` : ""}` : null, hasPdf: Boolean(r.signed_pdf_path) })),
    };
  });

export const sendSs4RequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid(), signerUserId: z.string().uuid(), form: formSchema, note: z.string().trim().max(1000).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireStaffOrManager(context.userId, data.offeringId);
    const db = await admin();
    const managers = await managersOf(db, data.offeringId);
    const signer = managers.find((m) => m.userId === data.signerUserId);
    if (!signer) throw new Error("That person isn't a manager or the signatory of this fund.");
    const form = strip(data.form);
    if (!String(form["legal_name"] ?? "").trim()) throw new Error("Add the legal name of the entity (line 1) first.");
    // One open request per fund: older open requests are cancelled, never deleted.
    await db.from("ss4_signature_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: context.userId }).eq("offering_id", data.offeringId).eq("status", "requested");
    const { data: row, error } = await db.from("ss4_signature_requests").insert({ offering_id: data.offeringId, requested_by: context.userId, signer_user_id: signer.userId, form_data: form, note: data.note || null }).select("id").single();
    if (error) throw new Error(error.message);
    let emailed = false;
    if (signer.email) {
      try {
        const { data: o } = await db.from("offerings").select("name").eq("id", data.offeringId).maybeSingle();
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        await sendTemplateEmail("manager-alert", signer.email, {
          idempotencyKey: `ss4-request:${row.id}`,
          templateData: {
            managerName: signer.name,
            headline: "Please review and sign your Form SS-4",
            intro: "Harmonious has filled in the IRS Form SS-4 to get your fund's EIN. Please check each line, add the Responsible Party SSN or ITIN, and sign.",
            offeringName: o?.name ?? "your fund",
            details: [{ label: "Form", value: "IRS Form SS-4 (EIN application)" }, ...(data.note ? [{ label: "Note from Harmonious", value: data.note }] : [])],
            portalUrl: `${SITE}/manager/ss4/${row.id}`,
          },
        });
        emailed = true;
      } catch (e) {
        console.error("SS-4 request email failed", e);
      }
    }
    return { id: row.id as string, emailed, signerEmail: signer.email };
  });

export const cancelSs4RequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await admin();
    const { data: row } = await db.from("ss4_signature_requests").select("offering_id").eq("id", data.requestId).maybeSingle();
    if (!row) throw new Error("Request not found.");
    await requireStaffOrManager(context.userId, row.offering_id);
    const { error } = await db.from("ss4_signature_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: context.userId }).eq("id", data.requestId).eq("status", "requested");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadForSigner(userId: string, requestId: string) {
  const db = await admin();
  const { data: r } = await db.from("ss4_signature_requests").select("*").eq("id", requestId).maybeSingle();
  if (!r || r.signer_user_id !== userId) throw new Error("This SS-4 request isn't addressed to you.");
  const signers = await managersOf(db, r.offering_id);
  if (!signers.some((m) => m.userId === userId)) throw new Error("You are no longer a manager or signatory of this fund.");
  return { db, r };
}

export const getSs4SignRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db, r } = await loadForSigner(context.userId, data.requestId);
    const { data: o } = await db.from("offerings").select("name").eq("id", r.offering_id).maybeSingle();
    const { rpIdentifierMeta } = await import("@/lib/responsible-party-identifier.server");
    const meta = await rpIdentifierMeta(r.offering_id);
    return {
      id: r.id as string,
      offeringId: r.offering_id as string,
      fundName: (o?.name ?? "Your fund") as string,
      status: r.status as string,
      note: (r.note ?? null) as string | null,
      form: strip(r.form_data ?? {}),
      tinOnFile: meta.onFile,
      tinLast4: meta.last4,
      signedAt: (r.signed_at ?? null) as string | null,
      signedBy: (r.signer_name ?? null) as string | null,
    };
  });

export const signSs4RequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      requestId: z.string().uuid(),
      signerName: z.string().trim().min(2).max(120),
      signerTitle: z.string().trim().min(2).max(80),
      phone: z.string().trim().max(40).default(""),
      responsiblePartyTin: z.string().trim().max(20).default(""),
      consent: z.literal(true),
      userAgent: z.string().max(400).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, r } = await loadForSigner(context.userId, data.requestId);
    if (r.status !== "requested") throw new Error("This request was already signed or cancelled.");
    const rp = await import("@/lib/responsible-party-identifier.server");
    if (data.responsiblePartyTin) {
      if (rp.normalizeRpTin(data.responsiblePartyTin).length !== 9) throw new Error("An SSN or ITIN has 9 digits.");
      await rp.storeRpIdentifier(r.offering_id, data.responsiblePartyTin, context.userId);
    }
    if (!(await rp.rpIdentifierMeta(r.offering_id)).onFile) throw new Error("Add the Responsible Party SSN or ITIN (line 7b) to sign.");

    const signedAt = new Date();
    const form = { ...strip(r.form_data ?? {}), applicant_name_title: `${data.signerName}, ${data.signerTitle}`, ...(data.phone ? { applicant_phone: data.phone } : {}) };
    const { fillSs4Pdf } = await import("@/lib/ss4-pdf.server");
    const tin = (await rp.readRpIdentifierForAuthorizedOperation(r.offering_id)) ?? "";
    const bytes = await fillSs4Pdf({ ...form, responsible_party_tin: tin } as any, { signature: data.signerName, signedDate: signedAt.toLocaleDateString("en-US") });
    const path = `${r.offering_id}/form-ss4-signed-${signedAt.getTime()}.pdf`;
    const { error: upErr } = await db.storage.from("fund-formation").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { error } = await db.from("ss4_signature_requests").update({ status: "signed", signer_name: data.signerName, signer_title: data.signerTitle, signed_at: signedAt.toISOString(), signed_user_agent: data.userAgent ?? null, signed_pdf_path: path, form_data: form }).eq("id", r.id).eq("status", "requested");
    if (error) throw new Error(error.message);

    // Put the signed PDF in the fund's Documents list as a permanently kept, signed file.
    const { BUCKET: FILES_BUCKET } = await import("@/lib/fund-tabs.server");
    const filesPath = `fund-files/${r.offering_id}/${crypto.randomUUID()}/Form_SS-4_signed.pdf`;
    const { error: fUp } = await db.storage.from(FILES_BUCKET).upload(filesPath, bytes, { contentType: "application/pdf", upsert: false });
    if (fUp) console.error("SS-4 fund file upload failed", fUp);
    else {
      const { error: fIns } = await db.from("fund_files").insert({ offering_id: r.offering_id, title: `Form SS-4 (signed by ${data.signerName})`, category: "uploaded", file_name: "Form_SS-4_signed.pdf", storage_path: filesPath, content_type: "application/pdf", size_bytes: bytes.byteLength, uploaded_by: context.userId, status: "signed" });
      if (fIns) console.error("SS-4 fund file record failed", fIns);
    }
    try {
      const { logFundAudit } = await import("@/lib/fund-audit.server");
      await logFundAudit(context.userId, { offeringId: r.offering_id, eventType: "ss4_signed", summary: `Form SS-4 signed by ${data.signerName}`, values: { signer: `${data.signerName}, ${data.signerTitle}`, signedAt: signedAt.toISOString() } });
    } catch { /* best-effort */ }

    // Keep the fund's SS-4 answers and current form in step (manager-authorised RPCs, EIN untouched).
    try {
      const { data: detail } = await context.supabase.rpc("get_offering_entity_details", { p_offering_id: r.offering_id }).maybeSingle();
      await context.supabase.rpc("save_offering_entity_details", { p_offering_id: r.offering_id, p_has_ein: Boolean((detail as any)?.has_ein), p_ein: String((detail as any)?.ein ?? ""), p_ss4: form as any });
      await context.supabase.rpc("save_offering_ss4_file", { p_offering_id: r.offering_id, p_path: path });
    } catch (e) {
      console.error("SS-4 fund record sync failed", e);
    }
    try {
      const { data: o } = await db.from("offerings").select("name").eq("id", r.offering_id).maybeSingle();
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("ops-review-request", TEAM_EMAIL, { idempotencyKey: `ss4-signed:${r.id}`, templateData: { itemLabel: "Signed Form SS-4", fundName: o?.name ?? "A fund", detail: `${data.signerName} signed the Form SS-4. Review it and file it with the IRS by hand.`, raisedBy: data.signerName, portalUrl: `${SITE}/ops/fund/${r.offering_id}?tab=formation` } });
    } catch (e) {
      console.error("SS-4 signed email failed", e);
    }
    return { ok: true };
  });

export const ss4SignedPdfUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await admin();
    const { data: r } = await db.from("ss4_signature_requests").select("offering_id, signer_user_id, signed_pdf_path").eq("id", data.requestId).maybeSingle();
    if (!r?.signed_pdf_path) throw new Error("No signed form yet.");
    if (r.signer_user_id !== context.userId) await requireStaffOrManager(context.userId, r.offering_id);
    const { data: signed, error } = await db.storage.from("fund-formation").createSignedUrl(r.signed_pdf_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });
