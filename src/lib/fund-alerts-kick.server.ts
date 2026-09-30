/** Sends waiting fund-manager updates after a save. Skipped in unit tests (no email stack). */
export async function kickFundAlerts() {
  if (process.env["VITEST"]) return;
  await (await import("@/lib/fund-alerts-kick.server")).kickFundAlerts();
}
