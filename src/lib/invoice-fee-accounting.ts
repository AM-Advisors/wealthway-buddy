export type FeeTarget = { id: string; client_id: string; kind: "fund" | "company"; name: string };
export type FeeLine = { id: string; offering_id?: string | null; amount_cents: number; service_key?: string | null };
export function feeTargetError(clientId: string, line: FeeLine, target: FeeTarget): string | null {
  if (target.client_id !== clientId) return "Choose a fund or company belonging to this client.";
  if (line.offering_id && (target.kind !== "fund" || target.id !== line.offering_id)) return "This fee already belongs to a recorded fund. Its invoice terms cannot be reassigned.";
  return null;
}
export function feeEligible(status: string, line: FeeLine): boolean {
  return ["issued", "paid"].includes(status) && Number.isSafeInteger(line.amount_cents) && line.amount_cents > 0 && line.service_key !== "BOOKKEEPING_ACCOUNTING";
}
export function feeSource(lineId: string) { return { table: "invoice_lines", id: lineId }; }