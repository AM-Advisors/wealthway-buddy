import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PortalMessage {
  id: string;
  application_id: string;
  offering_id: string;
  sender_id: string;
  sender_role: "investor" | "manager" | "admin";
  sender_name: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface MessageThread {
  application_id: string;
  offering_id: string;
  offering_name: string;
  investor_user_id: string;
  investor_name: string;
  investor_email: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_role: string | null;
  unread_from_investor: number;
}

/** Is this person an admin or an assigned manager on the fund? */
async function canReview(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  return data === true;
}

async function loadApplication(supabase: any, applicationId: string) {
  const { data } = await supabase
    .from("investor_applications")
    .select("id, offering_id, user_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!data) throw new Error("We could not find that application.");
  return data as { id: string; offering_id: string; user_id: string };
}

/** Everything said on one investor's private thread, oldest first. */
export const listPortalMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ application_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const app = await loadApplication(supabase, data.application_id);
    const isInvestor = app.user_id === userId;
    const isReviewer = isInvestor ? false : await canReview(supabase, app.offering_id);
    if (!isInvestor && !isReviewer) throw new Error("You do not have access to this conversation.");

    const { data: rows, error } = await supabase
      .from("portal_messages")
      .select("*")
      .eq("application_id", data.application_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const messages = (rows ?? []) as PortalMessage[];

    // Mark the other side's messages as read for whoever is looking.
    const unread = messages
      .filter((m) => !m.read_at && (isInvestor ? m.sender_role !== "investor" : m.sender_role === "investor"))
      .map((m) => m.id);
    if (unread.length > 0) {
      await supabase.from("portal_messages").update({ read_at: new Date().toISOString() }).in("id", unread);
    }

    return { messages, role: isInvestor ? ("investor" as const) : ("reviewer" as const) };
  });

/** Post a message on the thread as the investor or as the fund team. */
export const sendPortalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        application_id: z.string().uuid(),
        body: z.string().trim().min(1, "Write a message first.").max(5000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const app = await loadApplication(supabase, data.application_id);
    const isInvestor = app.user_id === userId;
    const isReviewer = isInvestor ? false : await canReview(supabase, app.offering_id);
    if (!isInvestor && !isReviewer) throw new Error("You do not have access to this conversation.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name")
      .eq("user_id", userId)
      .maybeSingle();

    let role: "investor" | "manager" | "admin" = "investor";
    if (!isInvestor) {
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      role = adminRole ? "admin" : "manager";
    }

    const { data: inserted, error } = await supabase
      .from("portal_messages")
      .insert({
        application_id: app.id,
        offering_id: app.offering_id,
        sender_id: userId,
        sender_role: role,
        sender_name: profile?.legal_name ?? null,
        body: data.body.trim(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Tell the fund team when the investor writes in. Never blocks the send.
    if (isInvestor) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("notification_events").insert({
          event_kind: "portal_message_received",
          offering_id: app.offering_id,
          application_id: app.id,
          investor_user_id: userId,
          metadata: {
            preview: data.body.trim().slice(0, 240),
            sender_name: profile?.legal_name ?? null,
          } as never,
        });
        const { kickManagerAlerts } = await import("@/lib/manager-alerts.server");
        kickManagerAlerts();
      } catch (e) {
        console.error("[portal-messages] alert failed", e);
      }
    }

    return inserted as PortalMessage;
  });

/** Every investor conversation on the funds this reviewer looks after. */
export const listMessageThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: apps } = await supabase
      .from("investor_applications")
      .select("id, offering_id, user_id, created_at")
      .order("created_at", { ascending: false });

    const rows = (apps ?? []) as { id: string; offering_id: string; user_id: string }[];
    if (rows.length === 0) return { threads: [] as MessageThread[] };

    // RLS on portal_messages already limits this to funds the viewer can manage.
    const [{ data: messages }, { data: offerings }, { data: profiles }] = await Promise.all([
      supabase
        .from("portal_messages")
        .select("application_id, body, created_at, sender_role, read_at")
        .order("created_at", { ascending: false }),
      supabase.from("offerings").select("id, name"),
      supabase
        .from("profiles")
        .select("user_id, legal_name, email")
        .in("user_id", Array.from(new Set(rows.map((r) => r.user_id)))),
    ]);

    const offeringName = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name as string]));
    const profileById = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));

    const byApp = new Map<string, any[]>();
    for (const m of (messages ?? []) as any[]) {
      const list = byApp.get(m.application_id) ?? [];
      list.push(m);
      byApp.set(m.application_id, list);
    }

    const threads: MessageThread[] = rows
      .filter((r) => byApp.has(r.id) || offeringName.has(r.offering_id))
      .map((r) => {
        const list = byApp.get(r.id) ?? [];
        const latest = list[0];
        const profile = profileById.get(r.user_id);
        return {
          application_id: r.id,
          offering_id: r.offering_id,
          offering_name: offeringName.get(r.offering_id) ?? "Fund",
          investor_user_id: r.user_id,
          investor_name: profile?.legal_name ?? "Investor",
          investor_email: profile?.email ?? null,
          last_message: latest?.body ?? null,
          last_message_at: latest?.created_at ?? null,
          last_sender_role: latest?.sender_role ?? null,
          unread_from_investor: list.filter((m) => m.sender_role === "investor" && !m.read_at).length,
        };
      })
      .sort((a, b) => {
        if (a.unread_from_investor !== b.unread_from_investor) {
          return b.unread_from_investor - a.unread_from_investor;
        }
        return (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "");
      });

    return { threads };
  });
