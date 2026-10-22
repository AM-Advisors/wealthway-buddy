/** Pure resolver: what each investor pays. Order: fund default → class → active side letter; a pending side letter is shown as proposed, never applied. Display only. */
export type Rate = number | null;
export type EconClass = { key: string; name: string; fee: Rate; carry: Rate };
export type EconLetter = { id: string; onboardingId: string | null; status: string; fee: Rate; carry: Rate };
export type EconInvestor = { id: string; investor: string; classKey: string | null; stage: string };
export type EconRow = {
  id: string; investor: string; className: string | null; fee: Rate; carry: Rate;
  source: string; proposed: { fee: Rate; carry: Rate } | null; letterId: string | null; locked: boolean;
};

export const LOCKED_STAGES = new Set(["signature", "harmonious_review", "approved_to_fund", "awaiting_funds", "complete", "closed"]);

/** Reads a rate like "0%", "1.5 %", "waived" from a side-letter term value. */
export function parseRate(v: string | null | undefined): Rate {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "waived" || s === "none") return 0;
  const n = Number(s.replace(/[%\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function letterRates(terms: { category: string; value?: string | null }[] | null | undefined) {
  const t = terms ?? [];
  return {
    fee: parseRate(t.find((x) => x.category === "fee_discount")?.value),
    carry: parseRate(t.find((x) => x.category === "carry_reduction")?.value),
  };
}

export function resolveEconomics(
  defaults: { fee: Rate; carry: Rate },
  classes: EconClass[],
  investors: EconInvestor[],
  letters: EconLetter[],
): EconRow[] {
  const cls = new Map(classes.map((c) => [c.key, c]));
  return investors.map((i) => {
    const c = i.classKey ? cls.get(i.classKey) ?? null : null;
    let fee = c?.fee ?? defaults.fee;
    let carry = c?.carry ?? defaults.carry;
    let source = c ? c.name : "Fund default";
    const mine = letters.filter((l) => l.onboardingId === i.id);
    const active = mine.find((l) => l.status === "active");
    if (active) {
      if (active.fee != null) fee = active.fee;
      if (active.carry != null) carry = active.carry;
      source = "Side letter";
    }
    const pending = mine.find((l) => l.status === "proposed");
    return {
      id: i.id, investor: i.investor, className: c?.name ?? null, fee, carry, source,
      proposed: pending ? { fee: pending.fee ?? fee, carry: pending.carry ?? carry } : null,
      letterId: (active ?? pending)?.id ?? null,
      locked: LOCKED_STAGES.has(i.stage),
    };
  });
}

export const fmtRate = (r: Rate) => (r == null ? "—" : `${r}%`);
