import { describe, expect, it } from "vitest";
import { resolveSla, NOT_CONFIGURED, type SlaPolicy } from "./sla-policy";
import { bandForRaise, feeGroup } from "./spv-transaction-pricing";

const P = (p: string | null, l: string | null, h: number | null, extra: Partial<SlaPolicy> = {}): SlaPolicy => ({ id: `${p}/${l}`, service_product: p, service_level: l, request_type: null, is_global_fallback: false, initial_response_hours: h, resolution_target_hours: null, warning_threshold_percentage: 75, use_contract_sla: false, active: true, effective_from: "2026-01-01", effective_to: null, ...extra });
const policies = [P("SPV_ADMINISTRATION", "CORE", 72), P("SPV_ADMINISTRATION", "PLUS", 48), P("SPV_ADMINISTRATION", "WHITE_GLOVE", 24),
  P("FUND_ADMINISTRATION", "CORE", 72), P("FUND_ADMINISTRATION", "FUND_ADMINISTRATION", 48), P("FUND_ADMINISTRATION", "WHITE_GLOVE", 24), P("FUND_ADMINISTRATION", "INSTITUTIONAL", null, { use_contract_sla: true })];

describe("SLA by product + level", () => {
  it("defaults per product", () => {
    expect(resolveSla({ service_product: "SPV_ADMINISTRATION", service_level: "PLUS" }, policies)).toMatchObject({ hours: 48, source: "SPV Plus Default" });
    expect(resolveSla({ service_product: "SPV_ADMINISTRATION", service_level: "WHITE_GLOVE" }, policies)).toMatchObject({ hours: 24, source: "SPV White Glove Default" });
    expect(resolveSla({ service_product: "FUND_ADMINISTRATION", service_level: "CORE" }, policies).hours).toBe(72);
  });
  it("engagement override wins", () => {
    expect(resolveSla({ service_product: "FUND_ADMINISTRATION", service_level: "WHITE_GLOVE", sla_initial_response_hours: 12 }, policies)).toMatchObject({ hours: 12, source: "Engagement Override" });
  });
  it("Institutional uses the contract, never a guess", () => {
    expect(resolveSla({ service_product: "FUND_ADMINISTRATION", service_level: "INSTITUTIONAL", response_sla: "8 business hours" }, policies)).toMatchObject({ hours: 8, source: "Contracted SLA" });
    expect(resolveSla({ service_product: "FUND_ADMINISTRATION", service_level: "INSTITUTIONAL" }, policies)).toMatchObject({ hours: null, source: NOT_CONFIGURED });
  });
  it("no level-only fallback; global only if configured", () => {
    expect(resolveSla({ service_product: "CAP_TABLE", service_level: "WHITE_GLOVE" }, policies).hours).toBeNull();
    expect(resolveSla({ service_product: "CAP_TABLE", service_level: "WHITE_GLOVE" }, [...policies, P(null, null, 96, { is_global_fallback: true })])).toMatchObject({ hours: 96, source: "Global Fallback" });
  });
  it("expired policies are ignored", () => {
    expect(resolveSla({ service_product: "SPV_ADMINISTRATION", service_level: "CORE" }, [P("SPV_ADMINISTRATION", "CORE", 72, { effective_to: "2025-12-31" })]).hours).toBeNull();
  });
});

describe("SPV transaction pricing", () => {
  const bands = [
    { id: "a", label: "Under $250,000", min_raise_usd: 0, max_raise_usd: 250000, fee_usd: 5000, sort_order: 10 },
    { id: "c", label: "$1M–$5M", min_raise_usd: 1000000, max_raise_usd: 5000000, fee_usd: 12500, sort_order: 30 },
    { id: "e", label: "Over $10M", min_raise_usd: 10000000, max_raise_usd: null, fee_usd: null, sort_order: 50 },
  ];
  it("bands by raise; custom above $10M", () => {
    expect(bandForRaise(bands, 3_000_000)?.fee_usd).toBe(12500);
    expect(bandForRaise(bands, 25_000_000)?.fee_usd).toBeNull();
  });
  it("quote lines group by fee type", () => {
    expect(feeGroup("SPV_TXN:x")).toBe("one_time");
    expect(feeGroup("ADMIN:SPV_ADMINISTRATION:WHITE_GLOVE")).toBe("annual");
    expect(feeGroup("additional_close", "transaction")).toBe("event");
  });
});
