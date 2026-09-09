import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminActivityKind =
  | "fund"
  | "invitation"
  | "document"
  | "diligence"
  | "decision"
  | "access";

export type AdminActivityEntry = {
  id: string;
  kind: AdminActivityKind;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  fundName: string | null;
  summary: string;
  detail: string | null;
};

const listSchema = z.object({
  kind: z.enum(["fund", "invitation", "document", "diligence", "decision", "access"]).optional(),
  days: z.number().int().min(1).max(365).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(10).max(200).optional(),
  offset: z.number().int().min(0).max(5000).optional(),
});

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (!data || data.length === 0) throw new Error("This log is for admins.");
}

/**
 * One timestamped record of everything happening across the platform:
 * funds created, people invited, documents uploaded, diligence rooms opened
 * and reviewer decisions.
 */
export const listAdminActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;
    const since = data.days
      ? new Date(Date.now() - data.days * 86_400_000).toISOString()
      : new Date(Date.now() - 365 * 86_400_000).toISOString();
    const WINDOW = 400;

    const [
      { data: funds },
      { data: audits },
      { data: diligence },
      { data: invites },
      { data: reviews },
      { data: uploads },
      { data: access },
      { data: managers },
    ] = await Promise.all([
      supabase
        .from("offerings")
        .select("id, name, reg_type, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("offering_audit_events")
        .select("id, offering_id, event_type, summary, actor_name, actor_email, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("diligence_activity")
        .select("id, offering_id, event_type, summary, actor_name, actor_email, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("fund_invitations")
        .select("id, offering_id, email, role, status, invited_name, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("reviewer_activity")
        .select("id, offering_id, actor_id, action, area, outcome, summary, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("investor_documents")
        .select("id, offering_id, user_id, file_name, doc_kind, uploaded_at")
        .gte("uploaded_at", since)
        .order("uploaded_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("investor_fund_access")
        .select("id, offering_id, user_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("fund_managers")
        .select("id, offering_id, user_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
    ]);

    const { data: allFunds } = await supabase.from("offerings").select("id, name");
    const fundName = new Map<string, string>(
      ((allFunds ?? []) as any[]).map((f) => [f.id as string, f.name as string]),
    );

    const peopleIds = [
      ...new Set(
        [
          ...((reviews ?? []) as any[]).map((r) => r.actor_id),
          ...((uploads ?? []) as any[]).map((r) => r.user_id),
          ...((access ?? []) as any[]).map((r) => r.user_id),
          ...((managers ?? []) as any[]).map((r) => r.user_id),
        ].filter(Boolean),
      ),
    ] as string[];
    let profiles: any[] = [];
    if (peopleIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, legal_name, email")
        .in("user_id", peopleIds);
      profiles = (profs ?? []) as any[];
    }
    const person = (id: string | null) => {
      if (!id) return { name: null as string | null, email: null as string | null };
      const p = profiles.find((x) => x.user_id === id);
      return { name: p?.legal_name ?? null, email: p?.email ?? null };
    };

    const entries: AdminActivityEntry[] = [];

    for (const f of (funds ?? []) as any[]) {
      entries.push({
        id: `fund-${f.id}`,
        kind: "fund",
        createdAt: f.created_at,
        actorName: null,
        actorEmail: null,
        fundName: f.name,
        summary: `Fund created: ${f.name}`,
        detail: f.reg_type ? `Reg D ${f.reg_type}` : null,
      });
    }

    for (const a of (audits ?? []) as any[]) {
      entries.push({
        id: `audit-${a.id}`,
        kind: "document",
        createdAt: a.created_at,
        actorName: a.actor_name ?? null,
        actorEmail: a.actor_email ?? null,
        fundName: fundName.get(a.offering_id) ?? null,
        summary: a.summary,
        detail: a.event_type,
      });
    }

    for (const d of (diligence ?? []) as any[]) {
      entries.push({
        id: `dil-${d.id}`,
        kind: "diligence",
        createdAt: d.created_at,
        actorName: d.actor_name ?? null,
        actorEmail: d.actor_email ?? null,
        fundName: fundName.get(d.offering_id) ?? null,
        summary: d.summary,
        detail: d.event_type,
      });
    }

    for (const i of (invites ?? []) as any[]) {
      entries.push({
        id: `inv-${i.id}`,
        kind: "invitation",
        createdAt: i.created_at,
        actorName: i.invited_name ?? null,
        actorEmail: i.email ?? null,
        fundName: fundName.get(i.offering_id) ?? null,
        summary: `Invited ${i.email} as ${i.role === "fund_manager" ? "fund manager" : "investor"}`,
        detail: `Invitation ${i.status}`,
      });
    }

    for (const r of (reviews ?? []) as any[]) {
      const who = person(r.actor_id);
      entries.push({
        id: `rev-${r.id}`,
        kind: "decision",
        createdAt: r.created_at,
        actorName: who.name,
        actorEmail: who.email,
        fundName: r.offering_id ? (fundName.get(r.offering_id) ?? null) : null,
        summary: r.summary,
        detail: [r.area, r.outcome].filter(Boolean).join(" · ") || null,
      });
    }

    for (const u of (uploads ?? []) as any[]) {
      const who = person(u.user_id);
      entries.push({
        id: `up-${u.id}`,
        kind: "document",
        createdAt: u.uploaded_at,
        actorName: who.name,
        actorEmail: who.email,
        fundName: fundName.get(u.offering_id) ?? null,
        summary: `${who.name ?? who.email ?? "An investor"} uploaded ${u.file_name}`,
        detail: u.doc_kind ?? null,
      });
    }

    for (const a of (access ?? []) as any[]) {
      const who = person(a.user_id);
      entries.push({
        id: `acc-${a.id}`,
        kind: "access",
        createdAt: a.created_at,
        actorName: who.name,
        actorEmail: who.email,
        fundName: fundName.get(a.offering_id) ?? null,
        summary: `${who.name ?? who.email ?? "An investor"} was given access to ${fundName.get(a.offering_id) ?? "a fund"}`,
        detail: "Investor access",
      });
    }

    for (const m of (managers ?? []) as any[]) {
      const who = person(m.user_id);
      entries.push({
        id: `mgr-${m.id}`,
        kind: "access",
        createdAt: m.created_at,
        actorName: who.name,
        actorEmail: who.email,
        fundName: fundName.get(m.offering_id) ?? null,
        summary: `${who.name ?? who.email ?? "A manager"} was assigned to ${fundName.get(m.offering_id) ?? "a fund"}`,
        detail: "Fund manager assigned",
      });
    }

    let list = entries.filter((e) => Boolean(e.createdAt));
    if (data.kind) list = list.filter((e) => e.kind === data.kind);
    if (data.search) {
      const q = data.search.toLowerCase();
      list = list.filter((e) =>
        [e.summary, e.detail, e.fundName, e.actorName, e.actorEmail]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const counts = {
      fund: entries.filter((e) => e.kind === "fund").length,
      invitation: entries.filter((e) => e.kind === "invitation").length,
      document: entries.filter((e) => e.kind === "document").length,
      diligence: entries.filter((e) => e.kind === "diligence").length,
      decision: entries.filter((e) => e.kind === "decision").length,
      access: entries.filter((e) => e.kind === "access").length,
    };

    return {
      total: list.length,
      counts,
      entries: list.slice(offset, offset + limit),
    };
  });
