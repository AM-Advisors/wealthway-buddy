import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Staff view of how far each client has got through onboarding.
 *
 *  Harmonious records and reports progress here; it does not advise the client
 *  or act on their behalf. */

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "legal",
  "compliance",
  "finance",
  "client_success",
  "executive",
  "operations",
  "fund_administration",
  "tax",
];

async function requireStaff(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => STAFF_ROLES.includes(r))) {
    throw new Error("Forbidden: this area is for the Harmonious team.");
  }
  return { userId: context.userId as string, roles };
}

const days = (from: string | null | undefined) =>
  from ? Math.floor((Date.now() - Date.parse(from)) / 86_400_000) : null;

const latest = (values: Array<string | null | undefined>) =>
  values.filter(Boolean).sort().slice(-1)[0] ?? null;

export const STAGE_LABELS = [
  { key: "invited", label: "Invited" },
  { key: "signed_in", label: "Signed in" },
  { key: "signed_off", label: "Documents signed" },
  { key: "fund_details", label: "Fund details" },
  { key: "invoice", label: "Invoice" },
] as const;

/** Every client, stage by stage, with the ones that have gone quiet flagged. */
export const getOnboardingProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ stallDays: z.number().int().min(1).max(120).default(7) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: clients },
      { data: invitations },
      { data: contacts },
      { data: acceptances },
      { data: policies },
      { data: intakes },
      { data: offerings },
      { data: invoices },
      { data: signIns },
      { data: profiles },
    ] = await Promise.all([
      supabaseAdmin
        .from("clients")
        .select("id, name, legal_name, status, created_at, primary_contact_email")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("client_invitations")
        .select("id, client_id, email, invited_name, status, invite_status, invite_sent_at, accepted_at, created_at"),
      supabaseAdmin.from("client_users").select("id, client_id, user_id, created_at"),
      supabaseAdmin.from("policy_acceptances").select("user_id, kind, version, accepted_at"),
      supabaseAdmin.from("policy_documents").select("kind, version, published").eq("published", true),
      supabaseAdmin.from("client_fund_intakes").select("id, client_id, status, submitted_at, created_at, updated_at"),
      supabaseAdmin.from("offerings").select("id, name, client_id, created_at"),
      supabaseAdmin
        .from("invoices")
        .select("id, client_id, number, status, total_cents, due_date, issued_at, paid_on, created_at"),
      supabaseAdmin
        .from("login_attempts")
        .select("user_id, email, created_at")
        .eq("success", true)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabaseAdmin.from("profiles").select("user_id, email, legal_name"),
    ]);

    const requiredKinds = Array.from(
      new Set(((policies ?? []) as any[]).map((p) => String(p.kind))),
    );
    const documents = ((policies ?? []) as any[]).map((p) => ({
      kind: String(p.kind),
      title: String(p.title ?? p.kind),
    }));

    // Successful sign-ins, by user id and by email (older rows may lack a user id).
    const profileByUser = new Map<string, any>();
    for (const p of (profiles ?? []) as any[]) profileByUser.set(String(p.user_id), p);
    const signInByUser = new Map<string, { count: number; last: string }>();
    const signInByEmail = new Map<string, { count: number; last: string }>();
    for (const row of (signIns ?? []) as any[]) {
      const at = String(row.created_at);
      const bump = (map: Map<string, { count: number; last: string }>, key: string | null) => {
        if (!key) return;
        const prev = map.get(key);
        map.set(key, { count: (prev?.count ?? 0) + 1, last: prev && prev.last > at ? prev.last : at });
      };
      bump(signInByUser, row.user_id ? String(row.user_id) : null);
      bump(signInByEmail, row.email ? String(row.email).toLowerCase() : null);
    }
    const signInFor = (userId: string, email: string | null) => {
      const byUser = signInByUser.get(userId);
      const byEmail = email ? signInByEmail.get(email.toLowerCase()) : undefined;
      if (!byUser) return byEmail ?? null;
      if (!byEmail) return byUser;
      return {
        count: Math.max(byUser.count, byEmail.count),
        last: byUser.last > byEmail.last ? byUser.last : byEmail.last,
      };
    };
    const acceptedByUser = new Map<string, Set<string>>();
    const acceptanceAt = new Map<string, string>();
    for (const row of (acceptances ?? []) as any[]) {
      const uid = String(row.user_id);
      if (!acceptedByUser.has(uid)) acceptedByUser.set(uid, new Set());
      acceptedByUser.get(uid)!.add(String(row.kind));
      const prev = acceptanceAt.get(uid);
      if (!prev || String(row.accepted_at) > prev) acceptanceAt.set(uid, String(row.accepted_at));
    }

    const today = new Date().toISOString().slice(0, 10);

    const rows = ((clients ?? []) as any[]).map((client) => {
      const cid = String(client.id);
      const clientInvites = ((invitations ?? []) as any[]).filter((i) => String(i.client_id) === cid);
      const clientContacts = ((contacts ?? []) as any[]).filter((c) => String(c.client_id) === cid);
      const clientIntakes = ((intakes ?? []) as any[]).filter((i) => String(i.client_id) === cid);
      const clientFunds = ((offerings ?? []) as any[]).filter((o) => String(o.client_id) === cid);
      const clientInvoices = ((invoices ?? []) as any[])
        .filter((i) => String(i.client_id) === cid)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

      const signedInUsers = clientContacts.filter((c) => acceptanceAt.has(String(c.user_id)));
      const fullySignedOff = clientContacts.filter((c) => {
        const set = acceptedByUser.get(String(c.user_id));
        return requiredKinds.length > 0 && set && requiredKinds.every((k) => set.has(k));
      });

      const submittedIntake = clientIntakes.find((i) =>
        ["submitted", "accepted"].includes(String(i.status)),
      );

      const unpaid = clientInvoices.filter((i) =>
        ["issued", "awaiting_payment"].includes(String(i.status)),
      );
      const paid = clientInvoices.filter((i) => String(i.status) === "paid");
      const overdue = unpaid.filter((i) => i.due_date && String(i.due_date) < today);

      const invitedAt = latest(clientInvites.map((i) => i.invite_sent_at ?? i.created_at));
      const signedInAt = latest(signedInUsers.map((c) => acceptanceAt.get(String(c.user_id))));
      const signedOffAt = latest(fullySignedOff.map((c) => acceptanceAt.get(String(c.user_id))));
      const fundAt =
        latest([
          submittedIntake?.submitted_at ?? null,
          ...clientFunds.map((f) => f.created_at as string),
        ]) ?? null;
      const invoiceAt = latest([
        ...clientInvoices.map((i) => i.issued_at as string | null),
        ...paid.map((i) => i.paid_on as string | null),
      ]);

      const stages = [
        {
          key: "invited",
          label: "Invited",
          done: clientInvites.length > 0 || clientContacts.length > 0,
          at: invitedAt,
          detail:
            clientInvites.length > 0
              ? `${clientInvites.length} invitation${clientInvites.length === 1 ? "" : "s"} sent`
              : clientContacts.length > 0
                ? "Contacts attached"
                : "No one invited yet",
        },
        {
          key: "signed_in",
          label: "Signed in",
          done: signedInUsers.length > 0,
          at: signedInAt,
          detail:
            signedInUsers.length > 0
              ? `${signedInUsers.length} of ${clientContacts.length} contacts have used the portal`
              : "No contact has signed in",
        },
        {
          key: "signed_off",
          label: "Documents signed",
          done: fullySignedOff.length > 0,
          at: signedOffAt,
          detail:
            requiredKinds.length === 0
              ? "No documents published"
              : fullySignedOff.length > 0
                ? `${fullySignedOff.length} contact${fullySignedOff.length === 1 ? "" : "s"} accepted all ${requiredKinds.length}`
                : "Privacy notice, terms, fee schedule and e-records still outstanding",
        },
        {
          key: "fund_details",
          label: "Fund details",
          done: Boolean(submittedIntake) || clientFunds.length > 0,
          at: fundAt,
          detail: clientFunds.length
            ? `${clientFunds.length} fund${clientFunds.length === 1 ? "" : "s"} set up`
            : submittedIntake
              ? "Details submitted, waiting on setup"
              : clientIntakes.length
                ? "Draft started, not submitted"
                : "Not started",
        },
        {
          key: "invoice",
          label: "Invoice",
          done: paid.length > 0,
          at: invoiceAt,
          detail: paid.length
            ? `${paid.length} paid${unpaid.length ? `, ${unpaid.length} outstanding` : ""}`
            : overdue.length
              ? `${overdue.length} overdue`
              : unpaid.length
                ? `${unpaid.length} awaiting payment`
                : clientInvoices.length
                  ? "Draft only"
                  : "None raised",
        },
      ];

      const nextStage = stages.find((s) => !s.done) ?? null;
      const lastActivity =
        latest([
          ...stages.map((s) => s.at),
          client.created_at as string,
          ...clientIntakes.map((i) => i.updated_at as string),
        ]) ?? null;
      const quietFor = days(lastActivity);
      const complete = stages.filter((s) => s.done).length;
      const stalled =
        Boolean(nextStage) &&
        String(client.status ?? "active") === "active" &&
        quietFor !== null &&
        quietFor >= data.stallDays;

      return {
        id: cid,
        name: client.legal_name || client.name,
        status: String(client.status ?? "active"),
        contactEmail: client.primary_contact_email ?? clientInvites[0]?.email ?? null,
        contactCount: clientContacts.length,
        stages,
        complete,
        total: stages.length,
        nextStage: nextStage ? nextStage.label : null,
        lastActivity,
        quietFor,
        stalled,
        overdueInvoices: overdue.length,
        unpaidCents: unpaid.reduce((sum, i) => sum + Number(i.total_cents ?? 0), 0),
      };
    });

    return {
      stallDays: data.stallDays,
      clients: rows,
      summary: {
        total: rows.length,
        stalled: rows.filter((r) => r.stalled).length,
        complete: rows.filter((r) => !r.nextStage).length,
        overdue: rows.filter((r) => r.overdueInvoices > 0).length,
      },
    };
  });
