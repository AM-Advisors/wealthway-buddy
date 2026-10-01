import { isReconciledFunding } from "@/lib/funding-status";

/**
 * Fund Cap Table: a pure, read-only projection of a Fund's investor records
 * plus active side letters. Never stored, never a source for economics.
 */

export type CapInvestment = {
  id: string;
  investorName: string;
  profileName: string | null;
  classKey: string | null;
  stage: string | null;
  fundingStatus: string | null;
  commitmentCents: number | null;
  acceptedCents: number | null;
  fundedCents: number | null;
  units: number | null;
  removed: boolean;
};

export type ClassTerms = {
  managementFeePercent: number | null;
  carryPercent: number | null;
  preferredReturnPercent: number | null;
};

export type CapSideLetter = {
  id: string;
  onboardingId: string | null;
  status: string;
  mfnEnabled: boolean;
  effectiveDate: string | null;
  expiryDate: string | null;
  terms: { category: string; value?: string | null; description: string }[];
};

export type EffectiveTerm = { label: string; classValue: number | null; overrideText: string | null };

export type CapRow = CapInvestment & {
  commitmentCountedCents: number;
  fundedCountedCents: number;
  pctCommitted: number;
  pctFunded: number;
  sideLetter: { id: string; status: "active" | "expired" | "proposed"; mfn: boolean; termCount: number } | null;
  terms: EffectiveTerm[];
};

const EXCLUDED_STAGES = new Set(["declined", "withdrawn", "rejected", "cancelled"]);

function letterLive(l: CapSideLetter, today: Date): boolean {
  if (l.status !== "active") return false;
  const d = today.toISOString().slice(0, 10);
  if (l.effectiveDate && l.effectiveDate > d) return false;
  if (l.expiryDate && l.expiryDate < d) return false;
  return true;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1_000_000) / 10_000 : 0);

export function buildFundCapTable(
  investments: CapInvestment[],
  classTerms: Record<string, ClassTerms>,
  baseTerms: ClassTerms,
  sideLetters: CapSideLetter[],
  today: Date = new Date(),
) {
  const included = investments.filter((i) => !i.removed && !EXCLUDED_STAGES.has(String(i.stage ?? "")));
  const counted = included.map((i) => ({
    i,
    commit: Math.max(0, i.commitmentCents ?? i.acceptedCents ?? 0),
    funded: isReconciledFunding(i.fundingStatus) ? Math.max(0, i.fundedCents ?? 0) : 0,
  }));
  const totalCommit = counted.reduce((s, c) => s + c.commit, 0);
  const totalFunded = counted.reduce((s, c) => s + c.funded, 0);

  const rows: CapRow[] = counted.map(({ i, commit, funded }) => {
    const letters = sideLetters.filter((l) => l.onboardingId === i.id && l.status !== "terminated" && l.status !== "declined");
    const live = letters.find((l) => letterLive(l, today)) ?? null;
    const anyLetter = live ?? letters[0] ?? null;
    const ct = (i.classKey && classTerms[i.classKey]) || baseTerms;
    const override = (cat: string) => {
      if (!live) return null;
      const t = live.terms.find((x) => x.category === cat);
      return t ? t.value || t.description : null;
    };
    return {
      ...i,
      commitmentCountedCents: commit,
      fundedCountedCents: funded,
      pctCommitted: pct(commit, totalCommit),
      pctFunded: pct(funded, totalFunded),
      sideLetter: anyLetter
        ? {
            id: anyLetter.id,
            status: live ? "active" : anyLetter.status === "proposed" ? "proposed" : "expired",
            mfn: anyLetter.mfnEnabled,
            termCount: anyLetter.terms.length,
          }
        : null,
      terms: [
        { label: "Management fee", classValue: ct.managementFeePercent, overrideText: override("fee_discount") },
        { label: "Carry", classValue: ct.carryPercent, overrideText: override("carry_reduction") },
        { label: "Preferred return", classValue: ct.preferredReturnPercent, overrideText: null },
      ],
    };
  });

  const byClass = new Map<string, { classKey: string; investors: number; commitCents: number; fundedCents: number }>();
  for (const r of rows) {
    const k = r.classKey || "Unassigned";
    const c = byClass.get(k) ?? { classKey: k, investors: 0, commitCents: 0, fundedCents: 0 };
    c.investors += 1;
    c.commitCents += r.commitmentCountedCents;
    c.fundedCents += r.fundedCountedCents;
    byClass.set(k, c);
  }
  const classes = [...byClass.values()].map((c) => ({
    ...c,
    pctCommitted: pct(c.commitCents, totalCommit),
    pctFunded: pct(c.fundedCents, totalFunded),
  }));

  return {
    rows: rows.sort((a, b) => b.commitmentCountedCents - a.commitmentCountedCents),
    classes,
    totals: { investors: rows.length, commitCents: totalCommit, fundedCents: totalFunded },
  };
}

export function readTerms(t: any): ClassTerms {
  return {
    managementFeePercent: num(t?.managementFee?.ratePercent ?? t?.managementFeePercent),
    carryPercent: num(t?.carry?.ratePercent ?? t?.carryPercent),
    preferredReturnPercent: num(t?.preferredReturnPercent),
  };
}
function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function capTableCsv(rows: CapRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Investor", "Profile", "Class", "Stage", "Commitment", "Funded", "Units", "% committed", "% funded", "Mgmt fee", "Carry", "Side letter", "MFN"];
  const lines = rows.map((r) => [
    r.investorName, r.profileName, r.classKey, r.stage,
    (r.commitmentCountedCents / 100).toFixed(2), (r.fundedCountedCents / 100).toFixed(2), r.units,
    r.pctCommitted, r.pctFunded,
    r.terms[0]?.overrideText ?? r.terms[0]?.classValue, r.terms[1]?.overrideText ?? r.terms[1]?.classValue,
    r.sideLetter?.status ?? "none", r.sideLetter?.mfn ? "yes" : "no",
  ].map(esc).join(","));
  return [head.map(esc).join(","), ...lines].join("\n");
}
