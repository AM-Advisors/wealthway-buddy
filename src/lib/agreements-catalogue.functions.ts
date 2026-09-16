import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const MODEL_LABEL: Record<string, string> = {
  one_time: "one-time",
  annual: "per year",
  recurring: "recurring",
  transaction: "per transaction",
  per_request: "quoted per request",
  pass_through: "billed at cost",
};

/** The services on the current published pricing schedule, for the request form. */
export const listPricingCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: version } = await context.supabase
      .from("pricing_versions")
      .select("id, label")
      .eq("status", "published")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!version) return [];

    const { data: items } = await context.supabase
      .from("pricing_items")
      .select("service_key, label, amount_cents, pricing_model, pass_through, unit, category")
      .eq("version_id", (version as any).id)
      .order("sort_order");

    const seen = new Set<string>();
    return ((items ?? []) as any[])
      .filter((i) => {
        const key = String(i.service_key);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((i) => ({
        key: String(i.service_key),
        label: String(i.label),
        category: (i.category as string) ?? null,
        amountLabel: i.pass_through
          ? "Billed at cost"
          : `${money(Number(i.amount_cents ?? 0))} ${MODEL_LABEL[String(i.pricing_model)] ?? ""}`.trim(),
      }));
  });
