import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Staff-side onboarding portal for a new client.
 *
 *  Harmonious invites the client's people, walks them through the privacy
 *  notice, platform terms, fee schedule and electronic-records consent, shows
 *  them how to ask for anything outside their agreed scope, and keeps a record
 *  of how far each engagement has got. Harmonious administers and records;
 *  it does not advise the client or act for them. */

export const CLIENT_CONTACT_ROLES = [
  { value: "client_gp", label: "General partner / principal", note: "Sees everything for the client." },
  { value: "client_signatory", label: "Authorised signatory", note: "Signs agreements and approvals." },
  { value: "client_finance", label: "Finance", note: "Invoices and payment approvals." },
  { value: "client_legal", label: "Legal", note: "Agreements and scope." },
  { value: "client_compliance", label: "Compliance", note: "Compliance records and holds." },
  { value: "client_readonly", label: "View only", note: "Can look, cannot change anything." },
] as const;

const ROLE_VALUES = CLIENT_CONTACT_ROLES.map((r) => r.value) as unknown as [string, ...string[]];

/** The steps Harmonious completes by hand and ticks off as it goes. */
export const ONBOARDING_STEPS = [
  {
    key: "kickoff",
    label: "Kickoff call held",
    note: "Introduced the team, the platform and what the master service agreement covers.",
    manual: true,
  },
  {
    key: "policy_walkthrough",
    label: "Privacy notice, terms, fee schedule and e-records walked through",
    note: "Each contact is asked to accept these the first time they sign in.",
    manual: true,
  },
  {
    key: "scope_walkthrough",
    label: "Out-of-scope request shown",
    note: "Showed the client how anything outside the statement of work is requested, quoted and signed before it starts.",
    manual: true,
  },
  {
    key: "portal_handover",
    label: "Client portal handed over",
    note: "Client can see their funds, agreement, invoices and approved payments.",
    manual: true,
  },
] as const;

const CONTRACT_ROLES = ["admin", "super_admin", "legal", "compliance", "finance", "client_success", "executive"];
const STAFF_ROLES = [
  ...CONTRACT_ROLES,
  "operations",
  "fund_administration",
  "tax",
];

async function whoIs(context: any) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId as string,
    roles,
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    canManage: roles.some((r) => CONTRACT_ROLES.includes(r)),
    email: (context.claims?.email as string | undefined) ?? "",
  };
}

async function requireStaff(context: any) {
  const who = await whoIs(context);
  if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");
  return who;
}

async function requireManage(context: any) {
  const who = await whoIs(context);
  if (!who.canManage) {
    throw new Error(
      "Forbidden: inviting a client's people needs legal, compliance, finance, client success, executive or admin authority.",
    );
  }
  return who;
}

async function audit(
  context: any,
  who: { userId: string; roles: string[] },
  entry: { action: string; clientId: string; target?: string | null; previous?: unknown; next?: unknown },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: who.userId,
    actor_role: who.roles.join(", ") || null,
    client_id: entry.clientId,
    area: "onboarding",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

/* -------------------------------------------------------------------- read */

/** Every client with how far onboarding has got, plus the detail for one. */
export const getClientOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const who = await requireStaff(context);

    const [{ data: clients }, { data: funds }, { data: sows }, { data: entitlements }, { data: prices }] =
      await Promise.all([
        context.supabase.from("clients").select("*").order("created_at", { ascending: false }),
        context.supabase.from("offerings").select("id, name, client_id, is_open"),
        context.supabase.from("client_sows").select("id, client_id, title, status, signed_on, offering_id"),
        context.supabase.from("service_entitlements").select("id, client_id, status"),
        context.supabase.from("client_pricing").select("id, client_id"),
      ]);

    const [{ data: contacts }, { data: invites }, { data: requests }, { data: steps }] = await Promise.all([
      context.supabase.from("client_users").select("*"),
      context.supabase
        .from("client_invitations")
        .select("*")
        .order("created_at", { ascending: false }),
      context.supabase
        .from("service_requests")
        .select("id, client_id, status, created_at, service_id")
        .order("created_at", { ascending: false }),
      context.supabase
        .from("contract_audit_events")
        .select("client_id, action, target, actor_id, created_at")
        .eq("area", "onboarding")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const doneSteps = new Map<string, { at: string; reopened: boolean }>();
    for (const row of ((steps ?? []) as any[]).slice().reverse()) {
      if (!row.target) continue;
      doneSteps.set(`${row.client_id}:${row.target}`, {
        at: row.created_at,
        reopened: row.action === "step reopened",
      });
    }

    const rows = ((clients ?? []) as any[]).map((client) => {
      const clientFunds = ((funds ?? []) as any[]).filter((f) => f.client_id === client.id);
      const clientSows = ((sows ?? []) as any[]).filter((s) => s.client_id === client.id);
      const clientContacts = ((contacts ?? []) as any[]).filter((c) => c.client_id === client.id);
      const clientInvites = ((invites ?? []) as any[]).filter((i) => i.client_id === client.id);
      const inScope = ((entitlements ?? []) as any[]).filter(
        (e) => e.client_id === client.id && e.status === "included",
      );
      const clientPrices = ((prices ?? []) as any[]).filter((p) => p.client_id === client.id);
      const clientRequests = ((requests ?? []) as any[]).filter((r) => r.client_id === client.id);

      const automatic = [
        { key: "msa", label: "Master service agreement signed", done: Boolean(client.msa_signed_on) },
        {
          key: "sow",
          label: "Statement of work active",
          done: clientSows.some((s) => s.status === "active" || s.status === "signed"),
        },
        { key: "fund", label: "Fund linked to the client", done: clientFunds.length > 0 },
        { key: "scope", label: "Services in scope recorded", done: inScope.length > 0 },
        { key: "rates", label: "Contracted rates recorded", done: clientPrices.length > 0 },
        {
          key: "contacts",
          label: "Client contacts invited",
          done: clientContacts.length > 0 || clientInvites.some((i) => i.status === "pending"),
        },
        {
          key: "signed_in",
          label: "A contact has signed in",
          done: clientContacts.length > 0,
        },
      ];

      const manual = ONBOARDING_STEPS.map((s) => {
        const hit = doneSteps.get(`${client.id}:${s.key}`);
        return {
          key: s.key,
          label: s.label,
          note: s.note,
          done: Boolean(hit && !hit.reopened),
          at: hit && !hit.reopened ? hit.at : null,
        };
      });

      const all = [...automatic, ...manual];
      const complete = all.filter((s) => s.done).length;

      return {
        ...client,
        funds: clientFunds,
        sows: clientSows,
        contacts: clientContacts,
        invitations: clientInvites,
        inScopeCount: inScope.length,
        rateCount: clientPrices.length,
        requestCount: clientRequests.length,
        openRequests: clientRequests.filter((r) =>
          ["requested", "in_review", "quoted"].includes(String(r.status)),
        ).length,
        automatic,
        manual,
        complete,
        total: all.length,
      };
    });

    const selectedId =
      (data.clientId && rows.some((r) => r.id === data.clientId) ? data.clientId : rows[0]?.id) ?? null;
    const selected = rows.find((r) => r.id === selectedId) ?? null;

    // People and what they have accepted. Only administrators may read other
    // people's acceptance records, so this is best-effort for other staff.
    let people: any[] = [];
    let policies: any[] = [];
    if (selected) {
      const userIds = selected.contacts.map((c: any) => String(c.user_id));
      const [{ data: profiles }, { data: acceptances }, { data: docs }] = await Promise.all([
        userIds.length
          ? context.supabase.from("profiles").select("user_id, email, legal_name").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? context.supabase
              .from("policy_acceptances")
              .select("user_id, kind, version, accepted_at, signer_name")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        context.supabase
          .from("policy_documents")
          .select("id, kind, title, version")
          .eq("published", true)
          .order("version", { ascending: false }),
      ]);

      const current = new Map<string, any>();
      for (const doc of (docs ?? []) as any[]) if (!current.has(doc.kind)) current.set(doc.kind, doc);
      policies = [...current.values()];

      people = selected.contacts.map((c: any) => {
        const profile = ((profiles ?? []) as any[]).find((p) => p.user_id === c.user_id);
        const mine = ((acceptances ?? []) as any[]).filter((a) => a.user_id === c.user_id);
        return {
          ...c,
          email: profile?.email ?? null,
          name: profile?.legal_name ?? null,
          accepted: policies.map((p) => ({
            kind: p.kind,
            title: p.title,
            version: p.version,
            at: mine.find((a) => a.kind === p.kind && a.version === p.version)?.accepted_at ?? null,
          })),
        };
      });
    }

    const activity = ((steps ?? []) as any[]).filter((s) => !selectedId || s.client_id === selectedId).slice(0, 40);

    return {
      canManage: who.canManage,
      clients: rows,
      selectedId,
      selected,
      people,
      policies,
      activity,
    };
  });

/* ------------------------------------------------------------------ writes */

export const inviteClientContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        email: z.string().trim().email().max(200),
        name: z.string().trim().max(160).optional().or(z.literal("")),
        role: z.enum(ROLE_VALUES),
        canApprove: z.boolean().default(false),
        note: z.string().trim().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireManage(context);
    const email = data.email.toLowerCase();

    const { data: existing } = await context.supabase
      .from("client_invitations")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("status", "pending")
      .ilike("email", email)
      .maybeSingle();
    if (existing) throw new Error("That person already has an invitation waiting for this client.");

    const { data: created, error } = await context.supabase
      .from("client_invitations")
      .insert({
        client_id: data.clientId,
        email,
        invited_name: data.name || null,
        client_role: data.role,
        can_approve: data.canApprove,
        note: data.note || null,
        invited_by: who.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // If they already have an account, attach them now rather than waiting for
    // a first sign-in that has already happened.
    let attached = false;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: found } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = (found?.users ?? []).find(
      (u: any) => String(u.email ?? "").toLowerCase() === email && u.email_confirmed_at,
    );
    if (match) {
      await supabaseAdmin
        .from("client_users")
        .upsert(
          {
            client_id: data.clientId,
            user_id: match.id,
            client_role: data.role,
            can_approve: data.canApprove,
          },
          { onConflict: "client_id,user_id" },
        );
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: match.id, role: data.role as never }, { onConflict: "user_id,role" });
      await supabaseAdmin
        .from("client_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: match.id })
        .eq("id", (created as any).id);
      attached = true;
    }

    await audit(context, who, {
      action: attached ? "contact added" : "contact invited",
      clientId: data.clientId,
      target: email,
      next: { role: data.role, can_approve: data.canApprove, attached },
    });
    return { ok: true, attached };
  });

export const cancelClientInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireManage(context);
    const { data: row } = await context.supabase
      .from("client_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That invitation is no longer there.");
    if ((row as any).status !== "pending") throw new Error("That invitation has already been used or withdrawn.");

    const { error } = await context.supabase
      .from("client_invitations")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "invitation withdrawn",
      clientId: (row as any).client_id,
      target: (row as any).email,
      previous: { status: "pending" },
      next: { status: "cancelled" },
    });
    return { ok: true };
  });

export const setContactAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        role: z.enum(ROLE_VALUES).optional(),
        canApprove: z.boolean().optional(),
        remove: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireManage(context);
    const { data: row } = await context.supabase
      .from("client_users")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That contact is no longer attached to this client.");

    if (data.remove) {
      const { error } = await context.supabase.from("client_users").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context, who, {
        action: "contact access removed",
        clientId: (row as any).client_id,
        target: String((row as any).user_id),
        previous: { role: (row as any).client_role, can_approve: (row as any).can_approve },
      });
      return { ok: true };
    }

    const patch: any = {};
    if (data.role) patch.client_role = data.role;
    if (data.canApprove !== undefined) patch.can_approve = data.canApprove;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await context.supabase.from("client_users").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "contact access changed",
      clientId: (row as any).client_id,
      target: String((row as any).user_id),
      previous: { role: (row as any).client_role, can_approve: (row as any).can_approve },
      next: patch,
    });
    return { ok: true };
  });

export const markOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        step: z.enum(ONBOARDING_STEPS.map((s) => s.key) as unknown as [string, ...string[]]),
        done: z.boolean(),
        note: z.string().trim().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireStaff(context);
    await audit(context, who, {
      action: data.done ? "step completed" : "step reopened",
      clientId: data.clientId,
      target: data.step,
      next: data.note ? { note: data.note } : null,
    });
    return { ok: true };
  });
