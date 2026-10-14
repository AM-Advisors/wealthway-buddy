/** Sends waiting fund-manager updates after a save. Skipped in unit tests (no email stack). Never fails the save. */
export async function kickFundAlerts() {
  if (process.env["VITEST"]) return;
  try {
    // Previously re-imported itself, recursing until the server ran out of memory.
    await (await import("@/lib/manager-alerts.server")).sendPendingFundAlerts();
  } catch (e) {
    console.error("[fund-alerts-kick] failed", e);
  }
}
