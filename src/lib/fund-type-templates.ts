/** Pure: which approved templates are assigned to a fund type (case-insensitive). */
export type AssignableTemplate = { id: string; title: string; fundTypes: string[]; approvedVersion: number | null };

export function templatesForFundType<T extends AssignableTemplate>(templates: T[], fundType: string | null): T[] {
  const ft = (fundType ?? "").trim().toLowerCase();
  if (!ft) return [];
  return templates.filter((t) => t.approvedVersion != null && t.fundTypes.some((x) => x.trim().toLowerCase() === ft));
}
