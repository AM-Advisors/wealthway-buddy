/** A SOW line with no price, no reason and not at-cost was never quoted; it must not become an agreed $0 price. */
export function isUnpricedSowLine(l: { standard_cents?: unknown; final_cents?: unknown; pass_through?: unknown; adjustment_reason?: unknown }): boolean {
  if (l.pass_through) return false;
  if (typeof l.adjustment_reason === "string" && l.adjustment_reason.trim()) return false;
  const std = l.standard_cents == null ? 0 : Number(l.standard_cents);
  const fin = l.final_cents == null ? 0 : Number(l.final_cents);
  return std === 0 && fin === 0;
}
