/**
 * Self-serve SaaS order model (pure). Prices come only from product-pricing.ts
 * and are recomputed on the server; the browser total is a preview.
 */
import { INVESTOR_TIERS, productByKey, type Line } from "./product-pricing";

export const SAAS_MSA_VERSION = "Harmonious MSA 2026-10";
export type OrderInterval = "annual" | "quarterly";

export const SERVICING_KEYS = ["self_serve", "core", "plus", "white_glove"] as const;
export type ServicingKey = (typeof SERVICING_KEYS)[number];
export const CAP_TIERS = ["none", "starter", "growth", "scale"] as const;
export type CapTier = (typeof CAP_TIERS)[number];

export const INVESTOR_SERVICING_KEYS = ["self_serve", "essentials", "standard", "plus", "premier"] as const;
export type InvestorServicingKey = (typeof INVESTOR_SERVICING_KEYS)[number];

export interface OrderSelection {
  investorServicing?: InvestorServicingKey | undefined; // per fund; defaults to Self Serve
  funds: number; // SaaS platform fee per fund (0 = none)
  servicing: ServicingKey;
  capTable: CapTier;
  alaCarte: Record<string, number>; // slug -> quantity
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const SERVICING_NAME: Record<ServicingKey, string> = { self_serve: "Self Serve", core: "Core", plus: "Plus", white_glove: "White Glove" };
const CAP_NAME: Record<Exclude<CapTier, "none">, string> = { starter: "Starter", growth: "Growth", scale: "Scale" };

const annual = (l: Line) => l.prices.find((p) => p.billing === "annual")?.amount ?? null;
/** Charge per billing period for a recurring line. Quarterly uses the published quarterly price, else yearly / 4 + 10%. */
function periodAmount(l: Line, interval: OrderInterval): number | null {
  const a = annual(l);
  if (a == null) return null;
  if (interval === "annual") return a;
  return l.prices.find((p) => p.billing === "quarterly")?.amount ?? Math.round((a / 4) * 1.1);
}

/** Purchasable à la carte services (fixed price only; pass-through/custom are excluded). */
export function alaCarteCatalog() {
  return productByKey("saas").alaCarte
    .filter((l) => l.prices[0]?.amount != null && l.prices[0]!.amount! > 0)
    .map((l) => ({ key: slug(l.name), name: l.name, amount: l.prices[0]!.amount!, recurring: l.prices[0]!.billing === "annual", note: l.prices[0]!.note ?? null }));
}

export interface PricedLine { key: string; name: string; quantity: number; unit: number; total: number; recurring: boolean }
export interface PricedOrder { lines: PricedLine[]; recurring: number; oneTime: number; interval: OrderInterval }

export function priceOrder(sel: OrderSelection, interval: OrderInterval): PricedOrder {
  const lines: PricedLine[] = [];
  const push = (key: string, name: string, quantity: number, unit: number | null, recurring: boolean) => {
    if (unit == null) throw new Error(`${name} needs a custom quote.`);
    if (quantity > 0) lines.push({ key, name, quantity, unit, total: unit * quantity, recurring });
  };
  const funds = Math.max(0, Math.min(50, Math.floor(sel.funds)));
  if (funds) push("fund_platform", "SaaS platform fee (per fund)", funds, periodAmount(productByKey("saas").fundCost[0]!, interval), true);
  if (sel.servicing !== "self_serve") {
    const l = productByKey("venture").servicing.client.find((x) => x.name === SERVICING_NAME[sel.servicing]);
    if (!l) throw new Error("Unknown servicing level.");
    push(`servicing_${sel.servicing}`, `${l.name} servicing`, 1, periodAmount(l, interval), true);
  }
  const inv = sel.investorServicing ?? "self_serve";
  if (inv !== "self_serve" && funds) {
    const tier = INVESTOR_TIERS.find((t) => t.key === inv);
    const l = productByKey("saas").servicing.investor.find((x) => x.name === `${tier?.name} investor servicing`);
    if (!l) throw new Error("Unknown investor servicing tier.");
    push(`investor_servicing_${inv}`, `${l.name} (per fund)`, funds, periodAmount(l, interval), true);
  }
  if (sel.capTable !== "none") {
    const l = productByKey("cap_table").fundCost.find((x) => x.name === CAP_NAME[sel.capTable as Exclude<CapTier, "none">]);
    if (!l) throw new Error("Unknown cap table plan.");
    push(`cap_table_${sel.capTable}`, `Cap table — ${l.name}`, 1, periodAmount(l, interval), true);
  }
  const cat = alaCarteCatalog();
  for (const [k, qRaw] of Object.entries(sel.alaCarte ?? {})) {
    const q = Math.max(0, Math.min(100, Math.floor(qRaw)));
    if (!q) continue;
    const item = cat.find((c) => c.key === k);
    if (!item) throw new Error("Unknown service.");
    const unit = item.recurring && interval === "quarterly" ? Math.round((item.amount / 4) * 1.1) : item.amount;
    push(`alacarte_${k}`, item.name, q, unit, item.recurring);
  }
  const recurring = lines.filter((l) => l.recurring).reduce((s, l) => s + l.total, 0);
  const oneTime = lines.filter((l) => !l.recurring).reduce((s, l) => s + l.total, 0);
  return { lines, recurring, oneTime, interval };
}

/** Entitlement keys an order grants once access opens. */
export function entitlementKeys(sel: OrderSelection): string[] {
  const keys = ["platform_core", `servicing_${sel.servicing}`];
  if (sel.funds > 0) keys.push("fund_platform", `investor_servicing_${sel.investorServicing ?? "self_serve"}`);
  if (sel.capTable !== "none") keys.push("cap_table", `cap_table_${sel.capTable}`);
  for (const [k, q] of Object.entries(sel.alaCarte ?? {})) if (q > 0) keys.push(`alacarte_${k}`);
  return keys;
}

/** Access opens only when the SOW is signed, payment is current, the signer passed KYC and the company passed KYB. */
export function accessOpen(o: { payment_status: string; kyb_status: string; msa_accepted_at: string | null }, kycOpen: boolean) {
  return !!o.msa_accepted_at && ["paid", "past_due"].includes(o.payment_status) && o.kyb_status === "approved" && kycOpen;
}

// ---------- Menu gating ----------
// Deny-by-default for gated clients: a path is either always allowed, tied to a purchase, or unpurchased.
const ALWAYS = ["/home", "/manager", "/client/home", "/messages", "/manager/messages", "/client", "/profile", "/access", "/security", "/manager/agreements", "/client/agreements", "/plan/setup", "/plan/start", "/help"];
const ALWAYS_PREFIX = ["/plan/", "/sign/", "/guides/", "/help/", "/client/agreements/", "/manager/messages/", "/manager/agreements/", "/client/inbox", "/client/invoices", "/client/payments", "/client/services", "/client/sign-offs", "/client/banking", "/client/wires", "/client/setup-options", "/client/add-cap-table"];
const NEEDS: { prefix: string; key: string }[] = [
  { prefix: "/client/cap-table", key: "cap_table" },
  { prefix: "/my-funds", key: "fund_platform" },
  { prefix: "/client/funds", key: "fund_platform" },
  { prefix: "/activity", key: "fund_platform" },
  { prefix: "/investor-reporting", key: "fund_platform" },
  { prefix: "/documents", key: "fund_platform" },
  { prefix: "/tax", key: "fund_platform" },
  { prefix: "/distributions", key: "fund_platform" },
  { prefix: "/manager/", key: "fund_platform" },
];
export const UNPURCHASED = "__unpurchased";
const CLIENT_SPACES = ["/client", "/manager", "/my-funds", "/activity", "/investor-reporting", "/documents", "/tax", "/distributions", "/professional"];

/** Required entitlement for a client path, or null when always allowed / not a client page. */
export function requiredEntitlement(path: string): string | null {
  if (ALWAYS.includes(path) || ALWAYS_PREFIX.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path === p)) return null;
  const hit = NEEDS.find((n) => n.prefix.endsWith("/") ? path.startsWith(n.prefix) : path === n.prefix || path.startsWith(`${n.prefix}/`));
  if (hit) return hit.key;
  return CLIENT_SPACES.some((c) => path === c || path.startsWith(`${c}/`)) ? UNPURCHASED : null;
}

/** Legacy clients (null keys) keep their full menu; gated clients only see what they bought. */
export function filterByEntitlements<T extends { url: string }>(links: T[], keys: string[] | null): T[] {
  if (!keys) return links;
  return links.filter((l) => { const need = requiredEntitlement(l.url); return !need || keys.includes(need); });
}
