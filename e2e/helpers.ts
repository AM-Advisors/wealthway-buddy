import type { Page } from "@playwright/test";

/**
 * Synthetic QA accounts only. Each is a JSON session file produced in the QA
 * project; nothing here ever points at production.
 */
export const SESSIONS = {
  staff: process.env["E2E_STAFF_SESSION"],
  manager: process.env["E2E_MANAGER_SESSION"],
  investor: process.env["E2E_INVESTOR_SESSION"],
} as const;

export function refuseProduction() {
  const base = process.env["E2E_BASE_URL"] ?? "http://localhost:8080";
  if (/harmonious\.co|wealthway-buddy/.test(base)) throw new Error("E2E tests must never run against production.");
}

/** Restores a Supabase session saved as { storage_key, session } JSON. */
export async function signInAs(page: Page, sessionJson: string | undefined) {
  if (!sessionJson) return false;
  const { storage_key, session } = JSON.parse(sessionJson);
  await page.goto("/robots.txt");
  await page.evaluate(([k, v]) => window.localStorage.setItem(k as string, v as string), [storage_key, JSON.stringify(session)]);
  return true;
}
