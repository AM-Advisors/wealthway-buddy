import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TimelineStepKey =
  | "invited"
  | "account"
  | "application"
  | "identity"
  | "screening"
  | "accreditation"
  | "documents"
  | "wire_submitted"
  | "wire_approved"
  | "funded";

export const TIMELINE_STEPS: { key: TimelineStepKey; label: string }[] = [
  { key: "invited", label: "Invited" },
  { key: "account", label: "Account created" },
  { key: "application", label: "Application started" },
  { key: "identity", label: "Identity verified" },
  { key: "screening", label: "Screening cleared" },
  { key: "accreditation", label: "Accreditation approved" },
  { key: "documents", label: "Documents signed" },
  { key: "wire_submitted", label: "Payment confirmed by investor" },
  { key: "wire_approved", label: "Payment approved" },
  { key: "funded", label: "Funded" },
];

export type TimelineStep = {
  key: TimelineStepKey;
  label: string;
  state: "done" | "current" | "pending" | "attention";
  at: string | null;
  detail: string | null;
};

export type TimelineEvent = {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
};

export type InvestorTimeline = {
  applicationId: string;
  name: string;
  email: string | null;
  commitmentCents: number | null;
  status: string;
  updatedAt: string;
  steps: TimelineStep[];
  events: TimelineEvent[];
};

const schema = z.object({ offeringId: z.string().uuid() });

async function reviewerScope(supabase: any, userId: string, offeringId: string) {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  const list = (roles ?? []).map((r: any) => r.role as string);
  if (list.length === 0) throw new Error("Forbidden: reviewer access required.");
  if (list.includes("admin")) return;
  const { data: assigned } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (!assigned) throw new Error("Forbidden: you do not manage this fund.");
}

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const STATUS_FIELD_LABELS: Record<string, string> = {
  kyc_status: "Identity check",
  aml_status: "Screening",
  accreditation_status: "Accreditation",
  documents_status: "Documents",
  funding_status: "Funding",
  status: "Application",
};

function pretty(value: string | null) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

/** Full step-by-step journey for every investor in one fund, from invitation to funding. */
export const getFundTimelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await reviewerScope(supabase, userId, data.offeringId);

    const { data: apps, error: appsError } = await supabase
      .from("investor_applications")
      .select(
        "id, user_id, status, current_step, source, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, submitted_at, created_at, updated_at",
      )
      .eq("offering_id", data.offeringId)
      .order("updated_at", { ascending: false })
      .limit(300);
    if (appsError) throw new Error(appsError.message);
    const applications = (apps ?? []) as any[];
    const appIds = applications.map((a) => a.id as string);
    const userIds = [...new Set(applications.map((a) => a.user_id as string))];

    const none = { data: [] as any[] };
    const byApp = (table: string, columns: string) =>
      appIds.length ? supabase.from(table).select(columns).in("application_id", appIds) : none;

    const [
      { data: profiles },
      { data: offeringDocs },
      { data: sigs },
      { data: kyc },
      { data: aml },
      { data: accreditation },
      { data: acks },
      { data: wires },
      { data: payments },
      { data: flags },
      { data: notes },
      { data: notifications },
      { data: invitations },
    ] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id, legal_name, email, created_at").in("user_id", userIds)
        : none,
      supabase
        .from("offering_documents")
        .select("id, title, requires_signature")
        .eq("offering_id", data.offeringId),
      byApp("document_signatures", "application_id, offering_document_id, signed_at"),
      byApp("kyc_verifications", "application_id, status, completed_at, created_at"),
      byApp("aml_screenings", "application_id, status, completed_at, created_at"),
      byApp("accreditation_records", "application_id, reg_type, status, attested_at, verified_at"),
      byApp("funding_acknowledgements", "application_id, method, acknowledged_at"),
      byApp(
        "wire_confirmations",
        "application_id, amount_cents, sent_on, sending_bank_name, sending_account_last4, status, review_notes, reviewed_at, created_at",
      ),
      byApp("payments", "application_id, method, amount_cents, status, confirmed_at, created_at"),
      byApp("application_flags", "application_id, category, severity, note, status, created_at, resolved_at"),
      byApp("admin_notes", "application_id, body, created_at"),
      appIds.length
        ? supabase
            .from("notification_events")
            .select("application_id, event_kind, field, old_value, new_value, created_at")
            .in("application_id", appIds)
            .order("created_at", { ascending: true })
            .limit(2000)
        : none,
      supabase
        .from("fund_invitations")
        .select("email, role, status, created_at, accepted_at")
        .eq("offering_id", data.offeringId),
    ]);

    const profileMap = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));
    const docTitle = new Map(((offeringDocs ?? []) as any[]).map((d) => [d.id as string, d.title as string]));
    const requiredDocIds = ((offeringDocs ?? []) as any[])
      .filter((d) => d.requires_signature)
      .map((d) => d.id as string);
    const invitationByEmail = new Map(
      ((invitations ?? []) as any[])
        .filter((i) => i.role === "investor")
        .map((i) => [String(i.email).toLowerCase(), i]),
    );

    const pick = (rows: any[] | null | undefined, id: string) =>
      ((rows ?? []) as any[]).filter((r) => r.application_id === id);

    const timelines: InvestorTimeline[] = applications.map((app) => {
      const profile = profileMap.get(app.user_id);
      const email = (profile?.email as string) ?? null;
      const invite = email ? invitationByEmail.get(email.toLowerCase()) : undefined;

      const appSigs = pick(sigs, app.id);
      const appKyc = pick(kyc, app.id);
      const appAml = pick(aml, app.id);
      const appAcc = pick(accreditation, app.id);
      const appAcks = pick(acks, app.id);
      const appWires = pick(wires, app.id).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const appPayments = pick(payments, app.id);
      const appFlags = pick(flags, app.id);
      const appNotes = pick(notes, app.id);
      const appNotifications = pick(notifications, app.id);

      const events: TimelineEvent[] = [];
      const add = (at: string | null | undefined, kind: string, title: string, detail?: string | null) => {
        if (!at) return;
        events.push({ at, kind, title, detail: detail ?? null });
      };

      if (invite) {
        add(invite.created_at, "invitation", "Invitation sent", email);
        add(invite.accepted_at, "invitation", "Invitation accepted", email);
      }
      add(profile?.created_at, "account", "Investor account created", email);
      add(app.created_at, "application", "Application started", `Source: ${pretty(app.source)}`);
      add(app.submitted_at, "application", "Application submitted", null);

      for (const k of appKyc) {
        add(k.created_at, "identity", "Identity check started", null);
        add(k.completed_at, "identity", `Identity check ${pretty(k.status)}`, null);
      }
      for (const a of appAml) {
        add(a.completed_at, "screening", `Screening ${pretty(a.status)}`, null);
      }
      for (const a of appAcc) {
        add(a.attested_at, "accreditation", "Accreditation questionnaire signed", `Reg D ${a.reg_type}`);
        add(a.verified_at, "accreditation", `Accreditation ${pretty(a.status)}`, null);
      }
      for (const s of appSigs) {
        add(s.signed_at, "document", "Document signed", docTitle.get(s.offering_document_id) ?? "Fund document");
      }
      for (const a of appAcks) {
        add(a.acknowledged_at, "funding", "Payment instructions acknowledged", pretty(a.method));
      }
      for (const w of appWires) {
        add(
          w.created_at,
          "wire",
          "Wire confirmation submitted",
          [money(w.amount_cents), w.sending_bank_name, w.sending_account_last4 ? `••${w.sending_account_last4}` : null]
            .filter(Boolean)
            .join(" · "),
        );
        if (w.reviewed_at) {
          add(
            w.reviewed_at,
            "wire",
            w.status === "approved" ? "Wire approved" : `Wire ${pretty(w.status)}`,
            w.review_notes ?? null,
          );
        }
      }
      for (const p of appPayments) {
        add(p.confirmed_at, "funding", "Funds settled", money(p.amount_cents));
      }
      for (const f of appFlags) {
        add(f.created_at, "flag", `Issue raised: ${pretty(f.category)}`, `${pretty(f.severity)} · ${f.note}`);
        add(f.resolved_at, "flag", "Issue resolved", f.note);
      }
      for (const n of appNotes) {
        add(n.created_at, "note", "Reviewer note", String(n.body).slice(0, 300));
      }
      for (const n of appNotifications) {
        if (n.event_kind !== "status_changed" || !n.field) continue;
        add(
          n.created_at,
          "status",
          `${STATUS_FIELD_LABELS[n.field] ?? pretty(n.field)} changed`,
          `${pretty(n.old_value)} → ${pretty(n.new_value)}`,
        );
      }

      events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

      const signedIds = new Set(appSigs.map((s) => s.offering_document_id as string));
      const allDocsSigned =
        requiredDocIds.length > 0 && requiredDocIds.every((id) => signedIds.has(id));
      const lastSignedAt = appSigs
        .map((s) => s.signed_at as string | null)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] as string | undefined;

      const approvedWire = appWires.find((w) => w.status === "approved");
      const pendingWire = appWires.find((w) => w.status === "submitted" || w.status === "pending");
      const rejectedWire = appWires.find((w) => w.status === "rejected");
      const settledPayment = appPayments.find((p) => p.status === "settled");

      const kycDone = app.kyc_status === "approved";
      const amlDone = app.aml_status === "approved";
      const accDone = app.accreditation_status === "approved";
      const declined = (s: string) => s === "declined";

      const stepData: Record<TimelineStepKey, { done: boolean; at: string | null; detail: string | null; attention?: boolean }> = {
        invited: {
          done: Boolean(invite),
          at: (invite?.created_at as string) ?? null,
          detail: invite ? `Invitation ${pretty(invite.status)}` : "No invitation on record",
        },
        account: {
          done: Boolean(profile?.created_at),
          at: (profile?.created_at as string) ?? null,
          detail: email,
        },
        application: {
          done: true,
          at: app.created_at as string,
          detail: `Source: ${pretty(app.source)}`,
        },
        identity: {
          done: kycDone,
          at: (appKyc.find((k) => k.completed_at)?.completed_at as string) ?? null,
          detail: pretty(app.kyc_status),
          attention: declined(app.kyc_status),
        },
        screening: {
          done: amlDone,
          at: (appAml.find((a) => a.completed_at)?.completed_at as string) ?? null,
          detail: pretty(app.aml_status),
          attention: declined(app.aml_status),
        },
        accreditation: {
          done: accDone,
          at: (appAcc.find((a) => a.verified_at)?.verified_at as string) ?? null,
          detail: appAcc[0]?.reg_type ? `Reg D ${appAcc[0].reg_type} · ${pretty(app.accreditation_status)}` : pretty(app.accreditation_status),
          attention: declined(app.accreditation_status),
        },
        documents: {
          done: allDocsSigned || app.documents_status === "approved",
          at: lastSignedAt ?? null,
          detail: `${signedIds.size} of ${requiredDocIds.length || signedIds.size} signed`,
        },
        wire_submitted: {
          done: Boolean(approvedWire || pendingWire || rejectedWire),
          at: (appWires[0]?.created_at as string) ?? null,
          detail: pendingWire ? "Awaiting your review" : appWires.length ? pretty(appWires[appWires.length - 1].status) : null,
          attention: Boolean(rejectedWire && !approvedWire),
        },
        wire_approved: {
          done: Boolean(approvedWire),
          at: (approvedWire?.reviewed_at as string) ?? null,
          detail: approvedWire ? money(approvedWire.amount_cents) : pendingWire ? "Waiting on approval" : null,
        },
        funded: {
          done: app.funding_status === "settled" || Boolean(settledPayment),
          at: (settledPayment?.confirmed_at as string) ?? null,
          detail: money(app.commitment_cents),
        },
      };

      let currentAssigned = false;
      const steps: TimelineStep[] = TIMELINE_STEPS.map(({ key, label }) => {
        const s = stepData[key];
        let state: TimelineStep["state"];
        if (s.attention) state = "attention";
        else if (s.done) state = "done";
        else if (!currentAssigned) {
          state = "current";
          currentAssigned = true;
        } else state = "pending";
        return { key, label, state, at: s.at, detail: s.detail };
      });

      return {
        applicationId: app.id as string,
        name: (profile?.legal_name as string) ?? "Investor",
        email,
        commitmentCents: (app.commitment_cents as number) ?? null,
        status: app.status as string,
        updatedAt: app.updated_at as string,
        steps,
        events,
      };
    });

    return { timelines };
  });
