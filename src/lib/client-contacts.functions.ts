import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF = ["admin", "super_admin", "operations", "client_success", "executive"];
const SIGN_IN_URL = "https://app.harmonious.co/auth";
export const CONTACT_TAGS = ["Investor", "Founder", "Employee", "Advisor", "Board", "Counsel", "Accountant", "Signatory", "Prospect"] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Resolves the caller's access to a client: staff, client GP (edit) or member (read). */
async function access(context: any, clientId?: string | null) {
  const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const staff = ((roles ?? []) as any[]).some((r) => STAFF.includes(String(r.role)));
  let q = context.supabase.from("client_users").select("client_id, client_role").eq("user_id", context.userId);
  if (clientId) q = q.eq("client_id", clientId);
  const { data: link } = await q.limit(1).maybeSingle();
  const id = clientId ?? link?.client_id ?? null;
  if (!id) return null;
  if (!staff && !link) throw new Error("You aren't a member of this client.");
  return { clientId: id as string, canEdit: staff || link?.client_role === "client_gp" };
}

async function log(db: any, contactId: string, clientId: string, actor: string, kind: string, detail: object = {}) {
  await db.from("client_contact_events").insert({ contact_id: contactId, client_id: clientId, actor_id: actor, event_kind: kind, detail });
}

async function loadContact(db: any, id: string) {
  const { data } = await db.from("client_contacts").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Contact not found.");
  return data;
}

export const listClientContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const a = await access(context, data.clientId);
    if (!a) return null;
    const db = await admin();
    const [{ data: contacts }, { data: client }] = await Promise.all([
      db.from("client_contacts").select("*").eq("client_id", a.clientId).order("full_name"),
      db.from("clients").select("name").eq("id", a.clientId).maybeSingle(),
    ]);
    const list = (contacts ?? []) as any[];
    const emails = [...new Set(list.map((c) => (c.email ?? "").toLowerCase()).filter(Boolean))];
    const kyc: Record<string, boolean> = {};
    const signedIn: Record<string, boolean> = {};
    if (emails.length) {
      const { data: persons } = await db.from("persons").select("email, kyc_status, aml_status, user_id").in("email", emails);
      for (const p of (persons ?? []) as any[]) {
        const e = String(p.email).toLowerCase();
        if (p.kyc_status === "approved" && p.aml_status === "approved") kyc[e] = true;
        if (p.user_id) signedIn[e] = true;
      }
    }
    const { data: events } = await db.from("client_contact_events").select("contact_id, created_at")
      .eq("client_id", a.clientId).order("created_at", { ascending: false }).limit(1000);
    const last: Record<string, string> = {};
    for (const e of (events ?? []) as any[]) last[e.contact_id] ??= e.created_at;
    return {
      clientId: a.clientId,
      clientName: (client?.name ?? "") as string,
      canEdit: a.canEdit,
      contacts: list.map((c) => {
        const e = (c.email ?? "").toLowerCase();
        const status = c.status === "inactive" ? "inactive"
          : c.user_id || signedIn[e] ? "active"
          : c.invited_at && !c.invite_cancelled_at ? "invited" : "not_invited";
        return {
          id: c.id as string, name: c.full_name as string, title: c.title as string | null,
          email: c.email as string | null, phone: c.phone as string | null,
          // Notes are only returned to client team members and staff (this function is gated to them).
          notes: c.notes as string | null, tags: (c.designations ?? []) as string[],
          isPrimary: Boolean(c.is_primary), personId: c.person_id as string | null,
          status, identity: e ? (kyc[e] ? "verified" : "needed") : "unknown",
          invitedAt: c.invited_at as string | null, inviteCount: c.invite_count as number,
          lastActivity: (last[c.id] ?? c.updated_at) as string,
        };
      }),
    };
  });

export const getContactHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const c = await loadContact(db, data.id);
    await access(context, c.client_id);
    const { data: ev } = await db.from("client_contact_events").select("event_kind, detail, created_at")
      .eq("contact_id", data.id).order("created_at", { ascending: false }).limit(100);
    return (ev ?? []) as { event_kind: string; detail: any; created_at: string }[];
  });

const contactInput = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).or(z.literal("")).optional(),
  phone: z.string().trim().max(40).optional(),
  title: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
  tags: z.array(z.enum(CONTACT_TAGS)).max(10).default([]),
  isPrimary: z.boolean().default(false),
});

export const saveClientContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data, context }) => {
    const a = await access(context, data.clientId);
    if (!a?.canEdit) throw new Error("Only the client's general partners or Harmonious can edit contacts.");
    const db = await admin();
    const email = data.email ? data.email.toLowerCase() : null;
    if (email) {
      let dq = db.from("client_contacts").select("id").eq("client_id", a.clientId).ilike("email", email);
      if (data.id) dq = dq.neq("id", data.id);
      const { data: dup } = await dq.limit(1);
      if (dup?.length) throw new Error("A contact with this email already exists for this client.");
    }
    const row = {
      full_name: data.name, email, phone: data.phone || null, title: data.title || null,
      notes: data.notes || null, designations: data.tags, is_primary: data.isPrimary,
    };
    if (data.isPrimary) await db.from("client_contacts").update({ is_primary: false }).eq("client_id", a.clientId).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    if (data.id) {
      const before = await loadContact(db, data.id);
      if (before.client_id !== a.clientId) throw new Error("Contact not found.");
      const { error } = await db.from("client_contacts").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      const changed = Object.keys(row).filter((k) => JSON.stringify((before as any)[k]) !== JSON.stringify((row as any)[k]));
      await log(db, data.id, a.clientId, context.userId, "edited", {
        changed,
        ...(changed.includes("full_name") ? { name: { from: before.full_name, to: row.full_name } } : {}),
        ...(changed.includes("email") ? { email: { from: before.email, to: row.email } } : {}),
      });
      return { id: data.id, possibleMatch: false };
    }
    const { data: ins, error } = await db.from("client_contacts").insert({ ...row, client_id: a.clientId, created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    await log(db, ins.id, a.clientId, context.userId, "created", {});
    let possibleMatch = false;
    if (email) {
      const { data: p } = await db.from("persons").select("id").ilike("email", email).limit(1);
      possibleMatch = Boolean(p?.length); // suggestion only - never auto-linked or merged
    }
    return { id: ins.id as string, possibleMatch };
  });

export const setClientContactActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const c = await loadContact(db, data.id);
    const a = await access(context, c.client_id);
    if (!a?.canEdit) throw new Error("Not allowed.");
    await db.from("client_contacts").update(data.active
      ? { status: "active", deactivated_at: null, deactivated_by: null }
      : { status: "inactive", deactivated_at: new Date().toISOString(), deactivated_by: context.userId }).eq("id", data.id);
    await log(db, data.id, c.client_id, context.userId, data.active ? "reactivated" : "deactivated");
    return { ok: true };
  });

/** Sends one invite email - only when a person clicks Invite / Resend. Same-day repeats are deduplicated. */
export const inviteClientContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const c = await loadContact(db, data.id);
    const a = await access(context, c.client_id);
    if (!a?.canEdit) throw new Error("Not allowed.");
    if (c.status === "inactive") throw new Error("Reactivate this contact before inviting.");
    if (!c.email) throw new Error("Add an email address first.");
    const { data: client } = await db.from("clients").select("name").eq("id", c.client_id).maybeSingle();
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const day = new Date().toISOString().slice(0, 10);
    await sendTemplateEmail("client-admin-alert", String(c.email).toLowerCase(), {
      templateData: {
        contactName: c.full_name,
        headline: `You're invited to ${client?.name ?? "a Harmonious client"} on Harmonious`,
        intro: `${client?.name ?? "A Harmonious client"} added you as a contact on Harmonious.`,
        actionLabel: "Sign in to Harmonious",
        actionUrl: SIGN_IN_URL,
        footnote: "Sign in or create an account with this email address.",
      },
      idempotencyKey: `client-contact-invite-${c.id}-${day}`,
    });
    await db.from("client_contacts").update({
      invited_at: new Date().toISOString(), invite_count: (c.invite_count ?? 0) + 1,
      last_invited_by: context.userId, invite_cancelled_at: null,
    }).eq("id", c.id);
    await log(db, c.id, c.client_id, context.userId, c.invited_at ? "invite_resent" : "invited", { email: c.email });
    return { ok: true };
  });

export const cancelClientContactInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const c = await loadContact(db, data.id);
    const a = await access(context, c.client_id);
    if (!a?.canEdit) throw new Error("Not allowed.");
    await db.from("client_contacts").update({ invite_cancelled_at: new Date().toISOString() }).eq("id", c.id);
    await log(db, c.id, c.client_id, context.userId, "invite_cancelled");
    return { ok: true };
  });
