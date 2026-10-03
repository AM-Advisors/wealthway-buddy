/**
 * Harmonious internal staff model (Phase 3.10) - a compatibility map only.
 * Legacy roles keep working unchanged; this translates them into
 * "Harmonious staff + team". Nothing here grants access by itself.
 */
import { OPS_STAFF_ROLES } from "@/lib/ops-capabilities";

export type HarmoniousTeam = "operations" | "sales" | "finance" | "compliance" | "management";

const TEAM_BY_ROLE: Record<string, HarmoniousTeam[]> = {
  admin: ["operations"],
  operations: ["operations"],
  fund_administration: ["operations"],
  client_success: ["operations"],
  tax: ["finance"],
  finance: ["finance"],
  legal: ["compliance"],
  compliance: ["compliance"],
  executive: ["management"],
  super_admin: ["management"],
  sales: ["sales"],
  sales_management: ["sales", "management"],
  cro: ["sales", "management"],
  account_manager: ["sales"],
};

export type StaffProfile = {
  isHarmoniousStaff: boolean;
  teams: HarmoniousTeam[];
  /** Opens Operations screens (unchanged legacy rule; Sales does not). */
  operationsAccess: boolean;
  /** Elevated authority - never implied by Operations. */
  superUser: boolean;
  /** Sales access is commercial only: no investor, tax, KYC, bank or evidence data. */
  commercialOnly: boolean;
};

export function staffProfile(roles: readonly string[]): StaffProfile {
  const teams = [...new Set(roles.flatMap((r) => TEAM_BY_ROLE[r] ?? []))];
  const operationsAccess = roles.some((r) => (OPS_STAFF_ROLES as readonly string[]).includes(r));
  return {
    isHarmoniousStaff: teams.length > 0,
    teams,
    operationsAccess,
    superUser: roles.includes("super_admin"),
    commercialOnly: !operationsAccess && teams.includes("sales"),
  };
}
