/** Shared rate lookup: given a client, what rate applies to a fund fee?
 *  Order: the client's contracted rate under an active statement of work,
 *  then the published standard rate card, then nothing. */

export const FUND_FEE_KINDS = [
  {
    key: "wire_fee",
    label: "Wire fee",
    amountColumn: "wire_fee_cents",
    sourceColumn: "wire_fee_source",
    rateColumn: "wire_fee_rate_id",
    reasonColumn: "wire_fee_reason",
    serviceKeys: ["wire_fee", "wire_instructions", "funding_tracking"],
    labelHint: /wire/i,
  },
  {
    key: "closing_cost",
    label: "Closing cost",
    amountColumn: "closing_cost_cents",
    sourceColumn: "closing_cost_source",
    rateColumn: "closing_cost_rate_id",
    reasonColumn: "closing_cost_reason",
    serviceKeys: ["closing_cost", "additional_close"],
    labelHint: /clos/i,
  },
] as const;

export type FundFeeKey = (typeof FUND_FEE_KINDS)[number]["key"];

export type ResolvedRate = {
  id: string | null;
  label: string;
  cents: number | null;
  effective_date: string | null;
  pricing_model: string | null;
  source_label: string;
};

type Matcher = { serviceKeys: readonly string[]; labelHint: RegExp };

function matches(row: { service_key?: string | null; label?: string | null }, m: Matcher) {
  if (row.service_key && m.serviceKeys.includes(row.service_key)) return true;
  return Boolean(row.label && m.labelHint.test(row.label));
}

/** Contracted rates for one client, keyed by fee kind. Rates attached to an
 *  inactive statement of work are ignored. */
export async function resolveClientRates(supabase: any, clientId: string | null) {
  const out: Record<string, ResolvedRate | null> = {};
  for (const kind of FUND_FEE_KINDS) out[kind.key] = null;
  if (!clientId) return out;

  const [{ data: pricing }, { data: sows }] = await Promise.all([
    supabase.from("client_pricing").select("*").eq("client_id", clientId),
    supabase.from("client_sows").select("id, status").eq("client_id", clientId),
  ]);

  const activeSows = new Set(
    ((sows ?? []) as any[]).filter((s) => s.status === "active").map((s) => s.id),
  );

  for (const kind of FUND_FEE_KINDS) {
    const candidates = ((pricing ?? []) as any[])
      .filter((row) => matches(row, kind))
      .filter((row) => !row.sow_id || activeSows.has(row.sow_id))
      .sort((a, b) => String(b.effective_date ?? "").localeCompare(String(a.effective_date ?? "")));
    const row = candidates[0];
    out[kind.key] = row
      ? {
          id: row.id,
          label: row.label,
          cents: row.contracted_cents ?? row.standard_cents ?? null,
          effective_date: row.effective_date ?? null,
          pricing_model: row.pricing_model ?? null,
          source_label: "the client's agreed rates",
        }
      : null;
  }
  return out;
}

/** Line items on the currently published standard rate card, keyed by fee kind. */
export async function resolveStandardRates(supabase: any) {
  const out: Record<string, ResolvedRate | null> = {};
  for (const kind of FUND_FEE_KINDS) out[kind.key] = null;

  const { data: version } = await supabase
    .from("pricing_versions")
    .select("id, label")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return out;

  const { data: items } = await supabase
    .from("pricing_items")
    .select("*")
    .eq("version_id", (version as any).id);

  for (const kind of FUND_FEE_KINDS) {
    const row = ((items ?? []) as any[]).find((i) => matches(i, kind));
    out[kind.key] = row
      ? {
          id: null,
          label: row.label,
          cents: row.amount_cents ?? null,
          effective_date: null,
          pricing_model: row.pricing_model ?? null,
          source_label: `the standard rate card (${(version as any).label})`,
        }
      : null;
  }
  return out;
}

export async function resolveFeeRates(supabase: any, clientId: string | null) {
  const [client, standard] = await Promise.all([
    resolveClientRates(supabase, clientId),
    resolveStandardRates(supabase),
  ]);
  return { client, standard };
}

/** Columns a brand new fund should start with: the client's agreed rate for
 *  each fee, falling back to the published standard rate card. A fee with no
 *  rate anywhere is left at zero and shows as "set just for this fund". */
export async function seedFundFeeColumns(supabase: any, clientId: string | null) {
  const { client, standard } = await resolveFeeRates(supabase, clientId);
  const patch: Record<string, unknown> = {};
  for (const kind of FUND_FEE_KINDS) {
    const agreed = client[kind.key];
    const card = standard[kind.key];
    if (agreed?.cents != null) {
      patch[kind.amountColumn] = agreed.cents;
      patch[kind.sourceColumn] = "client_rate";
      patch[kind.rateColumn] = agreed.id;
    } else if (card?.cents != null) {
      patch[kind.amountColumn] = card.cents;
      patch[kind.sourceColumn] = "standard";
      patch[kind.rateColumn] = null;
    }
  }
  return patch;
}

export function sourceLabel(source: string | null | undefined) {
  if (source === "client_rate") return "From the client's agreed rates";
  if (source === "standard") return "From the standard rate card";
  return "Set just for this fund";
}
