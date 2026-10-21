import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseQaSession, type QaEvidence } from "./qa-safety";

/**
 * Synthetic QA accounts only. Each is a JSON session file produced in the QA
 * project; nothing here ever points at production.
 */
export const SESSIONS = {
  staff: process.env["E2E_STAFF_SESSION"],
  manager: process.env["E2E_MANAGER_SESSION"],
  investor: process.env["E2E_INVESTOR_SESSION"],
  unverified: process.env["E2E_UNVERIFIED_SESSION"],
} as const;

export function refuseProduction() {
  if (!process.env["E2E_QA_EVIDENCE_FILE"] || !process.env["E2E_BASE_URL"]) throw new Error("BLOCKED: QA isolation evidence is required.");
}

/** Restores a Supabase session saved as { storage_key, session } JSON. */
export async function signInAs(page: Page, sessionJson: string | undefined) {
  const path = process.env["E2E_QA_EVIDENCE_FILE"];
  if (!path) throw new Error("BLOCKED: QA isolation evidence is required.");
  const evidence = JSON.parse(readFileSync(path, "utf8")) as QaEvidence;
  const { storage_key, session } = parseQaSession(sessionJson, evidence);
  await page.goto("/robots.txt");
  await page.evaluate(([k, v]) => window.localStorage.setItem(k as string, v as string), [storage_key, JSON.stringify(session)]);
  return true;
}
