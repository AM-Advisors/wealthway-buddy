/** Only explicit, unique links within the current fund may replace a legacy destination. */
export function linkedInvestorRecords<T extends { onboardingId: string; applicationId?: string | null; offeringId?: string | null }>(fundId: string, records: readonly T[]): Map<string, T> {
  const linked = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const record of records) {
    if (record.offeringId !== fundId || !record.applicationId) continue;
    if (linked.has(record.applicationId)) ambiguous.add(record.applicationId);
    else linked.set(record.applicationId, record);
  }
  for (const id of ambiguous) linked.delete(id);
  return linked;
}