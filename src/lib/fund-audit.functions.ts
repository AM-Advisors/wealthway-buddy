import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export type FundAuditEntry = {
  id: string;
  at: string;
  who: string;
  role: string | null;
  action: string;
  status: string | null;
  details: { label: string; value: string }[];
  source: string;
};

const nice = (v: string | null | undefined) => (v ? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
const SECRET = /account|routing|swift|iban|tin|ssn|ein|tax_id/i;
const show = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  const t = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (SECRET.test(k) && t.length > 4) return `••${t.slice(-4)}`;
  return t.length > 300 ? `${t.slice(0, 300)}…` : t;
};
const flat = (o: unknown) =>
  o && typeof o === "object" && !Array.isArray(o)
    ? Object.entries(o as Record<string, unknown>).map(([k, v]) => ({ label: nice(k), value: show(k, v) }))
    : o == null ? [] : [{ label: "Detail", value: show("", o) }];

/** Read-only, merged audit history for one fund. Caller must have access to the fund. */
export const fundAuditHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/fund-tabs.server");
    await s.assertFund(context.userId, data.fundId);
    const d: any = await s.db();
    const id = data.fundId;
    const { data: setups } = await d.from("fund_setups").select("id").eq("offering_id", id);
    const setupIds = ((setups ?? []) as { id: string }[]).map((x) => x.id);
    const [audit, subs, names, events] = await Promise.all([
      d.from("offering_audit_events").select("id,event_type,changes,summary,actor_id,actor_email,actor_name,created_at").eq("offering_id", id).order("created_at", { ascending: false }).limit(500),
      d.from("fund_manager_submissions").select("id,section,doc_kind,payload,file_name,status,submitted_by,submitted_at,reviewed_by,reviewed_at,review_note").eq("offering_id", id).order("submitted_at", { ascending: false }).limit(500),
      d.from("offering_name_history").select("id,previous_name,new_name,effective_date,reason,actor_id,created_at").eq("offering_id", id).limit(200),
      setupIds.length
        ? d.from("fund_setup_events").select("id,subject_table,event,from_status,to_status,detail,actor_user_id,actor_role,created_at").in("setup_id", setupIds).order("created_at", { ascending: false }).limit(500)
        : Promise.resolve({ data: [] }),
    ]);

    const userIds = new Set<string>();
    for (const r of audit.data ?? []) if (r.actor_id && !r.actor_email) userIds.add(r.actor_id);
    for (const r of subs.data ?? []) { if (r.submitted_by) userIds.add(r.submitted_by); if (r.reviewed_by) userIds.add(r.reviewed_by); }
    for (const r of names.data ?? []) if (r.actor_id) userIds.add(r.actor_id);
    for (const r of events.data ?? []) if (r.actor_user_id) userIds.add(r.actor_user_id);
    const emails = new Map<string, string>();
    if (userIds.size) {
      const { data: profs } = await d.from("profiles").select("id,email").in("id", [...userIds]);
      for (const p of profs ?? []) emails.set(p.id, p.email);
    }
    const who = (uid: string | null | undefined) => (uid ? emails.get(uid) ?? "Unknown user" : "System");

    const out: FundAuditEntry[] = [];
    for (const r of audit.data ?? []) {
      const changes = Array.isArray(r.changes) ? r.changes : [];
      out.push({
        id: `a-${r.id}`, at: r.created_at, who: r.actor_name || r.actor_email || who(r.actor_id), role: null,
        action: r.summary || nice(r.event_type), status: null, source: "Fund record",
        details: changes.length ? changes.map((c: any) => ({ label: nice(c.field), value: `${c.from ?? "—"} → ${c.to ?? "—"}` })) : flat(r.changes),
      });
    }
    for (const r of subs.data ?? []) {
      out.push({
        id: `s-${r.id}`, at: r.submitted_at, who: who(r.submitted_by), role: "Fund manager",
        action: `Submitted ${nice(r.section)}${r.doc_kind ? ` (${nice(r.doc_kind)})` : ""} for review`, status: nice(r.status), source: "Manager submission",
        details: [...flat(r.payload), ...(r.file_name ? [{ label: "File", value: r.file_name }] : [])],
      });
      if (r.reviewed_at) out.push({
        id: `sr-${r.id}`, at: r.reviewed_at, who: who(r.reviewed_by), role: "Harmonious",
        action: `${nice(r.status)} ${nice(r.section)} submission`, status: nice(r.status), source: "Review",
        details: r.review_note ? [{ label: "Note", value: r.review_note }] : [],
      });
    }
    for (const r of names.data ?? []) out.push({
      id: `n-${r.id}`, at: r.created_at, who: who(r.actor_id), role: null, action: "Renamed the fund", status: null, source: "Fund record",
      details: [{ label: "From", value: r.previous_name ?? "—" }, { label: "To", value: r.new_name ?? "—" }, ...(r.effective_date ? [{ label: "Effective", value: r.effective_date }] : []), ...(r.reason ? [{ label: "Reason", value: r.reason }] : [])],
    });
    for (const r of events.data ?? []) out.push({
      id: `e-${r.id}`, at: r.created_at, who: who(r.actor_user_id), role: r.actor_role ? nice(r.actor_role) : null,
      action: `${nice(r.event)}${r.subject_table ? ` · ${nice(r.subject_table.replace(/^fund_setup_/, ""))}` : ""}`,
      status: r.to_status ? `${r.from_status ? `${nice(r.from_status)} → ` : ""}${nice(r.to_status)}` : null, source: "Fund setup",
      details: flat(r.detail),
    });
    out.sort((a, b) => (a.at < b.at ? 1 : -1));
    return out;
  });
