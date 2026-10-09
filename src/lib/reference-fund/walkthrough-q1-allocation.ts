// DEMO / SYNTHETIC inputs for the Walkthrough Q1 2026 allocation preview, recovered
// from existing records (takeover admissions, source package, bank lines, fee run).
import { WALKTHROUGH_INVESTORS, WALKTHROUGH_OFFERING_ID } from "./walkthrough-source";
import { WALKTHROUGH_Q1_POLICY, type SyntheticAllocationInput, type SyntheticParticipant } from "../synthetic-allocation";

export const WALKTHROUGH_NAV_ID = "b1cdb1e0-d316-4815-95c1-c983c8fc7b64";
export const WALKTHROUGH_FEE_RUN_ENTRY = "ca375744-b652-4987-bf9b-ededc4abc387";

const P: Record<string, { id: string; slug: string; feeCents: number; rate: number }> = {
  "Northwind Family Office LLC": { id: "fe56ef05-8ad2-464c-9491-7f04979db0e1", slug: "northwind", feeCents: 2_500_000, rate: 200 },
  "Cedar Ridge Partners LP": { id: "1d0abb38-d211-4ef5-aa82-f1a5c6c9586b", slug: "cedar", feeCents: 2_000_000, rate: 200 },
  "Atlas Peak Holdings Corp.": { id: "6496043c-2c80-4654-a91b-244448ea7703", slug: "atlas", feeCents: 1_500_000, rate: 200 },
  "Kestrel Holdings GmbH": { id: "eda69b87-8bad-4487-a67d-ada83e8acd65", slug: "kestrel", feeCents: 1_425_000, rate: 200 },
  "Juniper Lane Ventures LLC": { id: "f744665b-a500-484e-9334-bee007c5c6c6", slug: "juniper", feeCents: 1_250_000, rate: 200 },
  "Harbor & Pine Family Trust": { id: "d4421ad6-0a88-46fd-954b-f05aa2300dd5", slug: "harbor", feeCents: 750_000, rate: 150 },
  "Silverline Advisory Clients LLC (RIA-managed)": { id: "430b032e-6ae3-4c48-b800-21aeb129a2f7", slug: "silverline", feeCents: 750_000, rate: 150 },
  "Ada & Tunde Okafor (JTWROS)": { id: "9cf455f8-ce86-4ac3-a86d-6568023aca07", slug: "ada", feeCents: 562_500, rate: 150 },
  "Lena Rivera Self-Directed IRA": { id: "fd18d845-1dbe-4fbd-ace6-d23da2194aaa", slug: "lena", feeCents: 375_000, rate: 150 },
  "Erik Lindqvist": { id: "9035181f-846e-4fe7-bef9-181c29c8806c", slug: "erik", feeCents: 281_250, rate: 150 },
  "Blake Testholdings": { id: "d4cdc15f-7cb8-4143-9c88-cfd951a84163", slug: "blake", feeCents: 93_750, rate: 150 },
  "Avery Testinvestor": { id: "a213703a-c0e5-4fa1-a4a5-9eedbb3749a1", slug: "avery", feeCents: 37_500, rate: 150 },
  "Casey Testtrust": { id: "a4210d97-63ea-4b60-b290-d24db7f41aed", slug: "casey", feeCents: 18_750, rate: 150 },
};
const SOURCE_ONLY = new Set(["northwind", "cedar", "atlas"]);
const UNPAID: Record<string, number> = { juniper: 50_000_000, atlas: 20_000_000, erik: 15_000_000, blake: 5_000_000 };

/** Bank receipt dates (cash-applied amounts; Okafor's $50 overpayment stays a liability). */
const RECEIPTS: [string, string, number][] = [
  ["northwind", "2026-02-10", 100_000_000], ["cedar", "2026-02-11", 50_000_000], ["avery", "2026-02-12", 2_000_000],
  ["silverline", "2026-02-12", 40_000_000], ["harbor", "2026-02-12", 40_000_000], ["ada", "2026-02-13", 30_000_000],
  ["atlas", "2026-02-13", 40_000_000], ["casey", "2026-02-14", 1_000_000], ["lena", "2026-02-14", 20_000_000],
  ["cedar", "2026-02-14", 30_000_000], ["kestrel", "2026-02-20", 57_000_000],
];

export function walkthroughQ1AllocationInput(opts: { sourceOnlyApproved: boolean }): SyntheticAllocationInput {
  const participants: SyntheticParticipant[] = WALKTHROUGH_INVESTORS.map((inv) => {
    const p = P[inv.key];
    const so = SOURCE_ONLY.has(p.slug);
    const restrictions: string[] = [];
    if (p.slug === "erik") restrictions.push("AML hold: funding acceptance blocked (economic participation retained)");
    if (p.slug === "blake") restrictions.push("April 1 wire outside Q1");
    return {
      positionId: p.id, offeringId: WALKTHROUGH_OFFERING_ID, name: inv.key, classLabel: inv.cls,
      commitmentCents: inv.commitment * 100, openingCapitalCents: Math.round(inv.commitment * 0.398 * 100),
      admissionStatus: so ? "source_only_not_formally_admitted" : "formally_admitted",
      syntheticUseApproved: so ? opts.sourceOnlyApproved : true,
      sourceRef: so ? "walkthrough-source.ts (SOURCE-ONLY)" : "investor_takeover_admissions (DEMO register 2025-12-31)",
      unpaidCallCents: UNPAID[p.slug] ?? 0,
      creditsCents: p.slug === "ada" ? 5_000 : 0,
      restrictions,
    };
  });
  const id = (slug: string) => Object.values(P).find((x) => x.slug === slug)!.id;
  return {
    offeringId: WALKTHROUGH_OFFERING_ID, fundIsTestDemo: true,
    period: { start: "2026-01-01", end: "2026-03-31" },
    policy: WALKTHROUGH_Q1_POLICY,
    nav: { id: WALKTHROUGH_NAV_ID, offeringId: WALKTHROUGH_OFFERING_ID, navCents: 1_392_991_250, syntheticClassification: "DEMO / SYNTHETIC — UNAUDITED — VALUATIONS NOT INDEPENDENTLY VERIFIED", approvalScope: "internal_synthetic_only", status: "approved" },
    participants,
    contributions: RECEIPTS.map(([s, d, a]) => ({ positionId: id(s), receivedOn: d, amountCents: a, sourceRef: `WALKTHROUGH-Q1-2026:dep:${s}` })),
    feeLines: Object.values(P).map((p) => ({ positionId: p.id, netFeeCents: p.feeCents, rateBps: p.rate, termStatus: "class" as const, sourceRef: `fee_accrual ${WALKTHROUGH_FEE_RUN_ENTRY}` })),
    fund: { openingCapitalCents: 995_000_000, interestCents: 210_000, unrealizedGainCents: 10_000_000, operatingExpenseCents: 10_675_000, managementFeeCents: 11_543_750 },
    target: "preview",
  };
}
