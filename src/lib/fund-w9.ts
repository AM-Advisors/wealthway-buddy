import type { TaxFormFill } from "@/lib/onboarding-intake-model";
import { parseAddressParts } from "@/lib/address";

export function fundW9Fill(fund: { legal_entity_name?: string | null; principal_address?: string | null; tax_classification?: string | null }, ein: string): TaxFormFill {
  const a = parseAddressParts(fund.principal_address);
  const raw = String(fund.tax_classification ?? "").trim().toLowerCase().replace(/[ _-]+/g, " ");
  const classifications: Record<string, TaxFormFill["federalClassification"]> = { partnership: "partnership", "c corporation": "c_corp", "c corp": "c_corp", "s corporation": "s_corp", "s corp": "s_corp", trust: "trust" };
  const llc = raw.match(/^llc[ :]+([csp])$/i);
  return { legalName: fund.legal_entity_name ?? "", addressLine: [a.addressLine1, a.addressLine2].filter(Boolean).join(", "), cityStateZip: [a.addressCity, [a.addressState, a.addressZip].filter(Boolean).join(" ")].filter(Boolean).join(", "), federalClassification: llc ? "llc" : classifications[raw] ?? null, llcClass: llc ? llc[1]?.toUpperCase() as "C" | "S" | "P" : null, tinKind: "ein", tin: ein.replace(/\D/g, ""), signerName: "", signedDate: "" };
}

export function fundW9Missing(fill: TaxFormFill) {
  return [!fill.legalName.trim() && "Fund legal name", !fill.addressLine?.trim() && "Fund address", !fill.cityStateZip?.trim() && "City, state and ZIP", !fill.federalClassification && "Federal tax classification", String(fill.tin ?? "").length !== 9 && "Fund EIN"].filter((x): x is string => !!x);
}

export function canSignFundW9(userId: string, signerId: string, assigned: boolean, status: string) {
  return assigned && userId === signerId && status === "pending";
}