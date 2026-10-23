/**
 * Quote sections: every part of a quote carries an on/off switch (SPST).
 * Switching a part off hides it from the client — the wording stays recorded, nothing is deleted.
 */
import {
  ABOUT_HARMONIOUS,
  approachText,
  needsText,
  pricingText,
  servicesFromSow,
  summaryText,
  type LockFacts,
  type Section,
} from "./sales-documents-model";

export type QuoteSectionKey =
  | "summary" | "needs" | "approach" | "services" | "pricing" | "timeline" | "next" | "notes" | "about";

export type QuoteSectionDef = { key: QuoteSectionKey; title: string; on: boolean; generated: boolean; hint: string };

/** Every part of a quote, in the order the client sees them. Only pricing and notes start switched on. */
export const QUOTE_SECTIONS: readonly QuoteSectionDef[] = [
  { key: "summary", title: "Summary", on: false, generated: true, hint: "One line naming the services and who they're for." },
  { key: "needs", title: "Your needs", on: false, generated: true, hint: "The services you quoted, listed back to the client." },
  { key: "approach", title: "Our approach", on: false, generated: true, hint: "Harmonious's standard five-step delivery process." },
  { key: "services", title: "Services and pricing", on: false, generated: true, hint: "What each service covers, in Statement of Work wording." },
  { key: "pricing", title: "Pricing", on: true, generated: true, hint: "The fee table the client signs against." },
  { key: "timeline", title: "Timeline", on: false, generated: false, hint: "Write the schedule for this engagement." },
  { key: "next", title: "Next steps", on: false, generated: false, hint: "What the client does after signing." },
  { key: "notes", title: "Notes", on: true, generated: false, hint: "The note you write with the quote." },
  { key: "about", title: "About Harmonious", on: false, generated: true, hint: "Shown under the signature block." },
];

export const quoteSectionDef = (key: string) => QUOTE_SECTIONS.find((d) => d.key === key);

/** Off means hidden from the client, never deleted. */
export const isQuoteSectionShown = (s: { included?: boolean | undefined }) => s.included !== false;

export const defaultQuoteSections = (): Section[] =>
  QUOTE_SECTIONS.map((d) => ({ key: d.key, title: d.title, body: "", included: d.on }));

const MAX_BODY = 20000;

/**
 * Always returns every part of the quote in canonical order: a switched-off part keeps its wording here,
 * parts that aren't part of a quote are dropped, and parts never recorded fall back to their default position.
 */
type StoredSection = { key?: unknown; body?: unknown; included?: unknown };

export function sanitizeQuoteSections(input: unknown): Section[] {
  const stored = Array.isArray(input) ? (input as StoredSection[]) : [];
  const byKey = new Map<string, Section>();
  for (const s of stored) {
    const key = String(s?.key ?? "");
    const def = quoteSectionDef(key);
    if (!def || byKey.has(key)) continue;
    byKey.set(key, {
      key: def.key,
      title: def.title,
      body: String(s?.body ?? "").slice(0, MAX_BODY),
      included: s?.included !== false,
    });
  }
  return QUOTE_SECTIONS.map((d) => byKey.get(d.key) ?? { key: d.key, title: d.title, body: "", included: d.on });
}

type QuoteLineFacts = {
  label: string;
  quantity: number;
  unitCents: number;
  billingFrequency?: string | null | undefined;
  details?: { scope?: string | undefined; included?: string[] | undefined; excluded?: string[] | undefined } | null | undefined;
};

/** The quote's own services and prices, in the shape the shared section wording expects. */
export function quoteLockFacts(f: { organization: string | null; contactName?: string | null; lines: readonly QuoteLineFacts[] }): LockFacts {
  return {
    organization: f.organization,
    contactName: f.contactName ?? null,
    lines: f.lines.map((l) => ({
      label: l.label,
      quantity: l.quantity,
      unit_cents: l.unitCents,
      line_cents: Math.round(l.quantity * l.unitCents),
      billing_frequency: l.billingFrequency ?? "one_time",
      service_details: l.details ? {
        ...(l.details.scope === undefined ? {} : { scope: l.details.scope }),
        ...(l.details.included === undefined ? {} : { included: l.details.included }),
        ...(l.details.excluded === undefined ? {} : { excluded: l.details.excluded }),
      } : null,
    })),
  };
}

/** The wording a part shows when switched on. Generated parts come from the quote itself. */
export function quoteSectionBody(section: Section, f: LockFacts, about?: string | null): string {
  switch (section.key) {
    case "summary": return summaryText(f);
    case "needs": return needsText(f);
    case "approach": return approachText(f);
    case "services": return servicesFromSow(f.lines.map((l) => ({ label: l.label, service_details: l.service_details ?? null })));
    case "pricing": return pricingText(f.lines);
    case "about": return about?.trim() || ABOUT_HARMONIOUS;
    default: return section.body;
  }
}

/** What the client page shows: only switched-on parts that have wording. */
export function quoteClientSections(
  stored: unknown,
  f: LockFacts,
  about: string | null,
  notes: string | null,
): { title: string; body: string }[] {
  return sanitizeQuoteSections(stored)
    .filter(isQuoteSectionShown)
    .map((s) => ({
      title: s.title,
      body: (s.key === "notes" ? (notes ?? "") : quoteSectionBody(s, f, about)).trim(),
    }))
    .filter((s) => s.body.length > 0);
}

/** The fee table is a switchable part too: off hides it from the client page, the invoice is still issued. */
export const quoteShowsPricing = (stored: unknown) =>
  isQuoteSectionShown(sanitizeQuoteSections(stored).find((s) => s.key === "pricing") ?? { included: true });
