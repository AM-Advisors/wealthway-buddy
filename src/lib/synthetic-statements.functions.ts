import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { buildSyntheticStatement, channelError, type Channel, type SyntheticStatement } from "@/lib/synthetic-statement";

const ROLES = ["admin", "super_admin", "fund_administration", "operations", "finance"];

/**
 * Internal-only synthetic statement previews. Reads only synthetic_* tables and
 * the approved synthetic NAV; never reads or writes production statements.
 */
export const getSyntheticStatementPreviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offeringId: z.string().uuid(), channel: z.enum(["internal_preview", "internal_pdf", "investor_portal", "email", "public_link", "production_statement", "financial_report"]).default("internal_preview") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ch = channelError(data.channel as Channel);
    if (ch) throw new Error(ch);
    const { data: roles, error: rErr } = await (context as any).supabase.from("user_roles").select("role").eq("user_id", (context as any).userId);
    if (rErr) throw new Error(rErr.message);
    if (!(roles ?? []).some((r: any) => ROLES.includes(String(r.role)))) throw new Error("Forbidden: synthetic statement previews are internal to Harmonious fund administration.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: off } = await db.from("offerings").select("id, name, clients(is_test_demo)").eq("id", data.offeringId).maybeSingle();
    const demo = off?.clients?.is_test_demo === true;
    if (!off || !demo) throw new Error("Synthetic statements are allowed only on isolated TEST/DEMO funds.");

    const { data: accounts } = await db.from("synthetic_capital_accounts").select("*").eq("offering_id", data.offeringId).order("investor_name");
    const ids = (accounts ?? []).map((a: any) => a.id);
    const { data: movements } = ids.length ? await db.from("synthetic_capital_movements").select("*").in("account_id", ids) : { data: [] };
    const runIds = [...new Set((accounts ?? []).map((a: any) => a.allocation_run_id))];
    const { data: runs } = runIds.length ? await db.from("synthetic_allocation_runs").select("id, nav_version_id, residuals").in("id", runIds) : { data: [] };
    const navIds = [...new Set((runs ?? []).map((r: any) => r.nav_version_id))];
    const { data: navs } = navIds.length ? await db.from("nav_versions").select("id, net_asset_value_cents, synthetic_classification, approval_scope").in("id", navIds) : { data: [] };
    const nav = (navs ?? [])[0];
    if (!nav?.synthetic_classification || nav.approval_scope !== "internal_synthetic_only") throw new Error("No approved internal synthetic NAV.");

    const statements: SyntheticStatement[] = [];
    const errors: string[] = [];
    for (const a of accounts ?? []) {
      const run = (runs ?? []).find((r: any) => r.id === a.allocation_run_id);
      const residualCents = ((run?.residuals ?? []) as any[]).filter((x) => x.positionId === a.position_id).length;
      const r = buildSyntheticStatement(a, movements ?? [], { channel: data.channel as Channel, navCents: Number(nav.net_asset_value_cents), fundIsTestDemo: demo, residualCents });
      if (r.ok) statements.push(r.statement);
      else errors.push(...r.errors);
    }
    const total = statements.reduce((s, x) => s + x.endingCapitalCents, 0);
    const differenceCents = total - Number(nav.net_asset_value_cents);

    if (!errors.length && differenceCents === 0) {
      for (const s of statements) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(s)));
        const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
        await db.from("synthetic_statement_previews").upsert(
          { offering_id: data.offeringId, account_id: s.accountId, content_hash: hash, ending_capital_cents: s.endingCapitalCents, channel: data.channel, generated_by: (context as any).userId },
          { onConflict: "account_id,content_hash,channel", ignoreDuplicates: true },
        );
      }
    }
    return { fundName: String(off.name), navCents: Number(nav.net_asset_value_cents), totalCents: total, differenceCents, errors, statements };
  });
