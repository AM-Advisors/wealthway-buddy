// Server-only: builds an investor's capital account statement from the fund's
// records at the moment of generation, and stores it as a fixed snapshot so the
// document an investor keeps never changes retroactively.

export const CAPITAL_STATEMENT_SCOPE_KEYS = [
  "capital_account_statements",
  "capital_accounts",
  "investor_reporting",
];

export const OUT_OF_SCOPE_MESSAGE =
  "This service is not currently included in your active scope. Request service.";

export type CapitalStatementSnapshot = {
  investorName: string;
  investorEmail: string | null;
  ownershipTitle: string | null;
  fundName: string;
  legalEntityName: string | null;
  closingDate: string;
  statementDate: string;
  periodEnd: string;
  commitmentCents: number;
  contributedCents: number;
  outstandingCents: number;
  ownershipPct: number | null;
  shares: number | null;
  shareClass: string | null;
  distributionsCents: number;
  fundValue: { asOf: string; navCents: number; investorShareCents: number | null } | null;
};

const EXCLUDED_STATUSES = new Set(["withdrawn", "declined", "rejected", "cancelled"]);

/**
 * Confirms the fund's client has capital-account statements inside its active
 * scope. A fund with no client has no agreement to check against, so it passes.
 */
export async function assertStatementsInScope(supabase: any, offeringId: string) {
  const { data: fund } = await supabase
    .from("offerings")
    .select("client_id")
    .eq("id", offeringId)
    .maybeSingle();
  const clientId = (fund as any)?.client_id ?? null;
  if (!clientId) return;

  const { data: rows } = await supabase
    .from("service_entitlements")
    .select("service_key, status, offering_id")
    .eq("client_id", clientId);
  const all = (rows ?? []) as any[];
  if (all.length === 0) return;

  const relevant = all.filter((r) => !r.offering_id || r.offering_id === offeringId);
  const included = relevant.some(
    (r) => CAPITAL_STATEMENT_SCOPE_KEYS.includes(r.service_key) && r.status === "included",
  );
  if (!included) throw new Error(OUT_OF_SCOPE_MESSAGE);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Reads every figure the statement shows for one closed investor. */
export async function buildSnapshot(
  supabase: any,
  applicationId: string,
): Promise<{ snapshot: CapitalStatementSnapshot; offeringId: string; closingId: string } | null> {
  const { data: app } = await supabase
    .from("investor_applications")
    .select("id, user_id, offering_id, commitment_cents, status")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app || EXCLUDED_STATUSES.has(app.status)) return null;

  const { data: closing } = await supabase
    .from("application_closings")
    .select("id, closing_date, funded_amount_cents")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (!closing) return null;

  const [
    { data: profile },
    { data: offering },
    { data: payments },
    { data: position },
    { data: positions },
    { data: subscription },
    { data: distributions },
    { data: valuation },
  ] = await Promise.all([
    supabase.from("profiles").select("legal_name, email").eq("user_id", app.user_id).maybeSingle(),
    supabase
      .from("offerings")
      .select("name, legal_entity_name")
      .eq("id", app.offering_id)
      .maybeSingle(),
    supabase.from("payments").select("amount_cents, status").eq("application_id", applicationId),
    supabase
      .from("investor_cap_positions")
      .select("shares, share_class, ownership_pct_override")
      .eq("application_id", applicationId)
      .maybeSingle(),
    supabase
      .from("investor_cap_positions")
      .select("application_id, shares")
      .eq("offering_id", app.offering_id),
    supabase
      .from("subscriptions")
      .select("ownership_title")
      .eq("application_id", applicationId)
      .maybeSingle(),
    supabase.from("fund_distributions").select("amount_cents").eq("offering_id", app.offering_id),
    supabase
      .from("fund_valuations")
      .select("as_of_date, nav_cents")
      .eq("offering_id", app.offering_id)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const contributedCents = ((payments ?? []) as any[])
    .filter((p) => p.status === "settled")
    .reduce((sum, p) => sum + Number(p.amount_cents ?? 0), 0);

  const commitmentCents = Number(app.commitment_cents ?? 0);
  const shares = position?.shares === null || position?.shares === undefined
    ? null
    : Number(position.shares);

  let ownershipPct: number | null =
    position?.ownership_pct_override === null || position?.ownership_pct_override === undefined
      ? null
      : Number(position.ownership_pct_override);
  if (ownershipPct === null && shares !== null) {
    const totalShares = ((positions ?? []) as any[]).reduce(
      (sum, p) => sum + Number(p.shares ?? 0),
      0,
    );
    if (totalShares > 0) ownershipPct = (shares / totalShares) * 100;
  }

  const distributionsCents = ((distributions ?? []) as any[]).reduce(
    (sum, d) => sum + Number(d.amount_cents ?? 0),
    0,
  );

  const navCents = valuation ? Number((valuation as any).nav_cents ?? 0) : null;
  const fundValue =
    valuation && navCents !== null
      ? {
          asOf: (valuation as any).as_of_date as string,
          navCents,
          investorShareCents:
            ownershipPct === null ? null : Math.round((navCents * ownershipPct) / 100),
        }
      : null;

  const closingDate = closing.closing_date as string;
  const snapshot: CapitalStatementSnapshot = {
    investorName: (profile as any)?.legal_name ?? (profile as any)?.email ?? "Investor",
    investorEmail: (profile as any)?.email ?? null,
    ownershipTitle: (subscription as any)?.ownership_title ?? null,
    fundName: (offering as any)?.name ?? "Fund",
    legalEntityName: (offering as any)?.legal_entity_name ?? null,
    closingDate,
    statementDate: todayIso(),
    periodEnd: closingDate,
    commitmentCents,
    contributedCents: contributedCents || Number(closing.funded_amount_cents ?? 0),
    outstandingCents: Math.max(
      0,
      commitmentCents - (contributedCents || Number(closing.funded_amount_cents ?? 0)),
    ),
    ownershipPct,
    shares,
    shareClass: (position as any)?.share_class ?? null,
    distributionsCents,
    fundValue,
  };

  return { snapshot, offeringId: app.offering_id as string, closingId: closing.id as string };
}

/**
 * Produces a statement for one investor. Earlier versions are kept and marked
 * superseded so the record shows every statement ever given out.
 */
export async function generateStatement(
  supabase: any,
  applicationId: string,
  generatedBy: string | null,
) {
  const built = await buildSnapshot(supabase, applicationId);
  if (!built) return null;

  const { data: previous } = await supabase
    .from("capital_account_statements")
    .select("id, version")
    .eq("application_id", applicationId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = previous ? Number((previous as any).version ?? 0) + 1 : 1;

  if (previous) {
    await supabase
      .from("capital_account_statements")
      .update({ superseded: true })
      .eq("application_id", applicationId)
      .eq("superseded", false);
  }

  const { data: row, error } = await supabase
    .from("capital_account_statements")
    .insert({
      offering_id: built.offeringId,
      application_id: applicationId,
      closing_id: built.closingId,
      statement_date: built.snapshot.statementDate,
      period_end: built.snapshot.periodEnd,
      snapshot: built.snapshot as any,
      version,
      superseded: false,
      generated_by: generatedBy,
    })
    .select("id, version, statement_date, generated_at")
    .single();
  if (error) throw new Error(error.message);

  return { ...(row as any), offeringId: built.offeringId };
}
