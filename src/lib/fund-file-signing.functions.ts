/**
 * Signing for generated fund documents: investor signs first, then the fund manager.
 * Each signer gets an email link and must be signed in with that email. Once every
 * signer has signed, the document is marked Signed. Signed rows are never edited.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const SITE = "https://app.harmonious.co";
const TEAM_EMAIL = "operations@harmonious.co";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
const pname = (p: any) => (p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "") || "";

async function emailSigner(d: any, sig: any) {
  try {
    const { data: o } = await d.from("offerings").select("name").eq("id", sig.offering_id).maybeSingle();
    const { data: f } = await d.from("fund_files").select("title").eq("id", sig.file_id).maybeSingle();
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("manager-alert", sig.signer_email, {
      idempotencyKey: `fund-file-sign:${sig.id}`,
      templateData: {
        managerName: sig.signer_name,
        headline: `Please sign: ${f?.title ?? "a document"}`,
        intro: `${o?.name ?? "Your fund"} has a document ready for your signature. Sign in to Harmonious with this email address to review and sign it.`,
        offeringName: o?.name ?? "your fund",
        details: [{ label: "Document", value: f?.title ?? "Document" }, { label: "Signing as", value: sig.signer_role === "investor" ? "Investor" : "Fund manager" }],
        portalUrl: `${SITE}/sign/${sig.id}`,
      },
    });
  } catch (e) { console.error("signing email failed", e); }
  await d.from("fund_file_signatures").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", sig.id).eq("status", "waiting");
}

/** Who can sign this fund's documents, and the current signers per document. */
export const fundSigningContextFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ fundId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, data.fundId);
    const d = await db();
    const [{ data: obs }, { data: mgrs }, { data: sigs }] = await Promise.all([
      d.from("investor_onboardings").select("id, person_id, investor_user_id").eq("offering_id", data.fundId).is("removed_at", null),
      d.from("fund_managers").select("user_id").eq("offering_id", data.fundId),
      d.from("fund_file_signatures").select("id, file_id, signer_role, signing_order, signer_name, status, signed_at").eq("offering_id", data.fundId).neq("status", "cancelled").order("signing_order"),
    ]);
    const { lastReminders } = await import("@/lib/signing-reminder.server");
    const reminded = await lastReminders(data.fundId);
    const pids = [...new Set(((obs ?? []) as any[]).map((o) => o.person_id).filter(Boolean))];
    const { data: people } = pids.length ? await d.from("persons").select("id, legal_first_name, legal_last_name, preferred_name, email").in("id", pids) : { data: [] };
    const pm = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
    const investors = ((obs ?? []) as any[]).map((o) => { const p = pm.get(o.person_id); return { onboardingId: o.id as string, name: pname(p) || "Unnamed investor", email: (p?.email ?? null) as string | null }; });
    const uids = ((mgrs ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
    const { data: profs } = uids.length ? await d.from("profiles").select("user_id, legal_name, email").in("user_id", uids) : { data: [] };
    const managers = ((profs ?? []) as any[]).map((p) => ({ userId: p.user_id as string, name: (p.legal_name || p.email || "Fund manager") as string, email: (p.email ?? null) as string | null }));
    return { investors, managers, signatures: ((sigs ?? []) as any[]).map((x) => ({ ...x, lastRemindedAt: reminded[`file-sign:${x.id}`] ?? null })) };
  });

const ORDERS = ["investor_first", "manager_first", "manager_only", "investor_only"] as const;
type Order = (typeof ORDERS)[number];
const money = (c: unknown) => (c == null ? null : `$${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const line = (label: string, v: string | null | undefined) => `${label}: ${v && String(v).trim() ? v : "____________________"}`;

/** One signature page per send: a fund manager block and an investor block, pre-filled from the records. */
function buildSignaturePage(i: { title: string; fundName: string; order: Order; investor: any | null; manager: any | null }) {
  const parts = [`SIGNATURE PAGE`, `${i.title}`, `${i.fundName}`, ""];
  const inv = i.investor ? [
    "INVESTOR",
    line("Investor (legal name)", i.investor.entityName || i.investor.name),
    ...(i.investor.entityName ? [line("Signed by", i.investor.name), line("Title", null)] : []),
    line("Commitment amount", i.investor.amount),
    ...(i.investor.classKey ? [line("Class", i.investor.classKey)] : []),
    line("Address", i.investor.address),
    "Signature: ____________________", "Date: ____________________", "",
  ] : [];
  const mgr = i.manager ? [
    "FUND MANAGER",
    line("Fund", i.fundName), line("Signed by", i.manager.name), line("Title", i.manager.title),
    "Signature: ____________________", "Date: ____________________", "",
  ] : [];
  return [...parts, ...(i.order === "manager_first" ? [...mgr, ...inv] : [...inv, ...mgr])].join("\n").trim();
}

async function investorDetails(d: any, fundId: string, onboardingId: string) {
  const { data: ob } = await d.from("investor_onboardings").select("id, person_id, investor_user_id, investment_profile_id, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, offering_class_key").eq("id", onboardingId).eq("offering_id", fundId).is("removed_at", null).maybeSingle();
  if (!ob) throw new Error("That investor isn't in this fund.");
  const [{ data: p }, { data: ip }] = await Promise.all([
    ob.person_id ? d.from("persons").select("legal_first_name, legal_last_name, preferred_name, email, address_line1, address_line2, city, region, postal_code").eq("id", ob.person_id).maybeSingle() : Promise.resolve({ data: null }),
    ob.investment_profile_id ? d.from("investment_profiles").select("profile_type, legal_name").eq("id", ob.investment_profile_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const name = [p?.legal_first_name, p?.legal_last_name].filter(Boolean).join(" ") || pname(p) || p?.email || "Investor";
  const entity = ip && ip.profile_type && !/individual/i.test(ip.profile_type) && ip.legal_name && ip.legal_name !== name ? ip.legal_name : null;
  const address = [p?.address_line1, p?.address_line2, p?.city, [p?.region, p?.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  return { ob, email: p?.email ? String(p.email).toLowerCase() : null, name, entityName: entity as string | null, amount: money(ob.commitment_amount_cents ?? ob.accepted_amount_cents ?? ob.requested_amount_cents), classKey: ob.offering_class_key as string | null, address };
}

/**
 * Send a document for signature with a chosen signing order and mode.
 * Each investor gets their own signing packet (with the fund manager when the
 * order includes them) and their own pre-filled signature page.
 */
export const sendFileForSignatureFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({
    fundId: z.string().uuid(), fileId: z.string().uuid(),
    onboardingId: z.string().uuid().optional(), onboardingIds: z.array(z.string().uuid()).max(500).optional(),
    managerUserId: z.string().uuid().optional(),
    order: z.enum(ORDERS).default("investor_first"), mode: z.enum(["full", "signature_page"]).default("full"),
  }).parse(x))
  .handler(async ({ data, context }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, data.fundId);
    const d = await db();
    const { data: f } = await d.from("fund_files").select("id, status, title").eq("id", data.fileId).eq("offering_id", data.fundId).is("deleted_at", null).maybeSingle();
    if (!f) throw new Error("Document not found.");
    if (f.status === "signed") throw new Error("This document is already signed.");
    const needsInv = data.order !== "manager_only", needsMgr = data.order !== "investor_only";
    const invIds = [...new Set([...(data.onboardingIds ?? []), ...(data.onboardingId ? [data.onboardingId] : [])])];
    if (needsInv && !invIds.length) throw new Error("Choose at least one investor.");
    let mp: any = null;
    if (needsMgr) {
      if (!data.managerUserId) throw new Error("Choose a fund manager.");
      const { data: mgr } = await d.from("fund_managers").select("user_id").eq("offering_id", data.fundId).eq("user_id", data.managerUserId).maybeSingle();
      if (!mgr) throw new Error("That person isn't a manager of this fund.");
      const { data: prof } = await d.from("profiles").select("legal_name, email").eq("user_id", data.managerUserId).maybeSingle();
      if (!prof?.email) throw new Error("This fund manager has no email address.");
      mp = prof;
    }
    const { data: o } = await d.from("offerings").select("name, legal_entity_name, signatory_title").eq("id", data.fundId).maybeSingle();
    const fundName = o?.legal_entity_name || o?.name || "Fund";
    const manager = mp ? { name: mp.legal_name || mp.email, title: o?.signatory_title ?? null } : null;
    const invOrder = data.order === "manager_first" ? 2 : 1, mgrOrder = data.order === "manager_first" ? 1 : 2;

    // Any earlier unsigned round is cancelled, never deleted.
    await d.from("fund_file_signatures").update({ status: "cancelled" }).eq("file_id", f.id).in("status", ["waiting", "sent"]);
    await d.from("fund_files").update({ signing_order: data.order, signing_mode: data.mode }).eq("id", f.id);

    const sent: string[] = [], skipped: { name: string; reason: string }[] = [];
    const packets = needsInv ? invIds : [null];
    for (const oid of packets) {
      let inv: Awaited<ReturnType<typeof investorDetails>> | null = null;
      if (oid) {
        try { inv = await investorDetails(d, data.fundId, oid); } catch (e) { skipped.push({ name: "Investor", reason: (e as Error).message }); continue; }
        if (!inv.email) { skipped.push({ name: inv.name, reason: "no email address" }); continue; }
      }
      const packet = crypto.randomUUID();
      const page = buildSignaturePage({ title: f.title, fundName, order: data.order, investor: inv, manager });
      const rows: any[] = [];
      if (inv) rows.push({ file_id: f.id, offering_id: data.fundId, packet_id: packet, signature_page: page, signer_role: "investor", signing_order: needsMgr ? invOrder : 1, signer_name: inv.entityName ? `${inv.name} for ${inv.entityName}` : inv.name, signer_email: inv.email, signer_user_id: inv.ob.investor_user_id ?? null, onboarding_id: inv.ob.id, created_by: context.userId });
      if (mp) rows.push({ file_id: f.id, offering_id: data.fundId, packet_id: packet, signature_page: page, signer_role: "fund_manager", signing_order: needsInv ? mgrOrder : 1, signer_name: mp.legal_name || mp.email, signer_email: String(mp.email).toLowerCase(), signer_user_id: data.managerUserId, created_by: context.userId });
      const { data: ins, error } = await d.from("fund_file_signatures").insert(rows).select("*");
      if (error) throw new Error(error.message);
      await emailSigner(d, (ins as any[]).sort((a, b) => a.signing_order - b.signing_order)[0]);
      sent.push(inv?.name ?? manager?.name ?? "Signer");
    }
    if (!sent.length) throw new Error(`Nothing was sent. ${skipped.map((s) => `${s.name}: ${s.reason}`).join("; ")}`);
    await d.from("fund_files").update({ status: "out_for_signature" }).eq("id", f.id);
    try {
      const { logFundAudit } = await import("@/lib/fund-audit.server");
      await logFundAudit(context.userId, { offeringId: data.fundId, eventType: "document_sent_for_signature", summary: `Sent "${f.title}" for signature (${sent.length} packet${sent.length === 1 ? "" : "s"})`, values: { order: data.order, mode: data.mode, sentTo: sent.join(", "), fundManager: manager?.name ?? null, skipped: skipped.map((s) => `${s.name}: ${s.reason}`).join("; ") || null } });
    } catch { /* best-effort */ }
    return { ok: true, sent: sent.length, skipped };
  });

/**
 * Send a document to the fund's signatory only - for documents like the
 * operating agreement that the fund manager signs alone. One signer row,
 * signing order 1; the same signing page, reminders and audit apply.
 */
export const sendFileToSignatoryFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ fundId: z.string().uuid(), fileId: z.string().uuid(), managerUserId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, data.fundId);
    const d = await db();
    const { data: f } = await d.from("fund_files").select("id, status, title").eq("id", data.fileId).eq("offering_id", data.fundId).is("deleted_at", null).maybeSingle();
    if (!f) throw new Error("Document not found.");
    if (f.status === "signed") throw new Error("This document is already signed.");
    const { data: mgr } = await d.from("fund_managers").select("user_id").eq("offering_id", data.fundId).eq("user_id", data.managerUserId).maybeSingle();
    if (!mgr) throw new Error("That person isn't a manager of this fund.");
    const { data: mp } = await d.from("profiles").select("legal_name, email").eq("user_id", data.managerUserId).maybeSingle();
    if (!mp?.email) throw new Error("This fund manager has no email address.");
    // Any earlier unsigned round is cancelled, never deleted.
    await d.from("fund_file_signatures").update({ status: "cancelled" }).eq("file_id", f.id).in("status", ["waiting", "sent"]);
    const { data: rows, error } = await d.from("fund_file_signatures").insert([
      { file_id: f.id, offering_id: data.fundId, signer_role: "fund_manager", signing_order: 1, signer_name: mp.legal_name || mp.email, signer_email: String(mp.email).toLowerCase(), signer_user_id: data.managerUserId, created_by: context.userId },
    ]).select("*");
    if (error) throw new Error(error.message);
    await d.from("fund_files").update({ status: "out_for_signature" }).eq("id", f.id);
    await emailSigner(d, (rows as any[])[0]);
    try {
      const { logFundAudit } = await import("@/lib/fund-audit.server");
      await logFundAudit(context.userId, { offeringId: data.fundId, eventType: "document_sent_for_signature", summary: `Sent "${f.title}" to the fund signatory for signature`, values: { fundManager: mp.legal_name || mp.email, signatoryOnly: true } });
    } catch { /* best-effort */ }
    return { ok: true };
  });

async function loadForSigner(userId: string, email: string | undefined, id: string) {
  const d = await db();
  const { data: s } = await d.from("fund_file_signatures").select("*").eq("id", id).maybeSingle();
  if (!s) throw new Error("This signing link isn't valid.");
  const mine = s.signer_user_id === userId || (!!email && email.toLowerCase() === s.signer_email);
  if (!mine) throw new Error("This document is for someone else. Sign in with the email address the link was sent to.");
  return { d, s };
}

export const getSignatureFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    const { d, s } = await loadForSigner(context.userId, (context.claims as any)?.email, data.id);
    const [{ data: f }, { data: o }, { data: all }] = await Promise.all([
      d.from("fund_files").select("title, body, status").eq("id", s.file_id).maybeSingle(),
      d.from("offerings").select("name").eq("id", s.offering_id).maybeSingle(),
      d.from("fund_file_signatures").select("signing_order, signer_role, signer_name, status, signed_at, signed_name").eq("file_id", s.file_id).neq("status", "cancelled").order("signing_order"),
    ]);
    const earlier = ((all ?? []) as any[]).filter((r) => r.signing_order < s.signing_order);
    return {
      title: f?.title ?? "Document", body: (f?.body ?? "") as string, fundName: o?.name ?? "", role: s.signer_role as string,
      signerName: s.signer_name as string, status: s.status as string, signedAt: s.signed_at as string | null,
      yourTurn: s.status === "sent" || (s.status === "waiting" && earlier.every((r) => r.status === "signed")),
      signers: all ?? [],
    };
  });

export const signDocumentFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: z.string().uuid(), signedName: z.string().trim().min(2).max(200), consent: z.literal(true), userAgent: z.string().max(400).optional() }).parse(x))
  .handler(async ({ data, context }) => {
    const { d, s } = await loadForSigner(context.userId, (context.claims as any)?.email, data.id);
    if (s.status === "signed") throw new Error("You've already signed this document.");
    if (s.status === "cancelled") throw new Error("This signing request was cancelled.");
    const { data: all } = await d.from("fund_file_signatures").select("*").eq("file_id", s.file_id).neq("status", "cancelled").order("signing_order");
    const rows = (all ?? []) as any[];
    if (rows.some((r) => r.signing_order < s.signing_order && r.status !== "signed")) throw new Error("The investor needs to sign first.");
    const now = new Date().toISOString();
    const { data: upd, error } = await d.from("fund_file_signatures").update({ status: "signed", signed_name: data.signedName, signed_at: now, signed_user_agent: data.userAgent ?? null, signer_user_id: s.signer_user_id ?? context.userId }).eq("id", s.id).in("status", ["waiting", "sent"]).select("id");
    if (error) throw new Error(error.message);
    if (!upd?.length) throw new Error("This document was already signed.");
    const next = rows.find((r) => r.signing_order > s.signing_order && r.status !== "signed");
    const { logFundAudit } = await import("@/lib/fund-audit.server");
    const { data: f } = await d.from("fund_files").select("title").eq("id", s.file_id).maybeSingle();
    await logFundAudit(context.userId, { offeringId: s.offering_id, eventType: "document_signed_by", summary: `"${f?.title}" signed by ${data.signedName} (${s.signer_role === "investor" ? "investor" : "fund manager"})`, values: { signedAt: now } });
    const notify = (async (title: string, kind: string) => (await import("@/lib/ops-slack-notify.server")).notifySubmission({ kind, title, offeringId: s.offering_id, submittedBy: context.userId, ref: s.id, path: `/ops/fund/${s.offering_id}?tab=documents`, completed: true }));
    await notify(`"${f?.title ?? "Document"}" signed by ${data.signedName} (${s.signer_role === "investor" ? "investor" : "fund manager"})`, "document_signed").catch(() => null);
    if (next) { await emailSigner(d, next); return { done: false }; }
    await d.from("fund_files").update({ status: "signed" }).eq("id", s.file_id);
    await logFundAudit(context.userId, { offeringId: s.offering_id, eventType: "document_fully_signed", summary: `"${f?.title}" fully signed`, values: { signedAt: now } });
    await notify(`"${f?.title ?? "Document"}" is fully signed`, "document_fully_signed").catch(() => null);
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("ops-review-request", TEAM_EMAIL, { idempotencyKey: `fund-file-signed:${s.file_id}:${s.id}`, templateData: { itemLabel: "Signed document", fundName: "", detail: `"${f?.title}" has been signed by the investor and the fund manager.`, raisedBy: data.signedName, portalUrl: `${SITE}/ops/fund/${s.offering_id}?tab=documents` } });
    } catch (e) { console.error("signed email failed", e); }
    return { done: true };
  });

/** Reminder for the signer whose turn it is: opens that signing page. Never signs anything. */
export const remindFileSignerFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ signatureId: z.string().uuid(), overrideReason: z.string().trim().max(500).optional() }).parse(x))
  .handler(async ({ data, context }) => {
    const d = await db();
    const { data: s } = await d.from("fund_file_signatures").select("*").eq("id", data.signatureId).maybeSingle();
    if (!s) throw new Error("Signer not found.");
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, s.offering_id);
    if (s.status === "signed") throw new Error("They've already signed.");
    if (s.status === "cancelled") throw new Error("This signing request was cancelled.");
    const { data: all } = await d.from("fund_file_signatures").select("signing_order, status").eq("file_id", s.file_id).neq("status", "cancelled");
    if (((all ?? []) as any[]).some((r) => r.signing_order < s.signing_order && r.status !== "signed")) throw new Error("It isn't their turn yet. The investor signs first.");
    const { data: f } = await d.from("fund_files").select("title").eq("id", s.file_id).maybeSingle();
    if (s.status === "waiting") await d.from("fund_file_signatures").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", s.id).eq("status", "waiting");
    const { sendSigningReminder } = await import("@/lib/signing-reminder.server");
    return sendSigningReminder(context.userId, {
      offeringId: s.offering_id, reminderKey: `file-sign:${s.id}`, documentTitle: f?.title ?? "your document", recipientEmail: s.signer_email,
      recipientName: s.signer_name || "there", recipientUserId: s.signer_user_id, path: `/sign/${s.id}`,
      steps: s.signer_role === "investor" ? ["Read the document", "Confirm your details", "Sign"]
        : ((all ?? []) as any[]).some((r) => r.signing_order < s.signing_order) ? ["Review the investor's signed document", "Countersign as fund manager"]
        : ["Read the document", "Confirm the fund details", "Sign as the fund's signatory"],
      override: data.overrideReason ? { reason: data.overrideReason } : null,
    });
  });
