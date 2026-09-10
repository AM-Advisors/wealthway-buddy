import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getFundScope } from "@/lib/contracts.functions";
import type { ScopeService } from "@/components/service-gate";

/**
 * Sections shown on the fund pages, and the catalog service that governs each.
 * A section may name more than one service; the first one recorded wins.
 */
export const FUND_SECTION_SERVICES = {
  documents: ["subscription_docs"],
  signed_documents: ["subscription_docs"],
  applications: ["investor_onboarding"],
  onboarding: ["investor_onboarding"],
  identity: ["kyc", "kyb"],
  screening: ["aml_screening", "sanctions_screening"],
  accreditation: ["accreditation_506c", "accreditation_506b"],
  banking: ["bank_setup"],
  wires: ["wire_instructions"],
  funding: ["funding_tracking"],
  distributions: ["distributions"],
  filings: ["form_d", "blue_sky", "filing_tracking"],
  tax: ["tax_k1", "tax_1065", "tax_1042s"],
  reporting: ["investor_reporting", "capital_account_statements"],
  capital_accounts: ["capital_accounts"],
  diligence: ["investor_onboarding"],
} as const;

export type FundSection = keyof typeof FUND_SECTION_SERVICES;

/** 506(b) and 506(c) onboarding differ; only the fund's own exemption applies. */
function accreditationKey(regType: string | null | undefined) {
  return regType === "506b" ? "accreditation_506b" : "accreditation_506c";
}

export type FundScope = {
  /** Whether the signed-in person can read this client's scope at all. */
  canRead: boolean;
  /** Whether any scope has been recorded for this client. */
  configured: boolean;
  isStaff: boolean;
  clientId: string | null;
  regType: string | null;
  services: ScopeService[];
  /** The service record governing one fund page section, if any. */
  serviceFor: (section: FundSection) => ScopeService | undefined;
  counts: { included: number; pending: number; outside: number };
};

export function useFundScope(offeringId: string | null | undefined): FundScope {
  const load = useServerFn(getFundScope);
  const query = useQuery({
    queryKey: ["fund-scope", offeringId],
    queryFn: () => load({ data: { offeringId: offeringId as string } }),
    enabled: !!offeringId,
    retry: false,
    staleTime: 60_000,
  });

  const data = query.data as any;
  const services: ScopeService[] = (data?.services ?? []) as ScopeService[];
  const regType = (data?.fund?.reg_type as string | null) ?? null;
  const canRead = !!data && !query.isError;

  const serviceFor = (section: FundSection) => {
    let keys = [...FUND_SECTION_SERVICES[section]] as string[];
    if (section === "accreditation") keys = [accreditationKey(regType)];
    const candidates = keys
      .map((k) => services.find((s) => s.key === k))
      .filter(Boolean) as ScopeService[];
    if (candidates.length === 0) return undefined;
    return (
      candidates.find((s) => s.status === "included") ??
      candidates.find((s) => s.status !== "unset") ??
      candidates[0]
    );
  };

  const relevant = (Object.keys(FUND_SECTION_SERVICES) as FundSection[])
    .map((section) => serviceFor(section))
    .filter(Boolean) as ScopeService[];
  const unique = Array.from(new Map(relevant.map((s) => [s.key, s])).values());

  return {
    canRead,
    configured: !!data?.configured,
    isStaff: !!data?.isStaff,
    clientId: (data?.fund?.client_id as string | null) ?? null,
    regType,
    services,
    serviceFor,
    counts: {
      included: unique.filter((s) => s.status === "included").length,
      pending: unique.filter((s) => s.status === "requested").length,
      outside: unique.filter((s) => s.status === "not_included" || s.status === "optional").length,
    },
  };
}

/** Setup progress steps on the fund dashboard, and the service each depends on. */
export const SETUP_STEP_SECTIONS: Record<string, FundSection> = {
  bank: "banking",
  documents: "documents",
  room: "diligence",
  investors: "applications",
};

/** Compliance checklist rows, and the service that covers the filing. */
export function sectionForComplianceItem(
  key: string | null | undefined,
  category: string | null | undefined,
): FundSection | undefined {
  const k = (key ?? "").toLowerCase();
  const c = (category ?? "").toLowerCase();
  if (k.startsWith("tax") || c === "tax") return "tax";
  if (k === "ein_ss4" || c === "formation") return undefined; // formation sits with the client
  if (c === "federal" || c === "state" || k.startsWith("form_") || k === "blue_sky")
    return "filings";
  return undefined;
}

/** Status of a section for a viewer, once the "no scope recorded" rule is applied. */
export function sectionState(scope: FundScope, section: FundSection) {
  if (!scope.canRead) return "open" as const;
  const service = scope.serviceFor(section);
  const status = service?.status ?? "unset";
  if (status === "included") return "included" as const;
  if (status === "unset" || !scope.configured) return scope.isStaff ? "unknown" : "blocked";
  return "blocked" as const;
}
