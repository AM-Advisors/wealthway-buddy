/** Per-fund service level (SLA). Self Serve is the default; paid levels activate only after payment. */
import { RATE_CARD_FUND_LEVELS } from "@/lib/product-pricing";

export type ServiceLevel = "self_serve" | "core" | "plus" | "white_glove" | "institutional";
export const DEFAULT_SERVICE_LEVEL: ServiceLevel = "self_serve";

const ADMIN_ANNUAL = 12000;
const rate = (k: keyof typeof RATE_CARD_FUND_LEVELS) => (RATE_CARD_FUND_LEVELS[k].annual - ADMIN_ANNUAL) * 100;

export const SERVICE_LEVELS: { key: ServiceLevel; name: string; summary: string; annualCents: number | null }[] = [
  { key: "self_serve", name: "Self Serve", summary: "You run every step yourself. Included: General Operations inbox, guaranteed response within 5 business days.", annualCents: 0 },
  { key: "core", name: "Core", summary: "Additional cost. Email support, 72-hour response.", annualCents: rate("core") },
  { key: "plus", name: "Plus", summary: "Additional cost. Named contact, 48-hour response.", annualCents: rate("fund_administration") },
  { key: "white_glove", name: "White Glove", summary: "Additional cost. Named administrator, 24-hour response, proactive management.", annualCents: rate("white_glove") },
  { key: "institutional", name: "Institutional", summary: "Additional cost. Dedicated team and custom service levels. Custom quote.", annualCents: null },
];

export function normalizeServiceLevel(v: unknown): ServiceLevel {
  return SERVICE_LEVELS.some((l) => l.key === v) ? (v as ServiceLevel) : DEFAULT_SERVICE_LEVEL;
}

/** Quote line for a paid level (first year). Self Serve and Institutional (custom quote) are not charged here. */
export function serviceLevelItem(level: unknown): { key: string; name: string; cents: number; source: "rate_card" } | null {
  const l = SERVICE_LEVELS.find((x) => x.key === normalizeServiceLevel(level))!;
  if (!l.annualCents) return null;
  return { key: `service_level_${l.key}`, name: `${l.name} service level (first year)`, cents: l.annualCents, source: "rate_card" };
}

/** What a submission sets: paid levels become active only once paid; otherwise the fund stays Self Serve. */
export function resolveLevelOnSubmit(requested: unknown, payment: { paid: boolean } | null): { active: ServiceLevel; status: "active" | "awaiting_payment" | "quote_requested" } {
  const level = normalizeServiceLevel(requested);
  if (level === "self_serve") return { active: "self_serve", status: "active" };
  if (level === "institutional") return { active: "self_serve", status: "quote_requested" };
  return payment?.paid ? { active: level, status: "active" } : { active: "self_serve", status: "awaiting_payment" };
}

/** On Self Serve funds the fund's own managers may complete setup steps Harmonious would otherwise do. */
export function managerMayComplete(level: unknown, isFundManager: boolean): boolean {
  return isFundManager && normalizeServiceLevel(level) === "self_serve";
}
