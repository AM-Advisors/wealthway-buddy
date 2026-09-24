/**
 * Stage 4 pure rules: centrally approved compliance policy, approved legal
 * wording and the per-investment production preflight gate.
 * Nothing here invents a country list, a threshold or legal text.
 */
import type { AmlPolicy } from "@/lib/onboarding-intake-model";

export interface PolicyEntry {
  id: string;
  kind: "high_risk_jurisdiction" | "edd_amount_threshold";
  country_code: string | null;
  risk_classification: string | null;
  threshold_cents: number | null;
  currency: string | null;
  scope: "global" | "fund";
  offering_id: string | null;
  effective_date: string;
  status: string;
  approved_by: string | null;
}

/** Only approved, effective entries count. No approved entries → no triggers. */
export function resolveAmlPolicy(entries: PolicyEntry[], offeringId: string, todayIso: string): AmlPolicy & { configured: { countries: boolean; threshold: boolean } } {
  const live = entries.filter(
    (e) => e.status === "approved" && e.approved_by && e.effective_date <= todayIso && (e.scope === "global" || e.offering_id === offeringId),
  );
  const countries = [...new Set(live.filter((e) => e.kind === "high_risk_jurisdiction" && e.country_code).map((e) => String(e.country_code).toUpperCase()))];
  const thresholds = live.filter((e) => e.kind === "edd_amount_threshold" && Number(e.threshold_cents) > 0 && String(e.currency ?? "").toUpperCase() === "USD");
  // A fund-specific threshold overrides the global one; otherwise the latest effective global applies.
  const pick = (list: PolicyEntry[]) => [...list].sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0] ?? null;
  const t = pick(thresholds.filter((e) => e.scope === "fund")) ?? pick(thresholds.filter((e) => e.scope === "global"));
  return {
    highRiskCountries: countries,
    eddThresholdCents: t ? Number(t.threshold_cents) : null,
    configured: { countries: countries.length > 0, threshold: Boolean(t) },
  };
}

export interface WordingRow {
  id: string;
  requirement_key: string;
  title: string;
  wording: string;
  version: number;
  effective_date: string;
  status: string;
  approved_by: string | null;
}

/** Latest approved, effective version per requirement key. Drafts and retired never shown. */
export function approvedWording(rows: WordingRow[], todayIso: string): Map<string, WordingRow> {
  const out = new Map<string, WordingRow>();
  for (const r of rows) {
    if (r.status !== "approved" || !r.approved_by || r.effective_date > todayIso) continue;
    const cur = out.get(r.requirement_key);
    if (!cur || r.version > cur.version) out.set(r.requirement_key, r);
  }
  return out;
}

/** Requirement keys whose wording is legally significant. */
export const WORDING_KEYS = {
  badActor: "bad_actor_questionnaire",
  certification: (k: string) => `certification:${k}`,
  eligibility: (k: string) => `eligibility:${k}`,
} as const;

export type PreflightCode =
  | "legal_wording_missing"
  | "tax_form_mapping_incomplete"
  | "tax_classification_review"
  | "compliance_policy_missing"
  | "signature_template_not_ready";

export interface PreflightBlocker {
  code: PreflightCode;
  detail: string;
}

export interface PreflightInput {
  badActorApplies: boolean;
  certificationKeys: string[];
  representationEligibilityKeys: string[];
  approvedWordingKeys: Set<string>;
  taxRequired: boolean;
  taxRouting: { status: "determined"; formType: string } | { status: "needs_review" | string };
  taxFormMissingFacts: string[];
  /** true when the offering explicitly requires a policy that is not approved. */
  policyRequired: { countries: boolean; threshold: boolean };
  policyConfigured: { countries: boolean; threshold: boolean };
  signatureTemplateReady: boolean;
}

/** Precise internal reasons. Investors only ever see INVESTOR_PREFLIGHT_MESSAGE. */
export function productionPreflight(i: PreflightInput): PreflightBlocker[] {
  const out: PreflightBlocker[] = [];
  if (i.badActorApplies && !i.approvedWordingKeys.has(WORDING_KEYS.badActor)) {
    out.push({ code: "legal_wording_missing", detail: "Bad Actor questionnaire has no approved wording." });
  }
  for (const k of i.certificationKeys) {
    if (!i.approvedWordingKeys.has(WORDING_KEYS.certification(k))) out.push({ code: "legal_wording_missing", detail: `Certification "${k}" has no approved wording.` });
  }
  for (const k of i.representationEligibilityKeys) {
    if (!i.approvedWordingKeys.has(WORDING_KEYS.eligibility(k))) out.push({ code: "legal_wording_missing", detail: `Eligibility representation "${k}" has no approved wording.` });
  }
  if (i.taxRequired) {
    if (i.taxRouting.status !== "determined") out.push({ code: "tax_classification_review", detail: "Tax classification needs Harmonious review." });
    else if (i.taxFormMissingFacts.length) out.push({ code: "tax_form_mapping_incomplete", detail: `Form ${(i.taxRouting as any).formType} needs: ${i.taxFormMissingFacts.join(", ")}.` });
  }
  if (i.policyRequired.countries && !i.policyConfigured.countries) out.push({ code: "compliance_policy_missing", detail: "Fund requires a high-risk jurisdiction policy; none is approved." });
  if (i.policyRequired.threshold && !i.policyConfigured.threshold) out.push({ code: "compliance_policy_missing", detail: "Fund requires an EDD amount threshold; none is approved." });
  if (!i.signatureTemplateReady) out.push({ code: "signature_template_not_ready", detail: "A required signing template is not prepared." });
  return out;
}

export const INVESTOR_PREFLIGHT_MESSAGE = "Harmonious needs to complete part of the setup before you can continue.";
