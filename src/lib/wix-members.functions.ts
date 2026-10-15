/**
 * Read-only Wix member-area import. Only reads from Wix (query endpoints); copies
 * name/email/phone into wix_member_imports and suggests a person match by email.
 * Never writes to Wix and never creates people automatically.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { OPS_STAFF_ROLES } from "@/lib/ops-capabilities";

const GATEWAY = "https://connector-gateway.lovable.dev/wix";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function assertStaff(uid: string) {
  const { data } = await (await admin()).from("user_roles").select("role").eq("user_id", uid);
  if (!((data ?? []) as any[]).some((r) => (OPS_STAFF_ROLES as readonly string[]).includes(r.role))) throw new Error("Only Harmonious staff can do this.");
}

/** Turn a Wix failure into a plain diagnosis; never echoes credentials or HTML bodies. */
function diagnose(status: number, contentType: string, body: string): string {
  const html = contentType.includes("text/html") || body.trimStart().startsWith("<");
  if (status === 401) return "Wix didn't accept the key (invalid or missing). Reconnect Wix with a new key.";
  if (status === 403 && html) return "Wix returned a 403 page: the key doesn't have access to this site, or the Account ID doesn't match the key.";
  if (status === 403) return "The key is missing a read permission (Contacts – Read or Members – Read).";
  if (status === 404) return "Wrong Wix site or endpoint.";
  if (status === 429) return "Wix is rate-limiting requests. Try again in a minute.";
  if (status >= 500) return "Wix service problem. Try again later.";
  return `Wix request failed (${status}).`;
}

async function wix(path: string, siteId: string | null, body: unknown) {
  const lk = process.env["LOVABLE_API_KEY"], ck = process.env["WIX_API_KEY"];
  if (!lk || !ck) throw new Error("Wix isn't connected yet.");
  const res = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck, "Content-Type": "application/json", ...(siteId ? { "wix-site-id": siteId } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[wix] request failed", path, res.status);
    throw new Error(diagnose(res.status, res.headers.get("content-type") ?? "", text));
  }
  try { return JSON.parse(text); } catch { throw new Error("Wix returned an unexpected response."); }
}

export const listWixSitesFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const r = await wix("/site-list/v2/sites/query", null, { query: { cursorPaging: { limit: 50 } } });
    return ((r.sites ?? []) as any[]).map((s) => ({ id: String(s.id), name: String(s.displayName ?? s.name), url: String(s.viewUrl ?? ""), published: !!s.published }));
  });

/** Test Connection: one read-only member query. */
export const testWixFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ siteId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const r = await wix("/members/v1/members/query", data.siteId, { query: { paging: { limit: 1 } } });
    return { ok: true, members: Number(r.metadata?.total ?? 0) };
  });

export const importWixMembersFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ siteId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const db = await admin();
    const rows: any[] = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const r = await wix("/members/v1/members/query", data.siteId, { query: { paging: { limit: 100, offset } }, fieldsets: ["FULL"] });
      const ms = (r.members ?? []) as any[];
      for (const m of ms) {
        const c = m.contact ?? {};
        rows.push({
          wix_member_id: String(m.id), site_id: data.siteId,
          first_name: c.firstName ?? null, last_name: c.lastName ?? null,
          email: (m.loginEmail ?? c.emails?.[0] ?? null)?.toLowerCase?.() ?? null,
          phone: c.phones?.[0] ?? null, wix_status: m.status ?? null,
          signed_up_at: m.createdDate ?? null, last_login_at: m.lastLoginDate ?? null,
        });
      }
      if (ms.length < 100) break;
    }
    const emails = [...new Set(rows.map((r) => r.email).filter(Boolean))];
    const match = new Map<string, string>();
    for (let i = 0; i < emails.length; i += 200) {
      const { data: ps } = await db.from("persons").select("id, email").in("email", emails.slice(i, i + 200));
      for (const p of (ps ?? []) as any[]) if (p.email && !match.has(p.email.toLowerCase())) match.set(p.email.toLowerCase(), p.id);
    }
    const now = new Date().toISOString();
    const up = rows.map((r) => ({ ...r, matched_person_id: r.email ? match.get(r.email) ?? null : null, imported_by: context.userId, updated_at: now }));
    for (let i = 0; i < up.length; i += 500) {
      const { error } = await db.from("wix_member_imports").upsert(up.slice(i, i + 500), { onConflict: "wix_member_id" });
      if (error) throw new Error(error.message);
    }
    console.info("[wix] members imported", up.length, "by", context.userId);
    return { total: up.length, matched: up.filter((r) => r.matched_person_id).length, withPhone: up.filter((r) => r.phone).length };
  });

export const listWixMembersFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data } = await (await admin()).from("wix_member_imports").select("*").order("last_name", { ascending: true, nullsFirst: false }).limit(5000);
    return (data ?? []) as any[];
  });
