/** Shows a stored whole-number document/template version as 1.0, 1.1, 1.2… Stored numbers never change. */
export function versionLabel(version: number | string | null | undefined) {
  const n = Number(version);
  if (!Number.isFinite(n) || n < 1) return "";
  return `1.${Math.trunc(n) - 1}`;
}
