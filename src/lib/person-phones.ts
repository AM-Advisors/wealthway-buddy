/** Secondary phones are contact-only, never authentication destinations. */
export function cleanSecondaryPhone(value: string | null | undefined) {
  const input = (value ?? "").trim();
  if (!input) return { ok: true as const, value: null };
  const compact = input.replace(/[\s().-]/g, "");
  const normalized = /^1\d{10}$/.test(compact) ? `+${compact}` : compact;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return { ok: false as const, error: "Include the country code, for example +1 214-728-6100." };
  return { ok: true as const, value: normalized };
}