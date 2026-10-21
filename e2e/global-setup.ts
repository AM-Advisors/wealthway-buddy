import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { assertQaEvidence, parseQaSession, type QaEvidence } from "./qa-safety";

/** No navigation, session minting, fixtures, or mutations in preflight. */
export default async function globalSetup() {
  const path = process.env["E2E_QA_EVIDENCE_FILE"];
  const base = process.env["E2E_BASE_URL"];
  if (!path || !base) throw new Error("BLOCKED: reviewed QA evidence and an explicit QA origin are required; no browser tests ran.");
  const evidence = JSON.parse(readFileSync(path, "utf8")) as QaEvidence;
  const actual = JSON.parse(execFileSync("lovable", ["supabase", "info", "--json"], { encoding: "utf8" }));
  assertQaEvidence(evidence, actual, base);
  // Bind the configured frontend backend, not just a preview hostname.
  const configured = process.env["VITE_SUPABASE_URL"];
  if (!configured || new URL(configured).hostname !== `${evidence.backendId}.supabase.co`) throw new Error("BLOCKED: frontend backend binding is unverified.");
  const sessions = ["E2E_STAFF_SESSION", "E2E_MANAGER_SESSION", "E2E_INVESTOR_SESSION", "E2E_UNVERIFIED_SESSION", "E2E_CAPTABLE_SESSION", "E2E_CAPTABLE_UNPAID_SESSION"].map(key => parseQaSession(process.env[key], evidence));
  const ids = [...new Set(sessions.map(s => s.session.user.id))];
  if (ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("BLOCKED: invalid synthetic account identity.");
  const query = `select p.user_id,p.is_test_demo,coalesce((select json_agg(r.role) from public.user_roles r where r.user_id=p.user_id),'[]'::json) as roles from public.profiles p where p.user_id in (${ids.map(id => `'${id}'`).join(",")})`;
  const result = JSON.parse(execFileSync("lovable", ["supabase", "query", query, "--json"], { encoding: "utf8" }));
  const rows = Array.isArray(result) ? result : result.rows;
  if (!Array.isArray(rows) || ids.some(id => !rows.some((r: { user_id: string; is_test_demo: boolean }) => r.user_id === id && r.is_test_demo === true))) throw new Error("BLOCKED: backend synthetic-account classification is unverified.");
  const reviewer = sessions[0];
  if (!reviewer || !rows.some((r: { user_id: string; roles: string[] }) => r.user_id === reviewer.session.user.id && Array.isArray(r.roles) && r.roles.some(role => ["admin", "super_admin", "operations"].includes(role)))) throw new Error("BLOCKED: synthetic Harmonious reviewer authority is unverified.");
}