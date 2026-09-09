/**
 * Public fund page.
 *
 * Everything here is readable by anyone, so each read is gated on the fund's
 * "show publicly" switch and only curated fields are returned. Visitors can
 * see the pitch deck and the cap table, and the offering documents are listed
 * by name only — opening them requires requesting access to the room.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DECK_BUCKET = "pitch-decks";
const SLIDE_URL_SECONDS = 60 * 30;
const EXCLUDED_STATUSES = new Set(["withdrawn", "declined", "rejected", "cancelled"]);

export interface PublicFundSlide {
  id: string;
  position: number;
  heading: string | null;
  caption: string | null;
  image_url: string | null;
}

export interface PublicCapTableRow {
  name: string;
  commitment_cents: number;
  received_cents: number;
  shares: number | null;
  share_class: string;
  ownership_pct: number;
}

export interface PublicFundPage {
  id: string;
  slug: string;
  name: string;
  reg_type: string | null;
  headline: string;
  summary: string;
  is_open: boolean;
  min_investment_cents: number;
  target_raise_cents: number | null;
  share_price_cents: number;
  committed_cents: number;
  received_cents: number;
  investor_count: number;
  deck: { title: string; summary: string | null; slides: PublicFundSlide[] } | null;
  documents: { title: string; doc_type: string; requires_signature: boolean }[];
  cap_table: PublicCapTableRow[];
}

function displayName(profile: any, fallback: string) {
  return (
    (profile?.entity_name && String(profile.entity_name).trim()) ||
    (profile?.legal_name && String(profile.legal_name).trim()) ||
    fallback
  );
}

/** Short list of every fund with its public page switched on. */
export const listPublicFunds = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("offerings")
    .select("slug, name, reg_type, public_headline, public_summary, summary, is_open, min_investment_cents")
    .eq("public_page_enabled", true)
    .order("name");
  return ((data ?? []) as any[]).map((o) => ({
    slug: String(o.slug),
    name: String(o.name),
    reg_type: (o.reg_type ?? null) as string | null,
    headline: String(o.public_headline ?? o.name),
    summary: String(o.public_summary ?? o.summary ?? ""),
    is_open: Boolean(o.is_open),
    min_investment_cents: Number(o.min_investment_cents ?? 0),
  }));
});

/** The whole public page for one fund, or null when it is not published. */
export const getPublicFundPage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().trim().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<PublicFundPage | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: offering } = await supabaseAdmin
      .from("offerings")
      .select(
        "id, slug, name, reg_type, summary, public_page_enabled, public_headline, public_summary, is_open, min_investment_cents, target_raise_cents, share_price_cents",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    if (!offering || !(offering as any).public_page_enabled) return null;
    const offeringId = (offering as any).id as string;

    const [{ data: deck }, { data: documents }, { data: appsRaw }] = await Promise.all([
      supabaseAdmin
        .from("pitch_decks")
        .select("id, title, summary")
        .eq("offering_id", offeringId)
        .maybeSingle(),
      supabaseAdmin
        .from("offering_documents")
        .select("title, doc_type, requires_signature, sort_order")
        .eq("offering_id", offeringId)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("investor_applications")
        .select("id, user_id, status, commitment_cents")
        .eq("offering_id", offeringId),
    ]);

    // Pitch deck slides with short-lived image links.
    let slides: PublicFundSlide[] = [];
    if (deck) {
      const { data: slideRows } = await supabaseAdmin
        .from("pitch_deck_slides")
        .select("id, position, heading, caption, image_path")
        .eq("deck_id", (deck as any).id)
        .order("position", { ascending: true });
      slides = await Promise.all(
        ((slideRows ?? []) as any[]).map(async (row) => {
          let url: string | null = null;
          if (row.image_path) {
            const { data: signed } = await supabaseAdmin.storage
              .from(DECK_BUCKET)
              .createSignedUrl(row.image_path, SLIDE_URL_SECONDS);
            url = signed?.signedUrl ?? null;
          }
          return {
            id: String(row.id),
            position: Number(row.position ?? 0),
            heading: (row.heading ?? null) as string | null,
            caption: (row.caption ?? null) as string | null,
            image_url: url,
          };
        }),
      );
    }

    // Cap table from live commitments and settled payments.
    const apps = ((appsRaw ?? []) as any[]).filter((a) => !EXCLUDED_STATUSES.has(a.status));
    const appIds = apps.map((a) => a.id as string);
    const userIds = Array.from(new Set(apps.map((a) => a.user_id as string)));

    const [{ data: pays }, { data: profiles }, { data: positions }] = await Promise.all([
      appIds.length
        ? supabaseAdmin
            .from("payments")
            .select("application_id, amount_cents, status")
            .in("application_id", appIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("user_id, legal_name, entity_name")
            .in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      supabaseAdmin
        .from("investor_cap_positions")
        .select("application_id, shares, share_class, ownership_pct_override")
        .eq("offering_id", offeringId),
    ]);

    const profileBy = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id as string, p]));
    const positionBy = new Map(
      ((positions ?? []) as any[]).map((p) => [p.application_id as string, p]),
    );
    const receivedBy = new Map<string, number>();
    for (const p of ((pays ?? []) as any[]).filter((p) => p.status === "settled")) {
      receivedBy.set(
        p.application_id as string,
        (receivedBy.get(p.application_id as string) ?? 0) + Number(p.amount_cents ?? 0),
      );
    }

    const committedTotal = apps.reduce((s, a) => s + Number(a.commitment_cents ?? 0), 0);
    const sharesTotal = apps.reduce(
      (s, a) => s + Number(positionBy.get(a.id as string)?.shares ?? 0),
      0,
    );

    const capTable: PublicCapTableRow[] = apps
      .map((a, index) => {
        const position = positionBy.get(a.id as string);
        const commitment = Number(a.commitment_cents ?? 0);
        const shares = position?.shares == null ? null : Number(position.shares);
        const ownership =
          position?.ownership_pct_override != null
            ? Number(position.ownership_pct_override)
            : shares != null && sharesTotal > 0
              ? (shares / sharesTotal) * 100
              : committedTotal > 0
                ? (commitment / committedTotal) * 100
                : 0;
        return {
          name: displayName(profileBy.get(a.user_id as string), `Investor ${index + 1}`),
          commitment_cents: commitment,
          received_cents: receivedBy.get(a.id as string) ?? 0,
          shares,
          share_class: String(position?.share_class ?? "Interests"),
          ownership_pct: Math.round(ownership * 100) / 100,
        };
      })
      .filter((row) => row.commitment_cents > 0 || row.received_cents > 0)
      .sort((a, b) => b.commitment_cents - a.commitment_cents);

    return {
      id: offeringId,
      slug: String((offering as any).slug),
      name: String((offering as any).name),
      reg_type: ((offering as any).reg_type ?? null) as string | null,
      headline: String((offering as any).public_headline ?? (offering as any).name),
      summary: String((offering as any).public_summary ?? (offering as any).summary ?? ""),
      is_open: Boolean((offering as any).is_open),
      min_investment_cents: Number((offering as any).min_investment_cents ?? 0),
      target_raise_cents: ((offering as any).target_raise_cents ?? null) as number | null,
      share_price_cents: Number((offering as any).share_price_cents ?? 0),
      committed_cents: committedTotal,
      received_cents: capTable.reduce((s, r) => s + r.received_cents, 0),
      investor_count: capTable.length,
      deck: deck
        ? {
            title: String((deck as any).title ?? "Pitch deck"),
            summary: ((deck as any).summary ?? null) as string | null,
            slides,
          }
        : null,
      documents: ((documents ?? []) as any[]).map((d) => ({
        title: String(d.title),
        doc_type: String(d.doc_type ?? ""),
        requires_signature: Boolean(d.requires_signature),
      })),
      cap_table: capTable,
    };
  });

/** A visitor asks to be let into the fund's diligence room. */
export const requestFundAccess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().trim().min(1).max(120),
        full_name: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(200),
        firm: z.string().trim().max(160).default(""),
        phone: z.string().trim().max(60).default(""),
        message: z.string().trim().max(2000).default(""),
        /** Hidden field; real people leave it empty. */
        website: z.string().max(200).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    if (data.website.trim() !== "") return { ok: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: offering } = await supabaseAdmin
      .from("offerings")
      .select("id, name, public_page_enabled")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!offering || !(offering as any).public_page_enabled) {
      throw new Error("That fund is not accepting requests right now.");
    }
    const offeringId = (offering as any).id as string;

    // Light throttle: one pending request per email per fund per hour.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("fund_access_requests")
      .select("id")
      .eq("offering_id", offeringId)
      .eq("email", data.email.toLowerCase())
      .gte("created_at", hourAgo)
      .limit(1);
    if ((recent ?? []).length > 0) {
      return { ok: true, duplicate: true };
    }

    const { error } = await supabaseAdmin.from("fund_access_requests").insert({
      offering_id: offeringId,
      full_name: data.full_name,
      email: data.email.toLowerCase(),
      firm: data.firm,
      phone: data.phone,
      message: data.message,
    });
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("notification_events").insert({
        event_kind: "fund_access_request",
        offering_id: offeringId,
        metadata: {
          full_name: data.full_name,
          email: data.email.toLowerCase(),
          firm: data.firm,
          phone: data.phone,
          message: data.message.slice(0, 400),
          portal_path: "/manager/requests",
        } as never,
      });
      const { kickManagerAlerts } = await import("@/lib/manager-alerts.server");
      kickManagerAlerts();
    } catch (e) {
      console.error("[public fund] access request alert failed", e);
    }

    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Fund team: publish switch and request inbox                         */
/* ------------------------------------------------------------------ */

async function assertCanManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  if (!data) throw new Error("You do not have permission to change this fund's public page.");
}

/** Public-page settings for one fund, for the fund team. */
export const getPublicPageSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.offering_id);
    const { data: offering } = await context.supabase
      .from("offerings")
      .select("id, slug, name, public_page_enabled, public_headline, public_summary, summary")
      .eq("id", data.offering_id)
      .maybeSingle();
    if (!offering) throw new Error("That fund is not available.");
    return {
      offering_id: (offering as any).id as string,
      slug: String((offering as any).slug),
      name: String((offering as any).name),
      enabled: Boolean((offering as any).public_page_enabled),
      headline: String((offering as any).public_headline ?? ""),
      summary: String((offering as any).public_summary ?? ""),
      public_path: `/fund/${(offering as any).slug}`,
    };
  });

/** Turn the public page on or off and edit its headline and summary. */
export const savePublicPageSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        enabled: z.boolean(),
        headline: z.string().trim().max(200).default(""),
        summary: z.string().trim().max(4000).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("offerings")
      .update({
        public_page_enabled: data.enabled,
        public_headline: data.headline || null,
        public_summary: data.summary || null,
      })
      .eq("id", data.offering_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Access requests for the funds the viewer manages. */
export const listFundAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    const isAdmin = (roles ?? []).length > 0;

    let ids: string[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("offerings").select("id");
      ids = ((data ?? []) as any[]).map((o) => o.id as string);
    } else {
      const { data } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      ids = ((data ?? []) as any[]).map((m) => m.offering_id as string);
    }
    if (ids.length === 0) return { isAdmin, requests: [] as any[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rows }, { data: offerings }] = await Promise.all([
      supabaseAdmin
        .from("fund_access_requests")
        .select(
          "id, offering_id, full_name, email, firm, phone, message, status, internal_note, created_at, handled_at",
        )
        .in("offering_id", ids)
        .order("created_at", { ascending: false })
        .limit(300),
      supabaseAdmin.from("offerings").select("id, name").in("id", ids),
    ]);
    const nameBy = new Map(((offerings ?? []) as any[]).map((o) => [o.id as string, o.name as string]));

    return {
      isAdmin,
      requests: ((rows ?? []) as any[]).map((r) => ({
        id: String(r.id),
        offering_id: String(r.offering_id),
        offering_name: String(nameBy.get(r.offering_id) ?? "Fund"),
        full_name: String(r.full_name),
        email: String(r.email),
        firm: String(r.firm ?? ""),
        phone: String(r.phone ?? ""),
        message: String(r.message ?? ""),
        status: String(r.status ?? "new"),
        internal_note: String(r.internal_note ?? ""),
        created_at: String(r.created_at),
        handled_at: (r.handled_at ?? null) as string | null,
      })),
    };
  });

/** Mark a request as invited, closed or back to new, with a note. */
export const updateFundAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "contacted", "invited", "closed"]),
        internal_note: z.string().trim().max(1000).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("fund_access_requests")
      .select("id, offering_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That request is not available.");
    await assertCanManage(context.supabase, (row as any).offering_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fund_access_requests")
      .update({
        status: data.status,
        internal_note: data.internal_note,
        handled_by: context.userId,
        handled_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Funds the viewer can publish: their assignments, or all funds for admins. */
export const listManageableFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    const isAdmin = (roles ?? []).length > 0;

    let ids: string[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("offerings").select("id");
      ids = ((data ?? []) as any[]).map((o) => o.id as string);
    } else {
      const { data } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      ids = ((data ?? []) as any[]).map((m) => m.offering_id as string);
    }
    if (ids.length === 0) return { isAdmin, funds: [] as { id: string; name: string }[] };

    const { data: offerings } = await supabase
      .from("offerings")
      .select("id, name")
      .in("id", ids)
      .order("name");
    return {
      isAdmin,
      funds: ((offerings ?? []) as any[]).map((o) => ({ id: String(o.id), name: String(o.name) })),
    };
  });
