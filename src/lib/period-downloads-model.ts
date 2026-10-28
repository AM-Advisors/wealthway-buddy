/** Pure helpers for the quarterly / yearly client downloads (billing statement,
 *  invoice bundle, fund financial report). Reads only records the caller was
 *  already entitled to load; never includes drafts. */

export type PeriodKind = "quarter" | "year";
export type Period = { kind: PeriodKind; year: number; quarter?: 1 | 2 | 3 | 4 };

export function periodRange(p: Period): { start: string; end: string; label: string; slug: string } {
  if (p.kind === "year") {
    return { start: `${p.year}-01-01`, end: `${p.year}-12-31`, label: `Year ${p.year}`, slug: `${p.year}` };
  }
  const q = p.quarter ?? 1;
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(p.year, endMonth, 0)).getUTCDate();
  const mm = (m: number) => String(m).padStart(2, "0");
  return {
    start: `${p.year}-${mm(startMonth)}-01`,
    end: `${p.year}-${mm(endMonth)}-${lastDay}`,
    label: `Q${q} ${p.year}`,
    slug: `${p.year}-Q${q}`,
  };
}

/** The date an invoice is filed under: its service period start, else its issue date. */
export function invoicePeriodDate(inv: { period_start?: string | null; issue_date?: string | null }): string | null {
  return (inv.period_start || inv.issue_date || null) as string | null;
}

export function invoicesInPeriod<T extends { status?: string | null; period_start?: string | null; issue_date?: string | null }>(
  invoices: T[],
  p: Period,
): T[] {
  const { start, end } = periodRange(p);
  return invoices.filter((inv) => {
    if (!inv.status || inv.status === "draft") return false;
    const d = invoicePeriodDate(inv);
    return !!d && d >= start && d <= end;
  });
}

export type StatementTotals = { billedCents: number; paidCents: number; remainingCents: number; cancelledCents: number; count: number };

export function statementTotals(
  invoices: { status?: string | null; total_cents?: number | null; paid_cents?: number | null; balance_cents?: number | null }[],
  balance: (inv: any) => { paidCents: number; remainingCents: number },
): StatementTotals {
  const t: StatementTotals = { billedCents: 0, paidCents: 0, remainingCents: 0, cancelledCents: 0, count: 0 };
  for (const inv of invoices) {
    const total = Number(inv.total_cents ?? 0);
    if (inv.status === "void") {
      t.cancelledCents += total;
      continue;
    }
    const b = balance(inv);
    t.count += 1;
    t.billedCents += total;
    t.paidCents += b.paidCents;
    t.remainingCents += b.remainingCents;
  }
  return t;
}

export function reportsInPeriod<T extends { period_end?: string | null }>(reports: T[], p: Period): T[] {
  const { start, end } = periodRange(p);
  return reports.filter((r) => !!r.period_end && r.period_end >= start && r.period_end <= end);
}

/** Flattens a published statement payload into label / amount rows. */
export function reportRows(payload: any): { section: string; label: string; amountCents: number }[] {
  const out: { section: string; label: string; amountCents: number }[] = [];
  const walk = (node: any, section: string, depth: number) => {
    if (!node || depth > 4) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object" && typeof item.label === "string" && typeof item.amountCents === "number") {
          out.push({ section: String(item.section ?? section), label: item.label, amountCents: item.amountCents });
        } else walk(item, section, depth + 1);
      }
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === "provenance") continue;
        if (typeof v === "number" && /Cents$/.test(k) && depth > 0) {
          out.push({ section: "Totals", label: humanize(k.replace(/Cents$/, "")), amountCents: v });
        } else if (typeof v === "object") walk(v, section === "" ? humanize(k) : section, depth + 1);
      }
    }
  };
  walk(payload, "", 0);
  return out;
}

function humanize(key: string) {
  const s = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function safeFilePart(text: string) {
  return String(text || "client").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "client";
}
