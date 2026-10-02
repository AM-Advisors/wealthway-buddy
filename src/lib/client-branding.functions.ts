import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BRAND_FONTS } from "@/lib/client-branding";

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable();
const font = z.enum(BRAND_FONTS as unknown as [string, ...string[]]).nullable();

async function rolesOf(context: any): Promise<string[]> {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
const STAFF = ["admin", "super_admin", "operations", "client_success", "executive"];

async function canEdit(context: any, clientId: string): Promise<boolean> {
  const roles = await rolesOf(context);
  if (roles.some((r) => STAFF.includes(r))) return true;
  const { data } = await context.supabase
    .from("client_users")
    .select("client_role")
    .eq("client_id", clientId)
    .eq("user_id", context.userId)
    .maybeSingle();
  return data?.client_role === "client_gp";
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function log(db: any, clientId: string, actor: string, kind: string, detail: object = {}) {
  await db.from("client_branding_events").insert({ client_id: clientId, actor_id: actor, event_kind: kind, detail });
}

/** Branding for the signed-in client member's company (first linked client). */
export const getMyClientBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: link } = await context.supabase
      .from("client_users")
      .select("client_id, client_role, clients(name)")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (!link) return null;
    const { data: b } = await (context.supabase as any)
      .from("client_branding").select("*").eq("client_id", link.client_id).maybeSingle();
    return {
      clientId: link.client_id as string,
      clientName: ((link as any).clients?.name ?? "") as string,
      canEdit: link.client_role === "client_gp",
      branding: (b ?? null) as any,
    };
  });

/** Staff list of every client with its white-label status. */
export const listClientSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await rolesOf(context);
    if (!roles.some((r) => STAFF.includes(r))) throw new Error("Harmonious staff only.");
    const { data: clients } = await context.supabase.from("clients").select("id, name").order("name");
    const { data: brands } = await (context.supabase as any).from("client_branding").select("*");
    const byId = new Map(((brands ?? []) as any[]).map((b) => [b.client_id, b]));
    return {
      isSuperAdmin: roles.includes("super_admin"),
      clients: ((clients ?? []) as any[]).map((c) => ({ id: c.id as string, name: c.name as string, branding: byId.get(c.id) ?? null })),
    };
  });

/** Starts the $100/month white-label card subscription. Branding turns on only after the payment confirms. */
export const requestPaidWhitelabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), environment: z.enum(["sandbox", "live"]), returnUrl: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    if (!(await canEdit(context, data.clientId))) return { error: "You can't change this client's options." };
    const db = await admin();
    const { data: cur } = await db.from("client_branding").select("whitelabel_status").eq("client_id", data.clientId).maybeSingle();
    if (cur && ["active_paid", "unlocked_free"].includes(cur.whitelabel_status)) return { error: "White-labeling is already on." };
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: ["whitelabel_monthly"] });
      const price = prices.data[0];
      if (!price) return { error: "That price isn't available yet." };
      const { data: { user } } = await context.supabase.auth.getUser();
      const { customerForClient } = await import("@/lib/billing.server");
      const customer = await customerForClient(stripe, data.clientId, user?.email, context.userId);
      const meta = { kind: "whitelabel", clientId: data.clientId, userId: context.userId };
      const session = await stripe.checkout.sessions.create({
        mode: "subscription", line_items: [{ price: price.id, quantity: 1 }], customer,
        success_url: data.returnUrl, cancel_url: data.returnUrl, metadata: meta, subscription_data: { metadata: meta },
        managed_payments: { enabled: true },
      } as any);
      await db.from("client_branding").upsert({ client_id: data.clientId, whitelabel_status: "payment_pending", billing_environment: data.environment, stripe_customer_id: customer, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      await log(db, data.clientId, context.userId, "paid_whitelabel_checkout_started", { monthly_fee_cents: 10000 });
      return { url: session.url ?? "" };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

/** Opens the billing page for the white-label subscription (card, invoices, cancel at period end). */
export const openWhitelabelBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), environment: z.enum(["sandbox", "live"]), returnUrl: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    if (!(await canEdit(context, data.clientId))) return { error: "Not allowed." };
    const db = await admin();
    const { data: cur } = await db.from("client_branding").select("stripe_customer_id").eq("client_id", data.clientId).maybeSingle();
    if (!cur?.stripe_customer_id) return { error: "No card billing on file yet." };
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      const stripe = createStripeClient(data.environment);
      const { ensurePortalConfig } = await import("@/lib/billing.server");
      const portal = await stripe.billingPortal.sessions.create({ customer: cur.stripe_customer_id, return_url: data.returnUrl, configuration: await ensurePortalConfig(stripe) });
      return { url: portal.url };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

/** Super Administrator unlocks white-labeling at no charge, or turns it back off. */
export const setFreeWhitelabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), unlock: z.boolean(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    if (!roles.includes("super_admin")) throw new Error("Only a Super Administrator can unlock white-labeling for free.");
    const db = await admin();
    const now = new Date().toISOString();
    await db.from("client_branding").upsert({
      client_id: data.clientId,
      whitelabel_status: data.unlock ? "unlocked_free" : "off",
      unlocked_by: data.unlock ? context.userId : null,
      unlocked_at: data.unlock ? now : null,
      updated_by: context.userId,
      updated_at: now,
    });
    await log(db, data.clientId, context.userId, data.unlock ? "free_unlock" : "whitelabel_turned_off", { reason: data.reason });
    return { ok: true };
  });

/** Save logo, fonts, colors and the requested app.(name).harmonious.co name. */
export const saveClientBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      displayName: z.string().trim().max(120).nullable(),
      logoDataUrl: z.string().max(400_000).regex(/^data:image\/(png|jpeg|svg\+xml|webp);base64,/).nullable().optional(),
      headingFont: font,
      bodyFont: font,
      primaryColor: hex,
      accentColor: hex,
      subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/).nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await canEdit(context, data.clientId))) throw new Error("You can't change this client's branding.");
    const db = await admin();
    const { data: cur } = await db.from("client_branding").select("whitelabel_status").eq("client_id", data.clientId).maybeSingle();
    if (!cur || !["active_paid", "unlocked_free"].includes(cur.whitelabel_status)) {
      throw new Error("White-labeling isn't active for this client yet.");
    }
    const patch: Record<string, unknown> = {
      display_name: data.displayName || null,
      heading_font: data.headingFont,
      body_font: data.bodyFont,
      primary_color: data.primaryColor,
      accent_color: data.accentColor,
      subdomain: data.subdomain,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.logoDataUrl !== undefined) patch["logo_path"] = data.logoDataUrl;
    const { error } = await db.from("client_branding").update(patch).eq("client_id", data.clientId);
    if (error) throw new Error(error.message.includes("subdomain") ? "That web address name is already taken." : error.message);
    await log(db, data.clientId, context.userId, "branding_saved", { ...patch, logo_path: data.logoDataUrl === undefined ? "unchanged" : "changed" });
    return { ok: true };
  });
