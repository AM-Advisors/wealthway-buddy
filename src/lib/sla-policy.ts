// SLA resolution (pure). Order: engagement override → contracted SLA (policies
// marked use_contract_sla) → product + level default → explicit global fallback.
// Never falls back on service_level alone; unresolved = "Custom SLA / Not Configured".

export interface SlaPolicy {
  id: string; service_product: string | null; service_level: string | null; request_type: string | null;
  is_global_fallback: boolean; initial_response_hours: number | null; resolution_target_hours: number | null;
  warning_threshold_percentage: number; use_contract_sla: boolean; active: boolean;
  effective_from: string; effective_to: string | null;
}
export interface SlaEngagement { service_product: string; service_level: string; sla_initial_response_hours?: number | null; sla_resolution_target_hours?: number | null; response_sla?: string | null; }
export interface ResolvedSla { hours: number | null; resolutionHours: number | null; warningPct: number; source: string; policyId: string | null; }

const PRODUCT_LEVEL_NAME: Record<string, string> = {
  "SPV_ADMINISTRATION/CORE": "SPV Core", "SPV_ADMINISTRATION/PLUS": "SPV Plus", "SPV_ADMINISTRATION/WHITE_GLOVE": "SPV White Glove",
  "FUND_ADMINISTRATION/CORE": "Fund Core", "FUND_ADMINISTRATION/FUND_ADMINISTRATION": "Fund Administration",
  "FUND_ADMINISTRATION/WHITE_GLOVE": "White Glove Fund Administration", "FUND_ADMINISTRATION/INSTITUTIONAL": "Institutional",
};

export const NOT_CONFIGURED = "Custom SLA / Not Configured";

function inEffect(p: SlaPolicy, today: string) {
  return p.active && p.effective_from <= today && (!p.effective_to || p.effective_to >= today);
}

/** Parses an hour count from contract text such as "8 business hours". */
export function contractHours(text?: string | null): number | null {
  const m = text?.match(/(\d+(?:\.\d+)?)\s*(h\b|hr|hour|business hour)/i);
  return m ? Number(m[1]) : null;
}

export function resolveSla(eng: SlaEngagement | null, policies: SlaPolicy[], requestType?: string | null, today = new Date().toISOString().slice(0, 10)): ResolvedSla {
  const live = policies.filter((p) => inEffect(p, today));
  const pick = (list: SlaPolicy[]) => list.find((p) => requestType && p.request_type === requestType) ?? list.find((p) => !p.request_type) ?? null;
  const policy = eng ? pick(live.filter((p) => p.service_product === eng.service_product && p.service_level === eng.service_level)) : null;
  const warningPct = policy?.warning_threshold_percentage ?? 75;

  if (eng?.sla_initial_response_hours != null) {
    return { hours: Number(eng.sla_initial_response_hours), resolutionHours: eng.sla_resolution_target_hours ?? policy?.resolution_target_hours ?? null, warningPct, source: "Engagement Override", policyId: policy?.id ?? null };
  }
  if (eng && policy) {
    const name = PRODUCT_LEVEL_NAME[`${eng.service_product}/${eng.service_level}`] ?? `${eng.service_product} ${eng.service_level}`;
    if (policy.use_contract_sla) {
      const h = contractHours(eng.response_sla);
      return h != null ? { hours: h, resolutionHours: policy.resolution_target_hours, warningPct, source: "Contracted SLA", policyId: policy.id }
        : { hours: null, resolutionHours: null, warningPct, source: NOT_CONFIGURED, policyId: policy.id };
    }
    if (policy.initial_response_hours != null) return { hours: Number(policy.initial_response_hours), resolutionHours: policy.resolution_target_hours, warningPct, source: `${name} Default`, policyId: policy.id };
  }
  const global = pick(live.filter((p) => p.is_global_fallback));
  if (global?.initial_response_hours != null) return { hours: Number(global.initial_response_hours), resolutionHours: global.resolution_target_hours, warningPct: global.warning_threshold_percentage, source: "Global Fallback", policyId: global.id };
  return { hours: null, resolutionHours: null, warningPct, source: NOT_CONFIGURED, policyId: null };
}
