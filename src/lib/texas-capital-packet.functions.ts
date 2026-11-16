import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import {
  TEXAS_CAPITAL_RECIPIENTS, TEXAS_CAPITAL_CC, approvalBlocker, canUndoApproval, entityKindFrom, linkExpiry,
  missingForReview, needsIdentification, requiredDocuments, type EntityKind, type PacketAnswers, type PacketStatus,
} from "@/lib/texas-capital-packet-model";

const SITE = "https://app.harmonious.co";

const person = z.object({
  name: z.string().trim().min(1).max(200), email: z.string().trim().max(254).optional(), phone: z.string().trim().max(40).optional(),
  title: z.string().trim().max(120).optional(),
  roles: z.array(z.enum(["signer", "controlling_party", "beneficial_owner"])).max(3),
  ownershipPercent: z.number().min(0).max(100).nullable().optional(), onFileWithBank: z.boolean(),
});
const answers = z.object({
  legalName: z.string().max(300).optional(), entityType: z.string().max(120).optional(), ein: z.string().max(20).optional(),
  dba: z.string().max(300).optional(), businessPhone: z.string().max(40).optional(), website: z.string().max(300).optional(),
  naics: z.string().max(20).optional(), narrative: z.string().max(3000).optional(), dateEstablished: z.string().max(40).optional(),
  stateOfIncorporation: z.string().max(60).optional(), registeredInTexas: z.boolean().nullable().optional(),
  physicalAddress: z.string().max(500).optional(), mailingAddress: z.string().max(500).optional(),
  primaryContactEmail: z.string().max(254).optional(), accountPurpose: z.string().max(1000).optional(),
  accounts: z.object({ count: z.number().int().min(1).max(20), type: z.enum(["checking", "savings"]), addToBankNow: z.boolean() }),
  people: z.array(person).max(20),
});
const docState = z.record(z.string().max(60), z.object({ path: z.string().max(400).optional(), onFile: z.boolean().optional() }));

async function load(context: any, packetId: string) {
  const { adminDb, packetAuthority } = await import("@/lib/texas-capital-packet.server");
  const db = await adminDb();
  const { data: p } = await db.from("texas_capital_packets").select("*").eq("id", packetId).maybeSingle();
  if (!p) throw new Error("Package not found.");
  const auth = await packetAuthority(context.supabase, context.userId, p.offering_id);
  if (!auth.authorized) throw new Error("You can't work on packages for this fund.");
  return { db, p, auth };
}

export const getTexasCapitalPacket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { adminDb, packetAuthority, recordFacts, mergeAnswers } = await import("@/lib/texas-capital-packet.server");
    const auth = await packetAuthority(context.supabase, context.userId, data.offeringId);
    if (!auth.authorized) throw new Error("You can't work on packages for this fund.");
    const db = await adminDb();
    const { data: p } = await db.from("texas_capital_packets").select("*").eq("offering_id", data.offeringId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const facts = await recordFacts(db, data.offeringId);
    if (!p) return { packet: null, prefill: mergeAnswers({}, facts), suggestedKind: entityKindFrom(facts.entityType) as EntityKind, recipients: [...TEXAS_CAPITAL_RECIPIENTS], cc: TEXAS_CAPITAL_CC };
    const a = mergeAnswers(p.answers ?? {}, facts);
    const docs = (p.documents ?? {}) as Record<string, { path?: string; onFile?: boolean }>;
    const flags = Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, !!(v.path || v.onFile)]));
    const { data: events } = await db.from("texas_capital_packet_events").select("event, created_at").eq("packet_id", p.id).order("created_at", { ascending: false }).limit(30);
    return {
      packet: {
        id: p.id as string, status: p.status as PacketStatus, entityKind: p.entity_kind as EntityKind, answers: a, documents: docs,
        missing: missingForReview(a, flags, p.entity_kind), requiredDocs: requiredDocuments(p.entity_kind, !!a.dba?.trim()),
        idNeeded: a.people.map((x, i) => ({ index: i, name: x.name, needed: needsIdentification(x) })),
        youPrepared: p.prepared_by === context.userId, sentAt: p.sent_at, linkExpiresAt: p.link_expires_at, linkRevokedAt: p.link_revoked_at,
        firstOpenedAt: p.first_opened_at, events: events ?? [],
      },
      prefill: null, suggestedKind: p.entity_kind as EntityKind, recipients: [...TEXAS_CAPITAL_RECIPIENTS], cc: TEXAS_CAPITAL_CC,
    };
  });

export const startTexasCapitalPacket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid(), entityKind: z.enum(["llc", "corporation"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { adminDb, packetAuthority, logPacket } = await import("@/lib/texas-capital-packet.server");
    const auth = await packetAuthority(context.supabase, context.userId, data.offeringId);
    if (!auth.authorized) throw new Error("You can't work on packages for this fund.");
    const db = await adminDb();
    const { data: open } = await db.from("texas_capital_packets").select("id").eq("offering_id", data.offeringId).not("status", "in", "(cancelled,account_opened)").limit(1).maybeSingle();
    if (open) return { id: open.id as string };
    const { data: req } = await db.from("offering_bank_setup_requests").select("id").eq("offering_id", data.offeringId).eq("bank", "texas_capital").neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: row, error } = await db.from("texas_capital_packets").insert({ offering_id: data.offeringId, request_id: req?.id ?? null, entity_kind: data.entityKind, created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    await logPacket(db, row.id, "started", context.userId, { entity_kind: data.entityKind });
    return { id: row.id as string };
  });

export const saveTexasCapitalPacket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), entityKind: z.enum(["llc", "corporation"]), answers, documents: docState }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, p } = await load(context, data.id);
    if (!["draft", "ready"].includes(p.status)) throw new Error("Undo the approval before changing an approved package.");
    for (const v of Object.values(data.documents)) if (v.path && !v.path.startsWith(`packets/${p.id}/`)) throw new Error("Unexpected file.");
    await db.from("texas_capital_packets").update({ entity_kind: data.entityKind, answers: data.answers, documents: data.documents, status: "draft", ready_at: null, updated_at: new Date().toISOString() }).eq("id", p.id);
    const { logPacket } = await import("@/lib/texas-capital-packet.server");
    await logPacket(db, p.id, "saved", context.userId);
    return { ok: true };
  });

export const uploadTexasCapitalDocUrl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), key: z.string().regex(/^[a-z0-9_]{1,60}$/), ext: z.enum(["pdf", "jpg", "jpeg", "png"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, p } = await load(context, data.id);
    if (!["draft", "ready"].includes(p.status)) throw new Error("This package is locked.");
    const path = `packets/${p.id}/${data.key}-${Date.now()}.${data.ext}`;
    const { data: signed, error } = await db.storage.from("bank-packets").createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token as string };
  });

export const markTexasCapitalReady = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, p } = await load(context, data.id);
    if (p.status !== "draft") throw new Error("Only a draft can be sent for review.");
    const { recordFacts, mergeAnswers, logPacket } = await import("@/lib/texas-capital-packet.server");
    const a = mergeAnswers(p.answers ?? {}, await recordFacts(db, p.offering_id));
    const flags = Object.fromEntries(Object.entries(p.documents ?? {}).map(([k, v]: any) => [k, !!(v?.path || v?.onFile)]));
    const missing = missingForReview(a, flags, p.entity_kind);
    if (missing.length) throw new Error(`Still needed: ${missing.join(", ")}.`);
    await db.from("texas_capital_packets").update({ answers: a, status: "ready", prepared_by: context.userId, ready_at: new Date().toISOString() }).eq("id", p.id).eq("status", "draft");
    await logPacket(db, p.id, "ready_for_review", context.userId);
    return { ok: true };
  });

export const approveTexasCapitalPacket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), undo: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, p, auth } = await load(context, data.id);
    const { logPacket } = await import("@/lib/texas-capital-packet.server");
    if (data.undo) {
      if (!canUndoApproval(p.status)) throw new Error("Approval can only be undone before sending.");
      await db.from("texas_capital_packets").update({ status: "ready", approved_by: null, approved_at: null }).eq("id", p.id).eq("status", "approved");
      await logPacket(db, p.id, "approval_undone", context.userId);
      return { ok: true };
    }
    const block = approvalBlocker({ status: p.status, preparedBy: p.prepared_by, approverId: context.userId, authorized: auth.authorized });
    if (block) throw new Error(block);
    await db.from("texas_capital_packets").update({ status: "approved", approved_by: context.userId, approved_at: new Date().toISOString() }).eq("id", p.id).eq("status", "ready");
    await logPacket(db, p.id, "approved", context.userId);
    return { ok: true };
  });

export const sendTexasCapitalPacket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), resend: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, p } = await load(context, data.id);
    const allowed: PacketStatus[] = data.resend ? ["sent", "opened"] : ["approved"];
    if (!allowed.includes(p.status)) throw new Error(data.resend ? "Only a sent package can be sent again." : "The package has to be approved first.");
    const s = await import("@/lib/texas-capital-packet.server");
    let path = p.storage_path as string | null;
    if (!path) {
      const pdf = await s.buildPackagePdf(db, p.id, p.entity_kind, p.answers as PacketAnswers, p.documents ?? {});
      path = `packets/${p.id}/package-${Date.now()}.pdf`;
      const { error } = await db.storage.from("bank-packets").upload(path, pdf, { contentType: "application/pdf", upsert: false });
      if (error) throw new Error(error.message);
    }
    const token = s.newToken();
    const now = new Date();
    const expires = linkExpiry(now);
    await db.from("texas_capital_packets").update({
      storage_path: path, token_hash: await s.sha256Hex(token), link_expires_at: expires.toISOString(), link_revoked_at: null,
      status: p.status === "approved" ? "sent" : p.status, sent_by: context.userId, sent_at: now.toISOString(),
    }).eq("id", p.id);
    const a = p.answers as PacketAnswers;
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const templateData = {
      entityName: a.legalName, downloadUrl: `${SITE}/api/public/bank-packet/${token}`,
      expiresOn: expires.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }),
      accountSummary: `${a.accounts.count} ${a.accounts.type} account${a.accounts.count > 1 ? "s" : ""}${a.accounts.addToBankNow ? ", added to the existing BankNow online portal" : ""}.`,
      documentList: ["Customer BSA Profile", "Customer Account BSA Profile", "Certification of Beneficial Ownership", ...requiredDocuments(p.entity_kind, !!a.dba?.trim()).filter((d) => (p.documents ?? {})[d.key]?.path).map((d) => d.label)],
    };
    const failed: string[] = [];
    for (const [i, to] of TEXAS_CAPITAL_RECIPIENTS.entries()) {
      try {
        await sendTemplateEmail("texas-capital-package", to, { templateData, replyTo: TEXAS_CAPITAL_CC, idempotencyKey: `tcb-${p.id}-${now.getTime()}-${i}`, ...(i === 0 ? { cc: TEXAS_CAPITAL_CC } : {}) });
      } catch (e) { console.error("texas capital email failed", (e as Error).message); failed.push(to); }
    }
    await s.logPacket(db, p.id, data.resend ? "resent" : "sent", context.userId, { recipients: TEXAS_CAPITAL_RECIPIENTS.length, failed: failed.length });
    if (p.request_id) await db.from("offering_bank_setup_requests").update({ status: "in_progress" }).eq("id", p.request_id).eq("status", "requested");
    return { ok: true, failed };
  });

export const updateTexasCapitalLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["revoke", "account_opened", "cancel"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, p } = await load(context, data.id);
    const { logPacket } = await import("@/lib/texas-capital-packet.server");
    const now = new Date().toISOString();
    if (data.action === "revoke") await db.from("texas_capital_packets").update({ link_revoked_at: now }).eq("id", p.id);
    if (data.action === "account_opened") {
      if (!["sent", "opened"].includes(p.status)) throw new Error("Send the package first.");
      await db.from("texas_capital_packets").update({ status: "account_opened", link_revoked_at: p.link_revoked_at ?? now }).eq("id", p.id);
      if (p.request_id) await db.from("offering_bank_setup_requests").update({ status: "opened" }).eq("id", p.request_id);
    }
    if (data.action === "cancel") {
      if (p.status === "account_opened") throw new Error("This account is already open.");
      await db.from("texas_capital_packets").update({ status: "cancelled", link_revoked_at: p.link_revoked_at ?? now }).eq("id", p.id);
    }
    await logPacket(db, p.id, data.action, context.userId);
    return { ok: true };
  });
