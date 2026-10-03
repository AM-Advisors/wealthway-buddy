// Server-only: Phase 7 contacts, deals, campaigns, messaging and the combined
// updates feed. Every call re-checks the caller; tables are not client-readable.
import { staffProfile } from "@/lib/harmonious-staff";
import { OPS_STAFF_ROLES } from "@/lib/ops-capabilities";
import {
  campaignDecisionProblem, campaignEditProblem, campaignSendProblem, canCreate, canEdit, canReassign, canSee,
  DEAL_STAGE_LABELS, mergeUpdates, resolveAudience,
  type Audience, type CrmActor, type DealStage, type Scope, type UpdateItem,
} from "@/lib/crm-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const SITE = "https://app.harmonious.co";

export async function crmActor(userId: string): Promise<CrmActor & { opsStaff: boolean }> {
  const db = await admin();
  const now = new Date().toISOString();
  const [{ data: roles }, { data: grants }, { data: fm }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("access_permission_grants").select("permission, effect, effective_at, expires_at, revoked_at")
      .eq("user_id", userId).in("permission", ["administration.crm.view_all", "administration.crm.assign", "administration.campaigns.approve"]),
    db.from("fund_managers").select("offering_id").eq("user_id", userId),
  ]);
  const r = ((roles ?? []) as any[]).map((x) => x.role as string);
  const sp = staffProfile(r);
  const active = ((grants ?? []) as any[]).filter((g) => !g.revoked_at && g.effective_at <= now && (!g.expires_at || g.expires_at > now));
  const has = (k: string) => active.some((g) => g.permission === k && g.effect === "allow") && !active.some((g) => g.permission === k && g.effect === "deny");
  return {
    userId,
    superUser: sp.superUser,
    viewAll: has("administration.crm.view_all"),
    canAssign: has("administration.crm.assign"),
    canApproveCampaigns: has("administration.campaigns.approve"),
    harmoniousStaff: sp.isHarmoniousStaff,
    opsStaff: r.some((x) => (OPS_STAFF_ROLES as readonly string[]).includes(x)),
    managedFunds: new Set(((fm ?? []) as any[]).map((x) => x.offering_id as string)),
  };
}

async function logActivity(row: { scope: Scope; offering_id: string | null; contact_id?: string | null; deal_id?: string | null; campaign_id?: string | null; actor_user_id: string; kind: string; summary: string; details?: Record<string, unknown> }) {
  await (await admin()).from("crm_activity").insert({ details: {}, ...row });
}

async function names(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, string>();
  const { data } = await (await admin()).from("profiles").select("user_id, legal_name, email").in("user_id", uniq);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
}

async function fundNames(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, string>();
  const { data } = await (await admin()).from("offerings").select("id, name").in("id", uniq);
  return new Map(((data ?? []) as any[]).map((o) => [o.id, o.name]));
}

// ------------------------------------------------------------ workspace

export async function crmWorkspace(userId: string, filter: { scope: Scope | "all"; offeringId?: string | undefined }) {
  const a = await crmActor(userId);
  const db = await admin();
  const q = (t: string) => {
    let x = db.from(t).select("*").order("updated_at", { ascending: false }).limit(1000);
    if (filter.scope !== "all") x = x.eq("scope", filter.scope);
    if (filter.offeringId) x = x.eq("offering_id", filter.offeringId);
    return x;
  };
  const [{ data: c }, { data: d }, { data: k }] = await Promise.all([q("crm_contacts"), q("crm_deals"), q("crm_campaigns")]);
  const contacts = ((c ?? []) as any[]).filter((r) => canSee(a, r));
  const deals = ((d ?? []) as any[]).filter((r) => canSee(a, r));
  const campaigns = ((k ?? []) as any[]).filter((r) => canSee(a, r) || (r.status === "submitted" && (a.superUser || a.canApproveCampaigns)));
  const ppl = await names([...contacts, ...deals, ...campaigns].flatMap((r) => [r.owner_user_id, r.created_by, r.decided_by]));
  const funds = await fundNames([...contacts, ...deals, ...campaigns].map((r) => r.offering_id));
  const decorate = (r: any) => ({ ...r, owner_name: ppl.get(r.owner_user_id) ?? null, fund_name: r.offering_id ? funds.get(r.offering_id) ?? null : null });
  const campaignIds = campaigns.map((x) => x.id);
  const { data: rc } = campaignIds.length ? await db.from("crm_campaign_recipients").select("campaign_id, status").in("campaign_id", campaignIds) : { data: [] };
  const counts = new Map<string, Record<string, number>>();
  for (const r of (rc ?? []) as any[]) {
    const m = counts.get(r.campaign_id) ?? {};
    m[r.status] = (m[r.status] ?? 0) + 1;
    counts.set(r.campaign_id, m);
  }
  const managedIds = [...a.managedFunds];
  const fundOptions = a.superUser
    ? ((await db.from("offerings").select("id, name").order("name")).data ?? [])
    : managedIds.length ? ((await db.from("offerings").select("id, name").in("id", managedIds).order("name")).data ?? []) : [];
  return {
    me: { userId, superUser: a.superUser, viewAll: a.viewAll, canAssign: a.superUser || a.canAssign, canApprove: a.superUser || a.canApproveCampaigns, harmonious: a.harmoniousStaff },
    fundOptions: fundOptions as { id: string; name: string }[],
    contacts: contacts.map(decorate),
    deals: deals.map(decorate),
    campaigns: campaigns.map((x) => ({ ...decorate(x), decided_by_name: x.decided_by ? ppl.get(x.decided_by) ?? null : null, recipients: counts.get(x.id) ?? {} })),
  };
}

export async function contactDetail(userId: string, contactId: string) {
  const a = await crmActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_contacts").select("*").eq("id", contactId).maybeSingle();
  if (!c || !canSee(a, c)) throw new Error("Contact not found.");
  const { data: act } = await db.from("crm_activity").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(200);
  const ppl = await names(((act ?? []) as any[]).map((x) => x.actor_user_id));
  return { contact: c, activity: ((act ?? []) as any[]).map((x) => ({ ...x, actor_name: ppl.get(x.actor_user_id) ?? "System" })) };
}

// ------------------------------------------------------------ contacts

type ContactInput = { full_name: string; email?: string | null | undefined; phone?: string | null | undefined; organization?: string | null | undefined; title?: string | null | undefined; source?: string | null | undefined; tags?: string[] | undefined };

export async function saveContact(userId: string, d: ContactInput & { id?: string | undefined; scope: Scope; offering_id: string | null }) {
  const a = await crmActor(userId);
  const db = await admin();
  const fields = { full_name: d.full_name, email: d.email?.toLowerCase() || null, phone: d.phone || null, organization: d.organization || null, title: d.title || null, source: d.source || null, tags: d.tags ?? [] };
  if (d.id) {
    const { data: c } = await db.from("crm_contacts").select("*").eq("id", d.id).maybeSingle();
    if (!c || !canEdit(a, c)) throw new Error("Contact not found.");
    const { error } = await db.from("crm_contacts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) throw new Error("Could not save the contact.");
    await logActivity({ scope: c.scope, offering_id: c.offering_id, contact_id: c.id, actor_user_id: userId, kind: "edited", summary: "Contact details updated", details: { before: pick(c, Object.keys(fields)), after: fields } });
    return { id: d.id };
  }
  if (!canCreate(a, d.scope, d.offering_id)) throw new Error("You can't add contacts here.");
  const { data: row, error } = await db.from("crm_contacts").insert({ ...fields, scope: d.scope, offering_id: d.scope === "fund" ? d.offering_id : null, owner_user_id: userId, created_by: userId }).select("id").single();
  if (error) throw new Error("Could not add the contact.");
  await logActivity({ scope: d.scope, offering_id: d.offering_id, contact_id: row.id, actor_user_id: userId, kind: "created", summary: `Contact added: ${d.full_name}` });
  return { id: row.id as string };
}

function pick(o: any, keys: string[]) { return Object.fromEntries(keys.map((k) => [k, o[k]])); }

export async function setConsent(userId: string, d: { contactId: string; consent: "opted_in" | "unknown" | "unsubscribed"; note: string }) {
  const a = await crmActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_contacts").select("*").eq("id", d.contactId).maybeSingle();
  if (!c || !canEdit(a, c)) throw new Error("Contact not found.");
  if (c.consent === "unsubscribed" && d.consent === "opted_in" && !a.superUser) throw new Error("This person unsubscribed. Only a Super Administrator can record new consent, with their written permission.");
  await db.from("crm_contacts").update({ consent: d.consent, consent_note: d.note, consent_recorded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", c.id);
  await logActivity({ scope: c.scope, offering_id: c.offering_id, contact_id: c.id, actor_user_id: userId, kind: "consent_changed", summary: `Email consent: ${d.consent.replace("_", " ")}`, details: { from: c.consent, to: d.consent, note: d.note } });
  return { ok: true };
}

export async function archiveContact(userId: string, d: { contactId: string; reason: string }) {
  const a = await crmActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_contacts").select("*").eq("id", d.contactId).maybeSingle();
  if (!c || !canEdit(a, c)) throw new Error("Contact not found.");
  await db.from("crm_contacts").update({ archived_at: c.archived_at ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", c.id);
  await logActivity({ scope: c.scope, offering_id: c.offering_id, contact_id: c.id, actor_user_id: userId, kind: c.archived_at ? "restored" : "archived", summary: c.archived_at ? "Contact restored" : "Contact archived", details: { reason: d.reason } });
  return { ok: true };
}

export async function reassignOwner(userId: string, d: { table: "crm_contacts" | "crm_deals" | "crm_campaigns"; id: string; ownerUserId: string; reason: string }) {
  const a = await crmActor(userId);
  if (!canReassign(a)) throw new Error("Only a Super Administrator or someone they authorize can reassign owners.");
  const db = await admin();
  const { data: r } = await db.from(d.table).select("*").eq("id", d.id).maybeSingle();
  if (!r) throw new Error("Record not found.");
  await db.from(d.table).update({ owner_user_id: d.ownerUserId, updated_at: new Date().toISOString() }).eq("id", d.id);
  const nm = await names([d.ownerUserId]);
  await logActivity({ scope: r.scope, offering_id: r.offering_id, contact_id: d.table === "crm_contacts" ? r.id : r.contact_id ?? null, deal_id: d.table === "crm_deals" ? r.id : null, campaign_id: d.table === "crm_campaigns" ? r.id : null, actor_user_id: userId, kind: "owner_changed", summary: `Owner changed to ${nm.get(d.ownerUserId) ?? "another team member"}`, details: { from: r.owner_user_id, to: d.ownerUserId, reason: d.reason } });
  return { ok: true };
}

export async function staffOwners(userId: string) {
  const a = await crmActor(userId);
  if (!canReassign(a)) return [];
  const db = await admin();
  const { data } = await db.from("user_roles").select("user_id, role").in("role", ["sales", "account_executive", "bdr", "sales_management", "cro", "super_admin", "admin", "operations", "client_success"]);
  const ids = [...new Set(((data ?? []) as any[]).map((r) => r.user_id))];
  const nm = await names(ids);
  return ids.map((id) => ({ id, name: nm.get(id) ?? id })).sort((x, y) => x.name.localeCompare(y.name));
}

export async function logNote(userId: string, d: { contactId: string; dealId?: string | undefined; kind: "note" | "call" | "meeting" | "email_logged"; summary: string }) {
  const a = await crmActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_contacts").select("*").eq("id", d.contactId).maybeSingle();
  if (!c || !canEdit(a, c)) throw new Error("Contact not found.");
  await logActivity({ scope: c.scope, offering_id: c.offering_id, contact_id: c.id, deal_id: d.dealId ?? null, actor_user_id: userId, kind: d.kind, summary: d.summary });
  return { ok: true };
}

// ------------------------------------------------------------ deals

export async function saveDeal(userId: string, d: { id?: string | undefined; contactId: string; title: string; stage: DealStage; amount_cents?: number | null | undefined; expected_close?: string | null | undefined; lost_reason?: string | null | undefined }) {
  const a = await crmActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_contacts").select("*").eq("id", d.contactId).maybeSingle();
  if (!c || !canEdit(a, c)) throw new Error("Contact not found.");
  if (d.stage === "lost" && !d.lost_reason?.trim()) throw new Error("Say why the deal was lost.");
  const fields = { title: d.title, stage: d.stage, amount_cents: d.amount_cents ?? null, expected_close: d.expected_close || null, lost_reason: d.stage === "lost" ? d.lost_reason : null };
  if (d.id) {
    const { data: deal } = await db.from("crm_deals").select("*").eq("id", d.id).maybeSingle();
    if (!deal || !canEdit(a, deal)) throw new Error("Deal not found.");
    await db.from("crm_deals").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (deal.stage !== d.stage) {
      await logActivity({ scope: deal.scope, offering_id: deal.offering_id, contact_id: deal.contact_id, deal_id: deal.id, actor_user_id: userId, kind: "stage_changed", summary: `${d.title}: ${DEAL_STAGE_LABELS[deal.stage as DealStage]} → ${DEAL_STAGE_LABELS[d.stage]}`, details: { from: deal.stage, to: d.stage } });
    } else {
      await logActivity({ scope: deal.scope, offering_id: deal.offering_id, contact_id: deal.contact_id, deal_id: deal.id, actor_user_id: userId, kind: "edited", summary: `Deal updated: ${d.title}`, details: { before: pick(deal, Object.keys(fields)), after: fields } });
    }
    return { id: d.id };
  }
  const { data: row, error } = await db.from("crm_deals").insert({ ...fields, scope: c.scope, offering_id: c.offering_id, contact_id: c.id, owner_user_id: userId, created_by: userId }).select("id").single();
  if (error) throw new Error("Could not add the deal.");
  await logActivity({ scope: c.scope, offering_id: c.offering_id, contact_id: c.id, deal_id: row.id, actor_user_id: userId, kind: "created", summary: `Deal opened: ${d.title} (${DEAL_STAGE_LABELS[d.stage]})` });
  return { id: row.id as string };
}

// ------------------------------------------------------------ campaigns

async function audienceContacts(scope: Scope, offeringId: string | null, a: CrmActor, ownerId: string) {
  const db = await admin();
  let q = db.from("crm_contacts").select("id, email, consent, archived_at, tags, scope, offering_id, owner_user_id").eq("scope", scope).limit(5000);
  q = scope === "fund" ? q.eq("offering_id", offeringId) : q.eq("owner_user_id", ownerId);
  const { data } = await q;
  const contacts = ((data ?? []) as any[]).filter((c) => scope === "fund" || canSee({ ...a, userId: ownerId }, c) || a.superUser);
  const ids = contacts.map((c) => c.id);
  const { data: deals } = ids.length ? await db.from("crm_deals").select("contact_id, stage").in("contact_id", ids).is("archived_at", null) : { data: [] };
  const st = new Map<string, string[]>();
  for (const x of (deals ?? []) as any[]) st.set(x.contact_id, [...(st.get(x.contact_id) ?? []), x.stage]);
  return contacts.map((c) => ({ ...c, tags: c.tags ?? [], stages: st.get(c.id) ?? [] }));
}

export async function previewAudience(userId: string, d: { scope: Scope; offering_id: string | null; audience: Audience; ownerUserId?: string | undefined }) {
  const a = await crmActor(userId);
  if (!canCreate(a, d.scope, d.offering_id) && !(a.superUser || a.canApproveCampaigns)) throw new Error("Not available.");
  const r = resolveAudience(await audienceContacts(d.scope, d.offering_id, a, d.ownerUserId ?? userId), d.audience);
  return { count: r.included.length, excluded: r.excluded };
}

export async function saveCampaign(userId: string, d: { id?: string | undefined; scope: Scope; offering_id: string | null; name: string; subject: string; body: string; audience: Audience }) {
  const a = await crmActor(userId);
  const db = await admin();
  const fields = { name: d.name, subject: d.subject, body: d.body, audience: d.audience };
  if (d.id) {
    const { data: c } = await db.from("crm_campaigns").select("*").eq("id", d.id).maybeSingle();
    if (!c || !canEdit(a, c)) throw new Error("Campaign not found.");
    const p = campaignEditProblem(c);
    if (p) throw new Error(p);
    await db.from("crm_campaigns").update({ ...fields, status: "draft", updated_at: new Date().toISOString() }).eq("id", c.id);
    return { id: c.id as string };
  }
  if (!canCreate(a, d.scope, d.offering_id)) throw new Error("You can't create campaigns here.");
  const { data: row, error } = await db.from("crm_campaigns").insert({ ...fields, scope: d.scope, offering_id: d.scope === "fund" ? d.offering_id : null, owner_user_id: userId, created_by: userId }).select("id").single();
  if (error) throw new Error("Could not save the campaign.");
  await logActivity({ scope: d.scope, offering_id: d.offering_id, campaign_id: row.id, actor_user_id: userId, kind: "campaign_created", summary: `Campaign drafted: ${d.name}` });
  return { id: row.id as string };
}

export async function submitCampaign(userId: string, id: string) {
  const a = await crmActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_campaigns").select("*").eq("id", id).maybeSingle();
  if (!c || !canEdit(a, c)) throw new Error("Campaign not found.");
  if (c.status !== "draft" && c.status !== "declined") throw new Error("Only a draft can be sent for approval.");
  await db.from("crm_campaigns").update({ status: "submitted", submitted_at: new Date().toISOString(), decided_by: null, decided_at: null, decision_note: null, updated_at: new Date().toISOString() }).eq("id", id);
  await logActivity({ scope: c.scope, offering_id: c.offering_id, campaign_id: id, actor_user_id: userId, kind: "campaign_submitted", summary: `Campaign sent for approval: ${c.name}` });
  return { ok: true };
}

export async function decideCampaign(userId: string, d: { id: string; decision: "approve" | "decline"; note?: string | undefined }) {
  const a = await crmActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_campaigns").select("*").eq("id", d.id).maybeSingle();
  if (!c) throw new Error("Campaign not found.");
  const p = campaignDecisionProblem(a, c);
  if (p) throw new Error(p);
  if (d.decision === "decline" && !d.note?.trim()) throw new Error("Give a reason for declining.");
  await db.from("crm_campaigns").update({ status: d.decision === "approve" ? "approved" : "declined", decided_by: userId, decided_at: new Date().toISOString(), decision_note: d.note ?? null, updated_at: new Date().toISOString() }).eq("id", d.id);
  await logActivity({ scope: c.scope, offering_id: c.offering_id, campaign_id: d.id, actor_user_id: userId, kind: d.decision === "approve" ? "campaign_approved" : "campaign_declined", summary: `Campaign ${d.decision === "approve" ? "approved" : "declined"}: ${c.name}`, details: { note: d.note ?? null } });
  return { ok: true };
}

export async function sendCampaign(userId: string, d: { id: string; confirmCount: number }) {
  const a = await crmActor(userId);
  const db = await admin();
  const { data: c } = await db.from("crm_campaigns").select("*").eq("id", d.id).maybeSingle();
  if (!c) throw new Error("Campaign not found.");
  const p = campaignSendProblem(a, c);
  if (p) throw new Error(p);
  const { included } = resolveAudience(await audienceContacts(c.scope, c.offering_id, a, c.owner_user_id), c.audience ?? {});
  if (included.length !== d.confirmCount) throw new Error(`The audience changed to ${included.length}. Review and confirm again.`);
  if (!included.length) throw new Error("No one in this audience can be emailed.");
  // Claim the send so a double-click can't send twice.
  const { data: claimed } = await db.from("crm_campaigns").update({ status: "sending", sent_by: userId, updated_at: new Date().toISOString() }).eq("id", c.id).eq("status", "approved").select("id");
  if (!claimed?.length) throw new Error("This campaign is already being sent.");

  const fundName = c.offering_id ? (await fundNames([c.offering_id])).get(c.offering_id) ?? null : null;
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const tally = { sent: 0, suppressed: 0, failed: 0 };
  for (const contact of included) {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { data: rec, error } = await db.from("crm_campaign_recipients").insert({ campaign_id: c.id, contact_id: contact.id, email: contact.email, unsubscribe_token: token }).select("id").single();
    if (error) continue; // already recorded for this campaign
    try {
      const res = await sendTemplateEmail("crm-campaign", contact.email!, {
        idempotencyKey: `crm-${c.id}-${contact.id}`,
        templateData: { subject: c.subject, body: c.body, fundName, unsubscribeUrl: `${SITE}/api/public/crm-unsubscribe?t=${token}` },
      });
      const status = res.sent ? "sent" : "suppressed";
      tally[status]++;
      await db.from("crm_campaign_recipients").update({ status, sent_at: res.sent ? new Date().toISOString() : null }).eq("id", rec.id);
    } catch (e) {
      tally.failed++;
      await db.from("crm_campaign_recipients").update({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Send failed" }).eq("id", rec.id);
    }
  }
  await db.from("crm_campaigns").update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", c.id);
  await logActivity({ scope: c.scope, offering_id: c.offering_id, campaign_id: c.id, actor_user_id: userId, kind: "campaign_sent", summary: `Campaign sent: ${c.name} - ${tally.sent} delivered${tally.suppressed ? `, ${tally.suppressed} suppressed` : ""}${tally.failed ? `, ${tally.failed} failed` : ""}`, details: tally });
  return tally;
}

export async function unsubscribeByToken(token: string) {
  const db = await admin();
  const { data: r } = await db.from("crm_campaign_recipients").select("contact_id, campaign_id").eq("unsubscribe_token", token).maybeSingle();
  if (!r) return false;
  const { data: c } = await db.from("crm_contacts").select("id, scope, offering_id, consent").eq("id", r.contact_id).maybeSingle();
  if (!c) return false;
  if (c.consent !== "unsubscribed") {
    await db.from("crm_contacts").update({ consent: "unsubscribed", consent_recorded_at: new Date().toISOString(), consent_note: "Unsubscribed from email link", updated_at: new Date().toISOString() }).eq("id", c.id);
    await logActivity({ scope: c.scope, offering_id: c.offering_id, contact_id: c.id, campaign_id: r.campaign_id, actor_user_id: null as any, kind: "consent_changed", summary: "Unsubscribed via email link", details: { from: c.consent, to: "unsubscribed" } });
  }
  return true;
}

// ------------------------------------------------------------ messaging with Harmonious

export async function listConversations(userId: string, d: { kind?: "manager" | "investor" | undefined; offeringId?: string | undefined; staffView?: boolean | undefined }) {
  const a = await crmActor(userId);
  const db = await admin();
  let q = db.from("support_conversations").select("*").order("last_message_at", { ascending: false }).limit(300);
  if (d.kind) q = q.eq("kind", d.kind);
  if (d.offeringId) q = q.eq("offering_id", d.offeringId);
  const { data } = await q;
  const rows = ((data ?? []) as any[]).filter((c) => (d.staffView ? a.opsStaff || a.superUser : participantOf(a, c)));
  const { data: reads } = await db.from("message_reads").select("thread_key, last_read_at").eq("user_id", userId);
  const readMap = new Map(((reads ?? []) as any[]).map((r) => [r.thread_key, r.last_read_at]));
  const ppl = await names(rows.map((r) => r.requester_user_id));
  const funds = await fundNames(rows.map((r) => r.offering_id));
  return rows.map((c) => ({ ...c, requester_name: ppl.get(c.requester_user_id) ?? null, fund_name: c.offering_id ? funds.get(c.offering_id) ?? null : null, unread: !readMap.get(`support:${c.id}`) || readMap.get(`support:${c.id}`) < c.last_message_at }));
}

function participantOf(a: CrmActor, c: any) {
  if (c.requester_user_id === a.userId) return true;
  return c.kind === "manager" && c.offering_id && a.managedFunds.has(c.offering_id);
}

async function loadConversation(userId: string, id: string) {
  const a = await crmActor(userId);
  const { data: c } = await (await admin()).from("support_conversations").select("*").eq("id", id).maybeSingle();
  if (!c) throw new Error("Conversation not found.");
  const asStaff = a.opsStaff || a.superUser;
  const asParticipant = participantOf(a, c);
  if (!asStaff && !asParticipant) throw new Error("Conversation not found.");
  return { a, c, side: asParticipant ? "participant" : "harmonious" } as const;
}

export async function getConversation(userId: string, id: string) {
  const { c, side } = await loadConversation(userId, id);
  const db = await admin();
  const { data: msgs } = await db.from("support_messages").select("*").eq("conversation_id", id).order("created_at");
  const ppl = await names(((msgs ?? []) as any[]).map((m) => m.sender_user_id));
  await db.from("message_reads").upsert({ user_id: userId, thread_key: `support:${id}`, last_read_at: new Date().toISOString() });
  return { conversation: c, side, messages: ((msgs ?? []) as any[]).map((m) => ({ ...m, sender_name: m.side === "harmonious" ? `${ppl.get(m.sender_user_id) ?? "Harmonious"} · Harmonious` : ppl.get(m.sender_user_id) ?? "You" })) };
}

export async function startConversation(userId: string, d: { kind: "manager" | "investor"; offeringId?: string | undefined; subject: string; body: string }) {
  const a = await crmActor(userId);
  if (d.kind === "manager" && (!d.offeringId || !a.managedFunds.has(d.offeringId))) throw new Error("Pick one of your Funds.");
  const db = await admin();
  const { data: c, error } = await db.from("support_conversations").insert({ kind: d.kind, offering_id: d.offeringId ?? null, requester_user_id: userId, subject: d.subject }).select("id").single();
  if (error) throw new Error("Could not start the conversation.");
  await db.from("support_messages").insert({ conversation_id: c.id, sender_user_id: userId, side: "participant", body: d.body });
  return { id: c.id as string };
}

export async function replyConversation(userId: string, d: { id: string; body: string; close?: boolean | undefined }) {
  const { c, side } = await loadConversation(userId, d.id);
  const db = await admin();
  const now = new Date().toISOString();
  await db.from("support_messages").insert({ conversation_id: c.id, sender_user_id: userId, side, body: d.body });
  await db.from("support_conversations").update({ last_message_at: now, status: d.close ? "closed" : "open" }).eq("id", c.id);
  await db.from("message_reads").upsert({ user_id: userId, thread_key: `support:${c.id}`, last_read_at: now });
  return { ok: true };
}

// ------------------------------------------------------------ combined updates for managers

export async function managerUpdates(userId: string, d: { offeringId?: string | undefined; limit?: number | undefined }) {
  const a = await crmActor(userId);
  let ids = [...a.managedFunds];
  if (d.offeringId) ids = ids.filter((i) => i === d.offeringId);
  if (!ids.length) return { items: [] as UpdateItem[], unread: 0, lastReadAt: null as string | null };
  const db = await admin();
  const limit = d.limit ?? 50;
  const funds = await fundNames(ids);
  const [{ data: progress }, { data: pm }, { data: convs }, { data: act }, { data: read }] = await Promise.all([
    db.from("notification_events").select("id, event_kind, offering_id, field, old_value, new_value, metadata, created_at").in("offering_id", ids)
      .in("event_kind", ["fund_assigned", "setup_task_progress", "service_progress", "launch_progress"]).order("created_at", { ascending: false }).limit(limit),
    db.from("portal_messages").select("id, offering_id, application_id, sender_name, body, created_at").in("offering_id", ids).eq("sender_role", "investor").order("created_at", { ascending: false }).limit(limit),
    db.from("support_conversations").select("id, offering_id, subject").eq("kind", "manager").in("offering_id", ids),
    db.from("crm_activity").select("id, offering_id, kind, summary, contact_id, created_at").eq("scope", "fund").in("offering_id", ids).in("kind", ["stage_changed", "created", "campaign_submitted", "campaign_approved", "campaign_declined", "campaign_sent", "consent_changed", "owner_changed"]).order("created_at", { ascending: false }).limit(limit),
    db.from("message_reads").select("last_read_at").eq("user_id", userId).eq("thread_key", "manager-updates").maybeSingle(),
  ]);
  const { fundProgressMessage } = await import("@/lib/manager-alerts.server");
  const convMap = new Map(((convs ?? []) as any[]).map((c) => [c.id, c]));
  const { data: hm } = convMap.size
    ? await db.from("support_messages").select("id, conversation_id, body, created_at").in("conversation_id", [...convMap.keys()]).eq("side", "harmonious").order("created_at", { ascending: false }).limit(limit)
    : { data: [] };
  const fn = (id: string | null) => (id ? funds.get(id) ?? "Your fund" : null);
  const items = mergeUpdates([
    ((progress ?? []) as any[]).filter((r) => r.event_kind !== "fund_assigned" || r.metadata?.recipient_user_id === userId).map((r) => {
      const m = fundProgressMessage(r, fn(r.offering_id)!);
      return { id: `p:${r.id}`, kind: "fund_progress" as const, offeringId: r.offering_id, fundName: fn(r.offering_id), headline: m?.headline ?? "Fund update", detail: m?.intro ?? "", at: r.created_at, path: `/manager/fund/${r.offering_id}` };
    }),
    ((pm ?? []) as any[]).map((m) => ({ id: `m:${m.id}`, kind: "investor_message" as const, offeringId: m.offering_id, fundName: fn(m.offering_id), headline: `Message from ${m.sender_name ?? "an investor"}`, detail: String(m.body).slice(0, 160), at: m.created_at, path: "/manager/messages" })),
    ((hm ?? []) as any[]).map((m) => {
      const c = convMap.get(m.conversation_id);
      return { id: `h:${m.id}`, kind: "harmonious_message" as const, offeringId: c?.offering_id ?? null, fundName: fn(c?.offering_id ?? null), headline: `Harmonious replied: ${c?.subject ?? "your question"}`, detail: String(m.body).slice(0, 160), at: m.created_at, path: "/manager/messages?tab=harmonious" };
    }),
    ((act ?? []) as any[]).map((x) => ({ id: `a:${x.id}`, kind: (String(x.kind).startsWith("campaign") ? "campaign" : x.kind === "stage_changed" ? "deal" : "contact") as UpdateItem["kind"], offeringId: x.offering_id, fundName: fn(x.offering_id), headline: x.summary, detail: "", at: x.created_at, path: "/manager/crm" })),
  ], limit);
  const lastReadAt = (read as any)?.last_read_at ?? null;
  return { items, unread: lastReadAt ? items.filter((i) => i.at > lastReadAt).length : items.length, lastReadAt };
}

export async function markManagerUpdatesRead(userId: string) {
  await (await admin()).from("message_reads").upsert({ user_id: userId, thread_key: "manager-updates", last_read_at: new Date().toISOString() });
  return { ok: true };
}
