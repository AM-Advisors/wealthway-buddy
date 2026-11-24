/**
 * MSA/SOW with no end or renewal date: ongoing (non-terminating) contract that renews
 * automatically every year on its effective-date anniversary. Explicit terms always win.
 */
export const EVERGREEN_DOC_TYPES = new Set(["msa", "sow", "engagement"]);

export function appliesEvergreenDefault(docType: string | null | undefined, opts: { endDate: string | null | undefined; autoRenews: boolean | null | undefined }) {
  return EVERGREEN_DOC_TYPES.has(String(docType ?? "")) && !opts.endDate && opts.autoRenews !== false;
}

/** Next anniversary of `effective` strictly after `today` (YYYY-MM-DD). Feb 29 falls to Feb 28. */
export function nextAnniversary(effective: string, today: string): string {
  const [y, m, d] = effective.slice(0, 10).split("-").map(Number) as [number, number, number];
  const ty = Number(today.slice(0, 4));
  for (let year = Math.max(y + 1, ty); ; year++) {
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const s = `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    if (s > today.slice(0, 10)) return s;
  }
}

export const EVERGREEN_LABEL = "Ongoing, renews annually";
export function evergreenShort(effective: string | null | undefined, today: string) {
  if (!effective) return "Ongoing · renews annually";
  const next = nextAnniversary(effective, today);
  const md = new Date(`${next}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return `Ongoing · renews annually on ${md}`;
}
