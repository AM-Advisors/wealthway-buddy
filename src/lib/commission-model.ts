/** Pure Sales commission rules. Commission is earned only once the client's invoice is paid. */
export type CommissionLayer = "bdr" | "ae" | "sales_manager" | "cro" | "ceo";
export type CommissionRates = { ae: number; ae_cap_table: number; sales_manager: number; cro: number; ceo: number; bdr: number };

/** Standard rates in percent. */
export const DEFAULT_RATES: CommissionRates = { ae: 10, ae_cap_table: 15, sales_manager: 2, cro: 5, ceo: 5, bdr: 5 };

export const LAYER_LABEL: Record<CommissionLayer, string> = {
  bdr: "BDR", ae: "Account Executive", sales_manager: "Sales Manager", cro: "CRO", ceo: "CEO",
};
/** Ladder from lowest to highest title (BDR is a separate "when used" share). */
export const LADDER: Exclude<CommissionLayer, "bdr">[] = ["ae", "sales_manager", "cro", "ceo"];

export const COMMISSION_EDITORS = ["cro", "executive"];
export const COMMISSION_VIEW_ALL = ["cro", "executive", "super_admin", "finance", "leadership"];

/** Highest ladder rung a closer holds. */
export function closerRank(roles: string[]): Exclude<CommissionLayer, "bdr"> | "bdr" {
  if (roles.includes("executive")) return "ceo";
  if (roles.includes("cro")) return "cro";
  if (roles.includes("sales_management")) return "sales_manager";
  if (roles.includes("account_executive") || roles.includes("sales")) return "ae";
  if (roles.includes("bdr")) return "bdr";
  return "ae";
}

export const isCapTableLine = (serviceKey: string | null | undefined) => Boolean(serviceKey && serviceKey.startsWith("cap_table"));

export type Split = { layer: CommissionLayer; userId: string | null; ratePct: number };

/**
 * Splits one line. Layers at or below the closer's rank stack onto the closer;
 * higher layers go to their holders. BDR share only when a BDR was used.
 */
export function splitLine(opts: {
  rates: CommissionRates; capTable: boolean; closerId: string; closerRoles: string[];
  bdrId: string | null; managerId: string | null; croId: string | null; ceoId: string | null;
}): Split[] {
  const { rates } = opts;
  const rate: Record<Exclude<CommissionLayer, "bdr">, number> = {
    ae: opts.capTable ? rates.ae_cap_table : rates.ae, sales_manager: rates.sales_manager, cro: rates.cro, ceo: rates.ceo,
  };
  const holder: Record<Exclude<CommissionLayer, "bdr">, string | null> = { ae: null, sales_manager: opts.managerId, cro: opts.croId, ceo: opts.ceoId };
  const rank = closerRank(opts.closerRoles);
  const out: Split[] = [];
  if (rank === "bdr") {
    out.push({ layer: "bdr", userId: opts.closerId, ratePct: rates.bdr });
    for (const l of LADDER) out.push({ layer: l, userId: holder[l], ratePct: rate[l] });
    return out;
  }
  if (opts.bdrId && opts.bdrId !== opts.closerId) out.push({ layer: "bdr", userId: opts.bdrId, ratePct: rates.bdr });
  const idx = LADDER.indexOf(rank);
  LADDER.forEach((l, i) => out.push({ layer: l, userId: i <= idx ? opts.closerId : holder[l], ratePct: rate[l] }));
  return out;
}

export function validRates(r: CommissionRates) {
  return Object.values(r).every((v) => Number.isFinite(v) && v >= 0 && v <= 50);
}
