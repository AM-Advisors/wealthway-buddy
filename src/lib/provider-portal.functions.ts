import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

export const PROVIDER_BUCKET = "provider-uploads";

export const SUBMISSION_STATUSES = [
  { value: "submitted", label: "Waiting for review" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;

export const DOCUMENT_TYPES = [
  { value: "invoice", label: "Invoice" },
  { value: "contract", label: "Contract or order form" },
  { value: "insurance", label: "Insurance certificate" },
  { value: "security", label: "Security report" },
  { value: "w9", label: "Tax form (W-9 / W-8)" },
  { value: "other", label: "Other" },
] as const;

type Who = { userId: string; roles: string[]; isStaff: boolean; canManage: boolean };

async function whoIs(context: any): Promise<Who> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId,
    roles,
    isStaff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)),
    canManage: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
  };
}

async function requireStaff(context: any) {
  const who = await whoIs(context);
  if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");
  return who;
}

async function requireContractAuthority(context: any) {
  const who = await whoIs(context);
  if (!who.canManage) {
    throw new Error(
      "Forbidden: reviewing provider submissions needs legal, compliance, finance, client success, executive or admin authority.",
    );
  }
  return who;
}

async function audit(
  context: any,
  entry: {
    actorId: string;
    actorRole: string;
    area: string;
    action: string;
    target?: string | null;
    clientId?: string | null;
    offeringId?: string | null;
    previous?: unknown;
    next?: unknown;
  },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    client_id: entry.clientId ?? null,
    offering_id: entry.offeringId ?? null,
    area: entry.area,
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

/** The providers this signed-in person is a contact for. Matching is by their
 *  sign-in first, then by the email Harmonious recorded for them. */
async function myProviders(context: any) {
  const { data } = await context.supabase
    .from("provider_users")
    .select("id, provider_id, email, contact_name, title, user_id, status");
  const rows = ((data ?? []) as any[]).filter((r) => r.status === "active");
  return rows;
}

async function assertMember(context: any, providerId: string) {
  const rows = await myProviders(context);
  const row = rows.find((r) => r.provider_id === providerId);
  if (!row) throw new Error("You aren't listed as a contact for that provider.");
  // Claim the sign-in against the invited email so later checks are direct.
  if (!row.user_id) {
    await context.supabase
      .from("provider_users")
      .update({ user_id: context.userId })
      .eq("id", row.id);
  }
  return row;
}

/** Everything a provider contact sees: their own company record, the costs they
 *  have submitted, the documents they have sent and where each one stands. */
export const getProviderPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ providerId: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const contacts = await myProviders(context);
    const providerIds = [...new Set(contacts.map((c) => String(c.provider_id)))];
    if (providerIds.length === 0) return { providers: [], provider: null } as const;

    const { data: providerRows } = await context.supabase
      .from("third_party_providers")
      .select("id, name, provider_type, service_dependency, contract_status, status, sla, retired_at")
      .in("id", providerIds)
      .order("name");

    const providers = providerRows ?? [];
    const selectedId =
      data.providerId && providerIds.includes(data.providerId)
        ? data.providerId
        : ((providers[0]?.id as string | undefined) ?? providerIds[0]!);

    await assertMember(context, selectedId);

    const [{ data: submissions }, { data: documents }] = await Promise.all([
      context.supabase
        .from("provider_expense_submissions")
        .select("*")
        .eq("provider_id", selectedId)
        .order("submitted_at", { ascending: false })
        .limit(200),
      context.supabase
        .from("provider_documents")
        .select("*")
        .eq("provider_id", selectedId)
        .order("submitted_at", { ascending: false })
        .limit(200),
    ]);

    return {
      providers,
      provider: providers.find((p: any) => p.id === selectedId) ?? null,
      contact: contacts.find((c) => c.provider_id === selectedId) ?? null,
      submissions: submissions ?? [],
      documents: documents ?? [],
    };
  });

/** A provider sends Harmonious a cost they have incurred. It is a request to
 *  record the cost — nothing is billed to a client until Harmonious accepts it. */
export const submitProviderExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        providerId: z.string().uuid(),
        description: z.string().min(2),
        amountCents: z.number().int().positive(),
        currency: z.string().min(3).max(3).default("USD"),
        incurredOn: z.string().min(4),
        reference: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
        filePath: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, data.providerId);
    const { data: row, error } = await context.supabase
      .from("provider_expense_submissions")
      .insert({
        provider_id: data.providerId,
        description: data.description.trim(),
        amount_cents: data.amountCents,
        currency: data.currency.toUpperCase(),
        incurred_on: data.incurredOn,
        reference: data.reference?.trim() || null,
        note: data.note?.trim() || null,
        file_path: data.filePath || null,
        submitted_by: context.userId,
        status: "submitted",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await audit(context, {
      actorId: context.userId,
      actorRole: "provider",
      area: "provider submission",
      action: "submitted",
      target: row.description,
      next: {
        provider_id: data.providerId,
        amount_cents: data.amountCents,
        incurred_on: data.incurredOn,
        status: "submitted",
      },
    });
    return row;
  });

/** A provider takes back a cost that hasn't been reviewed yet. */
export const withdrawProviderExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("provider_expense_submissions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("That submission is not available.");
    await assertMember(context, String(existing.provider_id));
    if (existing.status !== "submitted") {
      throw new Error("This submission has already been reviewed.");
    }

    const { error } = await context.supabase
      .from("provider_expense_submissions")
      .update({ status: "withdrawn" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, {
      actorId: context.userId,
      actorRole: "provider",
      area: "provider submission",
      action: "withdrawn",
      target: existing.description,
      previous: { status: existing.status },
      next: { status: "withdrawn" },
    });
    return { ok: true };
  });

/** A provider uploads a document: an invoice, a contract, an insurance
 *  certificate, a tax form or a security report. */
export const submitProviderDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        providerId: z.string().uuid(),
        title: z.string().min(2),
        docType: z.string().min(2),
        filePath: z.string().min(3),
        fileName: z.string().optional().nullable(),
        expiresOn: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, data.providerId);
    const { data: row, error } = await context.supabase
      .from("provider_documents")
      .insert({
        provider_id: data.providerId,
        title: data.title.trim(),
        doc_type: data.docType,
        file_path: data.filePath,
        file_name: data.fileName || null,
        expires_on: data.expiresOn || null,
        note: data.note?.trim() || null,
        submitted_by: context.userId,
        status: "submitted",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await audit(context, {
      actorId: context.userId,
      actorRole: "provider",
      area: "provider document",
      action: "submitted",
      target: row.title,
      next: { provider_id: data.providerId, doc_type: data.docType, status: "submitted" },
    });
    return row;
  });

/** A short-lived link to a provider file, for whoever is allowed to read it. */
export const getProviderFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from(PROVIDER_BUCKET)
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });

/** The Harmonious queue: everything providers have sent, oldest waiting first,
 *  plus the contacts who can sign in and the recent trail of decisions. */
export const getProviderSubmissionsBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const [
      { data: submissions },
      { data: documents },
      { data: providers },
      { data: contacts },
      { data: clients },
      { data: funds },
      { data: items },
    ] = await Promise.all([
      context.supabase
        .from("provider_expense_submissions")
        .select("*")
        .order("submitted_at", { ascending: true })
        .limit(500),
      context.supabase
        .from("provider_documents")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(500),
      context.supabase
        .from("third_party_providers")
        .select("id, name, provider_type, contract_status, status, retired_at")
        .order("name"),
      context.supabase
        .from("provider_users")
        .select("*")
        .order("created_at", { ascending: false }),
      context.supabase.from("clients").select("id, name").order("name"),
      context.supabase.from("offerings").select("id, name, client_id").order("name"),
      context.supabase
        .from("pricing_items")
        .select("id, label, amount_cents, version_id")
        .eq("pass_through", true)
        .order("sort_order"),
    ]);

    const providerById = new Map((providers ?? []).map((p: any) => [p.id, p]));
    const decorate = (rows: any[]) =>
      rows.map((r) => ({ ...r, providerName: providerById.get(r.provider_id)?.name ?? "Unknown" }));

    return {
      canManage: who.canManage,
      submissions: decorate(submissions ?? []),
      documents: decorate(documents ?? []),
      providers: providers ?? [],
      contacts: decorate(contacts ?? []),
      clients: clients ?? [],
      funds: funds ?? [],
      rateItems: items ?? [],
    };
  });

/** Harmonious accepts or declines a submitted cost. Accepting records it as a
 *  pass-through cost against the client and fund, so it can be billed on. */
export const reviewProviderExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["accepted", "declined"]),
        clientId: z.string().uuid().optional().nullable(),
        offeringId: z.string().uuid().optional().nullable(),
        pricingItemId: z.string().uuid().optional().nullable(),
        reviewNote: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: sub } = await context.supabase
      .from("provider_expense_submissions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!sub) throw new Error("That submission is not available.");
    if (sub.status !== "submitted") throw new Error("This submission has already been handled.");

    let expenseId: string | null = null;
    if (data.decision === "accepted") {
      if (!data.clientId) {
        throw new Error("Choose which client this cost belongs to before accepting it.");
      }
      const { data: expense, error: expenseError } = await context.supabase
        .from("pass_through_expenses")
        .insert({
          client_id: data.clientId,
          offering_id: data.offeringId || null,
          provider_id: sub.provider_id,
          pricing_item_id: data.pricingItemId || null,
          description: sub.description,
          amount_cents: sub.amount_cents,
          currency: sub.currency,
          incurred_on: sub.incurred_on,
          reference: sub.reference,
          note: sub.note,
          billing_status: "unbilled",
          recorded_by: who.userId,
        })
        .select("id")
        .single();
      if (expenseError) throw new Error(expenseError.message);
      expenseId = expense.id as string;
    }

    const { error } = await context.supabase
      .from("provider_expense_submissions")
      .update({
        status: data.decision,
        client_id: data.clientId || sub.client_id,
        offering_id: data.offeringId || sub.offering_id,
        review_note: data.reviewNote?.trim() || null,
        reviewed_by: who.userId,
        reviewed_at: new Date().toISOString(),
        expense_id: expenseId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, {
      actorId: who.userId,
      actorRole: who.roles.join(", ") || "staff",
      clientId: data.clientId || sub.client_id,
      offeringId: data.offeringId || sub.offering_id,
      area: "provider submission",
      action: data.decision,
      target: sub.description,
      previous: { status: sub.status, expense_id: sub.expense_id },
      next: {
        status: data.decision,
        expense_id: expenseId,
        amount_cents: sub.amount_cents,
        note: data.reviewNote?.trim() || null,
      },
    });
    return { ok: true, expenseId };
  });

/** Harmonious accepts or rejects a document a provider uploaded. */
export const reviewProviderDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["accepted", "rejected"]),
        reviewNote: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const { data: doc } = await context.supabase
      .from("provider_documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("That document is not available.");

    const { error } = await context.supabase
      .from("provider_documents")
      .update({
        status: data.decision,
        review_note: data.reviewNote?.trim() || null,
        reviewed_by: who.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, {
      actorId: who.userId,
      actorRole: who.roles.join(", ") || "staff",
      area: "provider document",
      action: data.decision,
      target: doc.title,
      previous: { status: doc.status },
      next: { status: data.decision, note: data.reviewNote?.trim() || null },
    });
    return { ok: true };
  });

/** Give a provider contact access to the portal, or take it away. */
export const setProviderContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        providerId: z.string().uuid(),
        email: z.string().email(),
        contactName: z.string().optional().nullable(),
        title: z.string().optional().nullable(),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireContractAuthority(context);
    const email = data.email.trim().toLowerCase();

    const { data: existing } = await context.supabase
      .from("provider_users")
      .select("id, status")
      .eq("provider_id", data.providerId)
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("provider_users")
        .update({
          status: data.active ? "active" : "revoked",
          contact_name: data.contactName?.trim() || null,
          title: data.title?.trim() || null,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("provider_users").insert({
        provider_id: data.providerId,
        email,
        contact_name: data.contactName?.trim() || null,
        title: data.title?.trim() || null,
        status: data.active ? "active" : "revoked",
        invited_by: who.userId,
      });
      if (error) throw new Error(error.message);
    }

    await audit(context, {
      actorId: who.userId,
      actorRole: who.roles.join(", ") || "staff",
      area: "provider access",
      action: data.active ? "granted" : "removed",
      target: email,
      next: { provider_id: data.providerId, email, active: data.active },
    });
    return { ok: true };
  });
